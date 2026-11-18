#!/usr/bin/env python3
"""Read-only hardening drills for tenant isolation and signed media playback.

Safe to run against a live environment: it only performs authenticated GETs,
expects fail-closed responses for tampered or missing credentials, and never
prints secrets.
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


class Drill:
    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")
        self.results = []

    def request(self, method, path, token=None, body=None):
        url = path if path.startswith("http") else self.base + path
        data = None if body is None else json.dumps(body).encode()
        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                raw = response.read()
                return response.status, raw, response.headers
        except urllib.error.HTTPError as error:
            return error.code, error.read(), error.headers

    def check(self, name, ok, detail):
        self.results.append((name, bool(ok), detail))
        print(f"{'PASS' if ok else 'FAIL'} {name}: {detail}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--account", default="/home/ec2-user/.e2e_test_account.json")
    parser.add_argument("--project-id", default="")
    args = parser.parse_args()

    drill = Drill(args.base_url)
    account = json.load(open(args.account))

    status, raw, _ = drill.request("GET", "/health")
    drill.check("health", status == 200, f"HTTP {status}")

    status, raw, _ = drill.request(
        "POST",
        "/api/v1/auth/login",
        body={"email": account["email"], "password": account["password"]},
    )
    if status != 200:
        drill.check("login", False, f"HTTP {status}")
        return 1
    token = json.loads(raw)["access_token"]
    drill.check("login", True, "session issued")

    status, raw, _ = drill.request("GET", "/api/v1/auth/me", token=token)
    me = json.loads(raw).get("user", {}) if status == 200 else {}
    drill.check("identity", status == 200 and me.get("userId") == account["user_id"], f"HTTP {status}")

    status, raw, _ = drill.request("GET", "/v1/anime/tenants/me/database", token=token)
    tenant = json.loads(raw).get("data", {}) if status == 200 else None
    drill.check("tenant binding", status == 200 and tenant is not None, f"HTTP {status}")

    status, raw, _ = drill.request("GET", "/v1/anime/tenants/me/database/health", token=token)
    drill.check("tenant health", status in (200, 409, 503), f"HTTP {status}")

    status, raw, _ = drill.request("GET", "/v1/anime/projects", token=token)
    projects = json.loads(raw).get("data", []) if status == 200 else []
    project_id = args.project_id
    candidates = [project_id] if project_id else [item.get("id", "") for item in projects]
    media_status = 0
    clips = []
    playback = []
    for candidate in candidates:
        if not candidate:
            continue
        media_status, media_raw, _ = drill.request(
            "GET", f"/v1/anime/projects/{candidate}/media", token=token
        )
        media = json.loads(media_raw).get("data", {}) if media_status == 200 else {}
        candidate_clips = media.get("clips", [])
        candidate_playback = [clip for clip in candidate_clips if clip.get("playback_url")]
        if candidate_playback or (not project_id and candidate_clips):
            project_id = candidate
            clips = candidate_clips
            playback = candidate_playback
            break
    drill.check("project list", status == 200 and bool(project_id), f"{len(projects)} project(s)")

    if project_id:
        drill.check("media read", media_status == 200, f"HTTP {media_status}, {len(clips)} clip(s)")
        drill.check("signed playback minted", bool(playback), f"{len(playback)} signed URL(s)")

        if playback:
            url = playback[0]["playback_url"]
            status, _, _ = drill.request("GET", url)
            drill.check("signed playback fetch", status == 200, f"HTTP {status}")

            bare = url.split("?", 1)[0]
            status, _, _ = drill.request("GET", bare)
            drill.check("unsigned playback rejected", status in (401, 403), f"HTTP {status}")

            parsed = urllib.parse.urlsplit(url)
            query = urllib.parse.parse_qs(parsed.query)
            token_value = query.get("token", [""])[0]
            tampered = token_value[:-2] + ("aa" if not token_value.endswith("aa") else "bb")
            bad_url = urllib.parse.urlunsplit(parsed._replace(query=f"token={tampered}"))
            status, _, _ = drill.request("GET", bad_url)
            drill.check("tampered playback rejected", status in (401, 403), f"HTTP {status}")
    else:
        drill.check("media read", False, "no project available")

    status, _, _ = drill.request("GET", "/v1/anime/owner/features", token=token)
    drill.check("owner fail-closed", status in (401, 403), f"HTTP {status}")

    failures = [name for name, ok, _ in drill.results if not ok]
    print(f"\n{len(drill.results) - len(failures)}/{len(drill.results)} drills passed")
    if failures:
        print("failed: " + ", ".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
