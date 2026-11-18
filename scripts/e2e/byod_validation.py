#!/usr/bin/env python3
"""BYOD fixture seed + canonical n8n workflow validation.

Run on the EC2 host that owns the n8n container:
  python3 scripts/e2e/byod_validation.py seed
  python3 scripts/e2e/byod_validation.py validate
  python3 scripts/e2e/byod_validation.py cleanup

The script intentionally reads secrets from the backend container and never
prints them. It writes only redacted evidence to stdout and a result JSON file.
"""
import argparse
import datetime as dt
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import uuid

PROJECT_ID = os.environ.get("E2E_PROJECT_ID", "d946a6a6-02e3-45b4-9a88-61674a186306")
COMMAND_ID = os.environ.get("E2E_COMMAND_ID", "b8860f39-32dd-4c21-908e-43d82950e623")
SEASON_NO = int(os.environ.get("E2E_SEASON_NO", "1"))
EPISODE_NO = int(os.environ.get("E2E_EPISODE_NO", "1"))
N8N_DB = "/var/lib/docker/volumes/n8n_data/_data/database.sqlite"
COMPOSE_DIR = "/home/ec2-user"
BACKEND_GATEWAY = "http://127.0.0.1:3000/v1/anime/internal/workflow/db"
RESULT_PATH = "/home/ec2-user/byod-workflow-validation.json"
TMP_PREFIX = "wf-e2e-validate-"

TARGETS = [
    ("WF-00", "U4pLz7pXmG2OqXlt", {"project_id": PROJECT_ID, "intent": "HEALTH_CHECK", "mode": "SAVE", "episode_no": 1, "season_no": 1, "sessionId": COMMAND_ID}),
    ("WF-01", "UeEXeimGGwqIh84T", {"project_id": PROJECT_ID, "intent": "BIBLE_CHAT", "mode": "SAVE", "episode_no": 1, "season_no": 1, "userPrompt": "Validate the current story bible in one short paragraph."}),
    ("WF-02", "qRUdhg1PNDK2wJk6", {"project_id": PROJECT_ID, "intent": "GENERATE_EPISODE", "mode": "SAVE", "episode_no": 1, "season_no": 1, "episode_number": 1, "season_number": 1, "episode_title": "E2E Validation Episode", "episode_synopsis": "A short action-fantasy validation episode with two scenes.", "user_prompt": "Write a very short two-scene action fantasy episode for validation. Keep it under 250 words.", "project_style": "ANIME", "visual_medium": "ANIME", "command_id": COMMAND_ID, "sessionId": "sess_e2e_wf02"}),
    ("WF-03", "s4RGuFSDlevgD5nC", {"project_id": PROJECT_ID, "mode": "SAVE", "episode_no": 1, "season_no": 1, "total_scenes": 2, "scene_count": 2, "command_id": COMMAND_ID, "sessionId": "sess_e2e_wf03"}),
    ("WF-04", "8q9tF3VE0mLUZQfa", {"project_id": PROJECT_ID, "intent": "ADMIN_STATUS", "mode": "SAVE", "episode_no": 1, "season_no": 1, "rawText": "status"}),
    ("WF-05", "ADPseu4KBfVveYrq", {"project_id": PROJECT_ID, "mode": "QUICK", "episode_no": 1, "season_no": 1, "modality": "IMAGE", "mediaUrl": "https://picsum.photos/seed/anime-e2e/768/768", "character_code_hint": "CHAR_E2E_1", "user_prompt": "Describe the character in this image for anime production."}),
    ("WF-06", "WAB7tCTJSUilOp07", {"project_id": PROJECT_ID, "intent": "CONTINUITY_CHECK", "mode": "SAVE", "episode_no": 1, "season_no": 1, "caller_workflow": "E2E", "script_text": "The hero draws a sword in the rain and faces the rival.", "scenes": [{"scene_order": 1, "description": "Hero draws a sword in the rain."}, {"scene_order": 2, "description": "Rival appears on the rooftop."}], "user_prompt": "Check continuity for the validation episode."}),
    ("WF-07", "zvw63UrbObZhFUiW", {"project_id": PROJECT_ID, "intent": "PUBLISH_NOW", "mode": "SAVE", "episode_no": 1, "season_no": 1, "platforms": ["TELEGRAM"], "force_publish": False, "rawText": "publish validation episode"}),
    ("WF-08", "MrWrz58aRUVTzpLr", {"project_id": PROJECT_ID, "intent": "FETCH_ANALYTICS", "mode": "SAVE", "episode_no": 1, "season_no": 1, "platforms": ["YOUTUBE", "INSTAGRAM"]}),
    ("WF-09", "gT1c0Hpvrwyf9YS6", {"project_id": PROJECT_ID, "intent": "CHECK_CANON", "mode": "SAVE", "episode_no": 1, "season_no": 1, "proposed_events": [{"event_code": "EVT_E2E_1", "description": "The hero protects the village."}], "characters_involved": ["CHAR_E2E_1"]}),
    ("WF-10", "swOEbQV3iNUNmMwu", {"project_id": PROJECT_ID, "intent": "RESOLVE_DEADLOCKS", "mode": "SAVE", "episode_no": 1, "season_no": 1}),
    ("WF-11", "baRqhI9JSob9m5D", {"project_id": PROJECT_ID, "intent": "AUTO_QC", "mode": "SAVE", "episode_no": 1, "season_no": 1, "media_url": "https://api.bnai.dpdns.org/v1/media/telegram/BAACAgUAAxkDAAMSavy8svqzppSuyEwDbppdiKft6S8AAhQiAAKek-lXbJ5Z7faWTYk9BA", "file_size": 193947, "duration_sec": 5}),
    ("WF-12", "2fcuca0HkGxGIYMv", {"project_id": PROJECT_ID, "service_type": "LLM", "estimated_cost_units": 50, "episode_no": 1, "season_no": 1}),
    ("WF-13", "jI39p4vr4CnWhpgw", {"project_id": PROJECT_ID, "mode": "SAVE", "episode_no": 1, "season_no": 1}),
]
# Correct the WF-11 id typo defensively.
TARGETS = [(k, ("baRqhI9JSob9m5oD" if k == "WF-11" else wid), p) for k, wid, p in TARGETS]

for _key, _wid, _payload in TARGETS:
    _payload.setdefault("command_id", COMMAND_ID)


def run(cmd, *, check=True, cwd=COMPOSE_DIR, quiet=True, timeout=None):
    r = subprocess.run(cmd, cwd=cwd, check=False, text=True, capture_output=True,
                       stdin=subprocess.DEVNULL, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"command failed ({r.returncode}): {' '.join(cmd)}\n{r.stderr[-2000:]}")
    if not quiet:
        sys.stderr.write(r.stdout[-4000:])
        sys.stderr.write(r.stderr[-4000:])
    return r


def compose(*args, **kwargs):
    return run(["sudo", "-n", "docker", "compose", *args], **kwargs)


def backend_env(name):
    r = run(["sudo", "-n", "docker", "exec", "ai-backend", "printenv", name], check=False)
    value = (r.stdout or "").strip()
    if not value:
        raise RuntimeError(f"missing backend env {name}")
    return value


def gateway_token():
    return backend_env("ANIME_WORKFLOW_GATEWAY_TOKEN")


def gw(path, method="GET", body=None, prefer=None, project_id=PROJECT_ID):
    payload = {
        "path": path,
        "method": method,
        "body": body,
        "prefer": prefer,
        "command_id": COMMAND_ID,
        "project_id": project_id,
    }
    req = urllib.request.Request(
        BACKEND_GATEWAY,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "x-anime-workflow-token": gateway_token(),
            "x-anime-timestamp": str(int(time.time() * 1000)),
            "x-anime-nonce": f"e2e:{uuid.uuid4()}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"gateway {method} {path.split('?')[0]} -> {e.code}: {detail}") from None
    return json.loads(raw) if raw else None


def ensure(table, match_query, row):
    rows = gw(f"/rest/v1/{table}?select=id&{match_query}&limit=1")
    if rows:
        return rows[0]
    created = gw(f"/rest/v1/{table}", method="POST", body=[row], prefer="return=representation")
    if not created:
        raise RuntimeError(f"insert returned no row for {table}")
    return created[0]


def seed():
    episode = ensure(
        "episodes",
        f"project_id=eq.{PROJECT_ID}&season_no=eq.{SEASON_NO}&episode_no=eq.{EPISODE_NO}",
        {"project_id": PROJECT_ID, "episode_no": EPISODE_NO, "season_no": SEASON_NO,
         "title": "E2E Validation Episode", "current_state": "SCRIPT_DRAFT", "qc_status": "PENDING",
         "scene_count": 3},
    )
    episode_id = episode["id"]
    ensure(
        "episode_states",
        f"project_id=eq.{PROJECT_ID}&season_no=eq.{SEASON_NO}&episode_no=eq.{EPISODE_NO}",
        {"project_id": PROJECT_ID, "episode_no": EPISODE_NO, "season_no": SEASON_NO,
         "episode_id": episode_id, "current_state": "SCRIPT_DRAFT", "state_history": []},
    )
    chars = [
        ("CHAR_E2E_1", "Aarav", "Young warrior with a rain-soaked black cloak."),
        ("CHAR_E2E_2", "Mira", "Sharp-eyed strategist with silver hair."),
        ("CHAR_E2E_3", "Rook", "Rival swordsman in crimson armor."),
    ]
    for code, name, desc in chars:
        ensure(
            "characters",
            f"project_id=eq.{PROJECT_ID}&character_code=eq.{code}",
            {"project_id": PROJECT_ID, "name": name, "character_code": code, "description": desc,
             "visual_dna": {"hair": "black", "clothing": "dark cloak", "negative_prompt": "deformed, extra limbs"},
             "voice_config": {"provider": "Edge TTS", "voice_id": "hi-IN-MadhurNeural", "rate": "+0%", "pitch": "-2Hz"},
             "powers_and_lore": {"powers": [], "inventory": [], "relationships": []}},
        )
    scene_rows = [
        (1, "narration_wide", "Rain-soaked village gate at night, hero enters."),
        (2, "dialogue_closeup", "Hero and Mira argue under a broken lantern."),
        (3, "action", "Rook draws a crimson blade on the rooftop."),
    ]
    for order, category, desc in scene_rows:
        ensure(
            "scenes",
            f"project_id=eq.{PROJECT_ID}&season_no=eq.{SEASON_NO}&episode_no=eq.{EPISODE_NO}&scene_order=eq.{order}",
            {"project_id": PROJECT_ID, "episode_id": episode_id, "episode_no": EPISODE_NO,
             "season_no": SEASON_NO, "scene_order": order, "scene_id": f"E2E-{PROJECT_ID[:8]}-{order}",
             "category": category, "description": desc, "visual_prompt": desc, "status": "READY",
             "needs_image": True, "needs_voice": True, "needs_bgm": True, "needs_subtitles": True,
             "needs_camera_motion": True, "routing": "KEN_BURNS"},
        )
    ensure("story_rules", f"project_id=eq.{PROJECT_ID}&rule_code=eq.E2E_RULE_1",
           {"project_id": PROJECT_ID, "rule_code": "E2E_RULE_1", "rule_text": "The hero never kills an unarmed opponent.",
            "rule_type": "global", "priority": "high"})
    ensure("story_rules", f"project_id=eq.{PROJECT_ID}&rule_code=eq.E2E_RULE_2",
           {"project_id": PROJECT_ID, "rule_code": "E2E_RULE_2", "rule_text": "Rain is a recurring omen in this world.",
            "rule_type": "world", "priority": "medium"})
    ensure("canon_facts", f"project_id=eq.{PROJECT_ID}&fact_key=eq.e2e_hero_name",
           {"project_id": PROJECT_ID, "fact_type": "character", "entity_type": "character", "entity_id": "CHAR_E2E_1",
            "fact_key": "e2e_hero_name", "fact_value": {"name": "Aarav"}, "canon_status": "LOCKED"})
    ensure("canon_facts", f"project_id=eq.{PROJECT_ID}&fact_key=eq.e2e_village_name",
           {"project_id": PROJECT_ID, "fact_type": "location", "entity_type": "location", "entity_id": "LOC_E2E_1",
            "fact_key": "e2e_village_name", "fact_value": {"name": "Rainfall Village"}, "canon_status": "CHANGEABLE"})
    print(json.dumps({"seeded": True, "project_id": PROJECT_ID, "episode_id": episode_id,
                      "episode_no": EPISODE_NO, "season_no": SEASON_NO}, indent=2))


def now_sql():
    return dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def wrapper_nodes(payload, target_id):
    js = "return [{json:" + json.dumps(payload) + "}];"
    nodes = [
        {"id": str(uuid.uuid4()), "name": "Manual Trigger", "type": "n8n-nodes-base.manualTrigger",
         "typeVersion": 1, "position": [-240, 0], "parameters": {}},
        {"id": str(uuid.uuid4()), "name": "Validate Input", "type": "n8n-nodes-base.code",
         "typeVersion": 2, "position": [0, 0], "parameters": {"jsCode": js}},
        {"id": str(uuid.uuid4()), "name": "Execute Target", "type": "n8n-nodes-base.executeWorkflow",
         "typeVersion": 1, "position": [240, 0],
         "parameters": {"workflowId": target_id, "options": {"waitForSubWorkflow": True}}},
    ]
    conns = {
        "Manual Trigger": {"main": [[{"node": "Validate Input", "type": "main", "index": 0}]]},
        "Validate Input": {"main": [[{"node": "Execute Target", "type": "main", "index": 0}]]},
    }
    return nodes, conns


def insert_wrapper(name, payload, target_id):
    wid = TMP_PREFIX + name.lower().replace("-", "")
    nodes, conns = wrapper_nodes(payload, target_id)
    now = now_sql()
    c = sqlite3.connect(N8N_DB)
    c.execute("delete from shared_workflow where workflowId=?", (wid,))
    c.execute("delete from workflow_entity where id=?", (wid,))
    c.execute(
        "insert into workflow_entity(id,name,active,nodes,connections,settings,staticData,pinData,versionId,triggerCount,meta,parentFolderId,createdAt,updatedAt,isArchived,versionCounter,description,activeVersionId,nodeGroups,sourceWorkflowId) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (wid, wid, 0, json.dumps(nodes), json.dumps(conns), json.dumps({"executionOrder": "v1"}), None,
         json.dumps({}), str(uuid.uuid4()), 0, None, None, now, now, 0, 1, None, None, "[]", None),
    )
    c.execute("insert into shared_workflow(workflowId,projectId,role,createdAt,updatedAt) values(?,?,?,?,?)",
              (wid, "DHmXIxR6TKeJcd0d", "workflow:owner", now, now))
    c.commit()
    c.close()
    return wid


def latest_execution(wid):
    c = sqlite3.connect(N8N_DB)
    row = c.execute("select id,status,startedAt,stoppedAt from execution_entity where workflowId=? order by id desc limit 1", (wid,)).fetchone()
    data = c.execute("select data from execution_data where executionId=?", (row[0],)).fetchone()[0] if row else None
    c.close()
    return row, data


def max_execution_id(wid):
    c = sqlite3.connect(N8N_DB)
    row = c.execute("select coalesce(max(id),0) from execution_entity where workflowId=?", (wid,)).fetchone()
    c.close()
    return row[0]


def wait_new_execution(wid, before_id, timeout=180):
    deadline = time.time() + timeout
    while time.time() < deadline:
        c = sqlite3.connect(N8N_DB)
        row = c.execute("select id,status,startedAt,stoppedAt from execution_entity where workflowId=? and id>? order by id asc limit 1", (wid, before_id)).fetchone()
        c.close()
        if row:
            while time.time() < deadline:
                c = sqlite3.connect(N8N_DB)
                current = c.execute("select id,status,startedAt,stoppedAt from execution_entity where id=?", (row[0],)).fetchone()
                c.close()
                if current and current[3]:
                    return current
                time.sleep(2)
            return row
        time.sleep(2)
    return None


def inspect_execution(execution_id, data):
    path = f"/tmp/e2e-exec-{execution_id}.json"
    with open(path, "w") as f:
        f.write(data or "{}")
    js = """
const fs=require('fs'); const {parse}=require('/usr/local/lib/node_modules/n8n/node_modules/flatted');
const j=parse(fs.readFileSync(process.argv[1],'utf8')); const r=j.resultData.runData;
const out={lastNode:j.resultData.lastNodeExecuted, nodes:{}, errors:[]};
for(const [name,runs] of Object.entries(r)){
  out.nodes[name]=runs.map(x=>x.executionStatus);
  for(const x of runs){ if(x.error){ out.errors.push({node:name,message:String(x.error.message||x.error)}); }
    const arr=(x.data&&x.data.main)||[]; for(const branch of arr){for(const it of (branch||[])){const e=it&&it.json&&it.json.error; if(e) out.errors.push({node:name,message:String(e.message||e)});}}
  }
}
console.log(JSON.stringify(out));
"""
    r = compose("run", "-T", "--rm", "--no-deps", "-v", "/tmp:/host-tmp", "--entrypoint", "node", "n8n", "-e", js, f"/host-tmp/e2e-exec-{execution_id}.json", check=False)
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return {"lastNode": None, "errors": [{"node": "inspect", "message": (r.stderr or r.stdout)[-1000:]}], "nodes": {}}


def validate():
    results = []
    compose("up", "-d", "n8n")
    for _ in range(30):
        try:
            with urllib.request.urlopen("http://127.0.0.1:5678/healthz", timeout=2) as resp:
                if resp.status == 200:
                    break
        except Exception:
            time.sleep(2)
    wrappers = {}
    try:
        for key, target_id, payload in TARGETS:
            if key == "WF-00":
                continue
            payload.setdefault("command_id", COMMAND_ID)
            wrappers[key] = insert_wrapper(key, payload, target_id)
        for key, target_id, payload in TARGETS:
            if key == "WF-00":
                continue
            wid = wrappers[key]
            log = f"/home/ec2-user/{wid}.log"
            before_id = max_execution_id(wid)
            r = compose("run", "-T", "--rm", "--no-deps", "--entrypoint", "n8n", "n8n", "execute", "--id", wid, "--rawOutput", check=False)
            with open(log, "w") as f:
                f.write(r.stdout or "")
                f.write("\n---STDERR---\n")
                f.write(r.stderr or "")
            row = wait_new_execution(wid, before_id)
            data = None
            if row:
                c = sqlite3.connect(N8N_DB)
                d = c.execute("select data from execution_data where executionId=?", (row[0],)).fetchone()
                c.close()
                data = d[0] if d else None
            status = row[1] if row else "no_execution"
            detail = inspect_execution(row[0], data) if row else {"lastNode": None, "errors": []}
            results.append({"workflow": key, "target_id": target_id, "execution_id": row[0] if row else None,
                            "status": status, "last_node": detail.get("lastNode"), "errors": detail.get("errors", [])})
            print(f"{key}: {status} last={detail.get('lastNode')} errors={len(detail.get('errors', []))}")
    finally:
        compose("up", "-d", "n8n")
        for _ in range(30):
            time.sleep(2)
            try:
                with urllib.request.urlopen("http://127.0.0.1:5678/healthz", timeout=2) as resp:
                    if resp.status == 200:
                        break
            except Exception:
                continue
        # WF-00 must be exercised through its webhook trigger while n8n is up.
        wf00 = next(t for t in TARGETS if t[0] == "WF-00")
        payload = wf00[2]
        c = sqlite3.connect(N8N_DB)
        before_id = c.execute("select coalesce(max(id),0) from execution_entity where workflowId=?", (wf00[1],)).fetchone()[0]
        c.close()
        status = 0
        body = ""
        for attempt in range(8):
            req = urllib.request.Request("http://127.0.0.1:5678/webhook/api/v1/router", data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    body = resp.read().decode()
                status = resp.status
            except Exception as e:
                body = str(e)
                status = getattr(e, "code", 0)
            if status not in (0, 404):
                break
            time.sleep(3)
        c = sqlite3.connect(N8N_DB)
        row = c.execute("select id,status from execution_entity where workflowId=? and id>? order by id desc limit 1", (wf00[1], before_id)).fetchone()
        if row is None:
            row = c.execute("select id,status from execution_entity where workflowId=? order by id desc limit 1", (wf00[1],)).fetchone()
        if row:
            for _ in range(60):
                c2 = sqlite3.connect(N8N_DB)
                current = c2.execute("select id,status,startedAt,stoppedAt from execution_entity where id=?", (row[0],)).fetchone()
                c2.close()
                if current and current[3]:
                    row = current
                    break
                time.sleep(2)
        c = sqlite3.connect(N8N_DB)
        data = c.execute("select data from execution_data where executionId=?", (row[0],)).fetchone()[0] if row else None
        c.close()
        detail = inspect_execution(row[0], data) if row else {"lastNode": None, "errors": []}
        results.append({"workflow": "WF-00", "target_id": wf00[1], "execution_id": row[0] if row else None,
                        "status": row[1] if row else "no_execution", "http_status": status,
                        "last_node": detail.get("lastNode"), "errors": detail.get("errors", [])})
        print(f"WF-00: HTTP {status} status={row[1] if row else 'no_execution'} last={detail.get('lastNode')} errors={len(detail.get('errors', []))}")
        # Remove temporary wrappers.
        c = sqlite3.connect(N8N_DB)
        for wid in wrappers.values():
            c.execute("delete from shared_workflow where workflowId=?", (wid,))
            c.execute("delete from workflow_entity where id=?", (wid,))
        c.commit()
        c.close()
    with open(RESULT_PATH, "w") as f:
        json.dump({"project_id": PROJECT_ID, "generated_at": dt.datetime.utcnow().isoformat() + "Z", "results": results}, f, indent=2)
    print(f"wrote {RESULT_PATH}")
    failed = [r for r in results if r.get("status") != "success"]
    print(f"summary: {len(results) - len(failed)}/{len(results)} success")
    return 0 if not failed else 1


def cleanup():
    c = sqlite3.connect(N8N_DB)
    rows = [r[0] for r in c.execute("select id from workflow_entity where id like ?", (TMP_PREFIX + "%",))]
    for wid in rows:
        c.execute("delete from shared_workflow where workflowId=?", (wid,))
        c.execute("delete from workflow_entity where id=?", (wid,))
    c.commit()
    c.close()
    print(json.dumps({"removed": rows}))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["seed", "validate", "cleanup"])
    a = p.parse_args()
    if a.action == "seed":
        seed()
    elif a.action == "validate":
        raise SystemExit(validate())
    else:
        cleanup()
