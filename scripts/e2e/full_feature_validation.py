#!/usr/bin/env python3
"""Create and render a full-feature admin anime project on the EC2 host.

Run on the EC2 host:
  sudo -n python3 scripts/e2e/full_feature_validation.py
"""

import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import byod_validation as n8n

API_BASE = os.environ.get("ANIME_API_BASE", "https://api.bnai.dpdns.org").rstrip("/")
ADMIN_EMAIL = os.environ.get("ANIME_E2E_ADMIN_EMAIL", "admin@example.com")
RESULT_PATH = os.environ.get("ANIME_E2E_RESULT_PATH", "/home/ec2-user/full-feature-validation.json")
WF03_ID = os.environ.get("ANIME_E2E_WF03_ID", "s4RGuFSDlevgD5nC")
RUN_TAG = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
VISUAL_MEDIUM = os.environ.get("ANIME_E2E_VISUAL_MEDIUM", "ANIME").strip().upper()
if VISUAL_MEDIUM not in {"ANIME", "3D", "REAL_HUMAN", "LIVE_ACTION", "CINEMATIC"}:
    raise RuntimeError(f"unsupported ANIME_E2E_VISUAL_MEDIUM: {VISUAL_MEDIUM}")
VISUAL_STYLE = "ANIME" if VISUAL_MEDIUM == "ANIME" else "REALISTIC"


def run(cmd, check=True):
    result = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if check and result.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}\n{result.stderr[-1500:]}")
    return result


def backend_env(name):
    result = run(["sudo", "-n", "docker", "exec", "ai-backend", "printenv", name], check=False)
    value = (result.stdout or "").strip()
    if not value:
        raise RuntimeError(f"missing backend env {name}")
    return value


def post_json(url, payload, headers=None):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read().decode()
    return json.loads(raw) if raw else None


def api(path, method="GET", payload=None, token=None, headers=None):
    request = urllib.request.Request(
        f"{API_BASE}{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            **(headers or {}),
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode()
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read().decode(errors="replace")
        raise RuntimeError(f"API {method} {path} -> {error.code}: {raw[:1200]}") from None
    return status, (json.loads(raw) if raw else None)


def admin_token():
    supabase_url = backend_env("SUPABASE_URL").rstrip("/")
    service_key = backend_env("SUPABASE_SERVICE_ROLE_KEY")
    generated = post_json(
        f"{supabase_url}/auth/v1/admin/generate_link",
        {"type": "magiclink", "email": ADMIN_EMAIL},
        {"apikey": service_key, "Authorization": f"Bearer {service_key}"},
    )
    session = post_json(
        f"{supabase_url}/auth/v1/verify",
        {"type": "magiclink", "token_hash": generated["hashed_token"]},
        {"apikey": service_key},
    )
    token = session.get("access_token")
    if not token:
        raise RuntimeError("admin session token was not returned")
    return token


def db(path, method="GET", payload=None, prefer=None, project_id=None):
    base = backend_env("ANIME_SUPABASE_URL").rstrip("/")
    key = backend_env("ANIME_SUPABASE_SERVICE_ROLE_KEY")
    headers = {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(
        f"{base}/rest/v1/{path.lstrip('/')}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read().decode()
    except urllib.error.HTTPError as error:
        raw = error.read().decode(errors="replace")
        raise RuntimeError(f"db {method} {path.split('?')[0]} -> {error.code}: {raw[:1200]}") from None
    return json.loads(raw) if raw else None


def ensure(table, match_query, row, project_id):
    rows = db(f"{table}?select=id&{urllib.parse.quote(match_query, safe='=&._-')}&limit=1", project_id=project_id)
    if rows:
        return rows[0]
    created = db(f"{table}", method="POST", payload=[row], prefer="return=representation", project_id=project_id)
    if not created:
        raise RuntimeError(f"insert returned no row for {table}")
    return created[0]


def build_episode_plan():
    episodes = [
        ("The Bell That Rang Alone", "Aarav follows a ghost bell into the sealed shrine and finds a map made of rain."),
        ("The Girl With Silver Eyes", "Mira offers Aarav a bargain while Rook hunts the same relic from the shadows."),
        ("Ash in the Water", "A river burns black, revealing the first seal of the Hollow Court."),
        ("The Name Below", "Aarav hears his lost brother's voice beneath the shrine and must choose whom to trust."),
        ("Crimson Vow", "Rook forces a duel as the Hollow Court opens its first gate."),
        ("The City That Forgot Rain", "Season two begins in a drought-struck city where memories are traded for water."),
        ("Mirror Market", "Mira returns with a mask that shows every possible betrayal."),
        ("The Silent General", "An undead commander offers Aarav an army at the price of his name."),
        ("What the Storm Kept", "The truth about the ghost bell fractures the group."),
        ("The Last Lantern", "Aarav and Rook face the Hollow King beneath a sky with no stars."),
    ]
    plan = []
    for index, (title, synopsis) in enumerate(episodes):
        season_no = 1 if index < 5 else 2
        episode_no = index + 1 if season_no == 1 else index - 4
        plan.append({"season_no": season_no, "episode_no": episode_no, "title": title, "synopsis": synopsis})
    return plan


def build_bible(name):
    plan = build_episode_plan()
    seasons = []
    for season_no in (1, 2):
        season_episodes = [ep for ep in plan if ep["season_no"] == season_no]
        seasons.append({
            "season_no": season_no,
            "title": "The Hollow Court" if season_no == 1 else "The Drowned Crown",
            "status": "PLANNED",
            "arc": "Aarav uncovers the Hollow Court and learns the ghost bell is a door, not a warning."
            if season_no == 1 else "The door is open; Aarav must reunite the broken guardians before the Hollow King wakes.",
            "goals": "Escalate lore, reveal one mystery per episode, and end each episode on a production-friendly cliffhanger.",
            "blueprint": "Five one-minute episodes with four scenes each: hook, investigation, confrontation, cliffhanger.",
            "episode_start": 1,
            "episode_end": 5,
            "genres": ["Action", "Fantasy", "Mystery", "Drama"],
            "locked": False,
            "prompt_overrides": {},
            "episodes": [
                {"episode_no": ep["episode_no"], "title": ep["title"], "synopsis": ep["synopsis"]}
                for ep in season_episodes
            ],
        })
    return {
        "title": name,
        "logline": "A reluctant shrine keeper follows a ghost bell into a hidden court where every wish costs a memory.",
        "premise": "In a rain-locked city, Aarav discovers that the bell in his family shrine is a seal on the Hollow Court.",
        "world_overview": "The living city of Varsha is built above the drowned kingdom of the Hollow Court. Rain is both currency and memory.",
        "world_name": "Varsha",
        "era": "Post-monsoon feudal future",
        "tone": "Moody action fantasy with intimate character drama and cosmic horror.",
        "themes": ["memory", "loyalty", "inherited guilt", "the price of power"],
        "magic_system": {
            "name": "Rainbinding",
            "rules": "Rainbound pacts store memories in water; every miracle removes one memory from the caster.",
            "cost": "A forgotten name, face, or promise.",
            "limitation": "A rainbinder cannot lie inside a shrine.",
        },
        "main_conflict": "Aarav must close the Hollow Court before it drinks the memories of Varsha, while Rook wants the court opened.",
        "antagonist": "The Hollow King, a memory-eating sovereign sealed beneath the city.",
        "seasons": seasons,
        "bible_approved_at": datetime.now(timezone.utc).isoformat(),
        "bible_approved_by": ADMIN_EMAIL,
        "auto_approve": False,
        "visual_medium": VISUAL_MEDIUM,
        "genre": "Action, Fantasy, Mystery, Drama",
        "total_seasons": 2,
        "episodes_per_season": 5,
        "episode_duration_min": 1,
        "script_word_count": 650,
        "target_episode_count": 10,
        "budget_ceiling": 2500,
    }


def create_project(token, name):
    payload = {
        "name": name,
        "title": name,
        "genre": "Action, Fantasy, Mystery, Drama",
        "visual_medium": VISUAL_MEDIUM,
        "description": "A rain-drowned city, a ghost bell, and a keeper who must remember what everyone else forgot.",
        "premise": "A reluctant shrine keeper follows a ghost bell into a hidden court where every wish costs a memory.",
        "project_format": "SERIES",
        "total_seasons": 2,
        "episodes_per_season": 5,
        "episode_duration_min": 1,
        "script_word_count": 650,
        "target_episode_count": 10,
        "budget_ceiling": 2500,
        "auto_approve": False,
        "story_bible": build_bible(name),
    }
    status, response = api("/v1/anime/projects", method="POST", payload=payload, token=token)
    if status not in (200, 201) or not response or not response.get("data", {}).get("id"):
        raise RuntimeError(f"project create failed: {status} {str(response)[:1000]}")
    return response["data"]


def seed_project(project, token):
    project_id = project["id"]
    now = datetime.now(timezone.utc).isoformat()
    db(
        f"projects?id=eq.{project_id}",
        method="PATCH",
        payload={
            "is_active": True,
            "current_season": 1,
            "current_episode": 1,
            "visual_style": VISUAL_STYLE,
            "visual_medium": VISUAL_MEDIUM,
            "updated_at": now,
        },
        prefer="return=representation",
        project_id=project_id,
    )

    plan = build_episode_plan()
    episode_ids = {}
    for ep in plan:
        episode = ensure(
            "episodes",
            f"project_id=eq.{project_id}&season_no=eq.{ep['season_no']}&episode_no=eq.{ep['episode_no']}",
            {
                "project_id": project_id,
                "season_no": ep["season_no"],
                "episode_no": ep["episode_no"],
                "title": ep["title"],
                "synopsis": ep["synopsis"],
                "current_state": "SCRIPT_DRAFT",
                "qc_status": "PENDING",
                "approval_status": "PENDING",
                "scene_count": 0,
                "target_duration_sec": 60,
                "word_count": 0,
            },
            project_id,
        )
        episode_ids[(ep["season_no"], ep["episode_no"])] = episode["id"]
        ensure(
            "episode_states",
            f"project_id=eq.{project_id}&season_no=eq.{ep['season_no']}&episode_no=eq.{ep['episode_no']}",
            {
                "project_id": project_id,
                "season_no": ep["season_no"],
                "episode_no": ep["episode_no"],
                "episode_id": episode["id"],
                "current_state": "SCRIPT_DRAFT",
                "state_history": [],
            },
            project_id,
        )

    for order, beat in enumerate([
        "A ghost bell rings inside the sealed shrine and Aarav is the only one who hears it.",
        "Aarav finds a rain map that points beneath the city.",
        "Mira warns him that the map is a memory trap.",
        "Rook steals the first seal and reveals he serves the Hollow Court.",
        "Aarav chooses to enter the drowned gate.",
        "The gate whispers his forgotten brother's name.",
    ], start=1):
        ensure(
            "episode_beats",
            f"project_id=eq.{project_id}&season_no=eq.1&episode_no=eq.1&beat_order=eq.{order}",
            {
                "project_id": project_id,
                "season_no": 1,
                "episode_no": 1,
                "beat_order": order,
                "beat_text": beat,
                "beat_type": "event",
                "importance": "high" if order in (1, 4, 5) else "medium",
                "involved_characters": ["CHAR_AARAV", "CHAR_MIRA", "CHAR_ROOK"],
            },
            project_id,
        )

    characters = [
        ("CHAR_AARAV", "Aarav", "Reluctant shrine keeper with rain-dark hair and a cracked brass bell.", "svara_hi_male_hero_01", "male"),
        ("CHAR_MIRA", "Mira", "Silver-eyed strategist in a storm-grey coat with a hidden blade.", "svara_hi_female_hero_01", "female"),
        ("CHAR_ROOK", "Rook", "Crimson-armored rival with a burnt sword and a liar's smile.", "svara_hi_male_villain_01", "male"),
        ("CHAR_HOLLOW", "The Hollow King", "Faceless sovereign of the drowned court, crowned in black rain.", "svara_hi_male_elder_01", "male"),
    ]
    for code, name, description, voice_id, gender in characters:
        char = ensure(
            "characters",
            f"project_id=eq.{project_id}&character_code=eq.{code}",
            {
                "project_id": project_id,
                "name": name,
                "character_code": code,
                "description": description,
                "visual_dna": {
                    "age": "adult",
                    "body": "lean athletic build" if gender == "male" else "agile athletic build",
                    "face": "expressive anime face with sharp eyes",
                    "hair": "rain-dark hair" if code == "CHAR_AARAV" else ("silver hair" if code == "CHAR_MIRA" else "black hair"),
                    "clothing": "dark shrine coat" if code == "CHAR_AARAV" else ("storm-grey coat" if code == "CHAR_MIRA" else "crimson armor"),
                    "weapon": "brass bell" if code == "CHAR_AARAV" else ("hidden blade" if code == "CHAR_MIRA" else "burnt sword"),
                    "color_palette": "deep teal, bone white, ember red",
                    "negative_prompt": "deformed, extra limbs, modern clothes, text, watermark",
                },
                "voice_config": {
                    "provider": "Svara TTS",
                    "voice_id": voice_id,
                    "pitch": 1.0,
                    "speed": 1.0,
                    "emotion_profile": {
                        "neutral": {"pitch": 1.0, "rate": 1.0},
                        "anger": {"pitch": 0.95, "rate": 1.1},
                        "fear": {"pitch": 1.03, "rate": 1.08},
                        "sadness": {"pitch": 0.92, "rate": 0.92},
                    },
                },
                "powers_and_lore": {"powers": ["rainbinding"], "inventory": ["brass bell"], "relationships": []},
                "initial_status": "alive",
                "age_group": "adult",
                "canon_lock_status": "LOCKED" if code in ("CHAR_AARAV", "CHAR_ROOK") else "CHANGEABLE",
                "validation_status": "approved",
            },
            project_id,
        )
        ensure(
            "character_status",
            f"project_id=eq.{project_id}&character_code=eq.{code}",
            {
                "project_id": project_id,
                "character_id": char["id"],
                "character_code": code,
                "status": "alive",
                "status_changed_ep": 0,
                "location": "Varsha",
                "injuries": [],
                "emotional_state": {"default": "guarded"},
                "current_goal": "Protect or open the Hollow Court",
                "power_level": 3 if code != "CHAR_HOLLOW" else 9,
            },
            project_id,
        )

    locations = [
        ("LOC_SHRINE", "The Bell Shrine", "A rain-soaked hilltop shrine with a sealed bronze door."),
        ("LOC_MARKET", "Mirror Market", "A floating night market where memories are traded in glass bottles."),
        ("LOC_GATE", "The Drowned Gate", "A submerged arch beneath Varsha that opens into the Hollow Court."),
    ]
    for code, name, desc in locations:
        ensure(
            "locations",
            f"project_id=eq.{project_id}&location_code=eq.{code}",
            {
                "project_id": project_id,
                "location_code": code,
                "name": name,
                "parent_world": "Varsha",
                "location_type": "sacred_site" if code == "LOC_SHRINE" else "market" if code == "LOC_MARKET" else "dungeon",
                "description": desc,
                "visual_description": desc + " Cinematic anime lighting, wet stone, volumetric rain.",
                "danger_level": 2 if code == "LOC_SHRINE" else 4 if code == "LOC_MARKET" else 8,
                "rules": ["Rainbinding cannot lie inside this place."],
                "landmarks": ["bronze bell", "sealed door"],
            },
            project_id,
        )

    for code, rule, rule_type in [
        ("RULE_MEMORY_COST", "Every rainbinding miracle permanently removes one memory from the caster.", "global"),
        ("RULE_SHRINE_TRUTH", "No rainbinder can speak a deliberate lie inside a shrine.", "world"),
        ("RULE_BELL", "The ghost bell rings only for someone who has already been forgotten.", "mystery"),
        ("RULE_ROOK", "Rook never breaks a promise he has spoken aloud, but he chooses his words carefully.", "character"),
    ]:
        ensure(
            "story_rules",
            f"project_id=eq.{project_id}&rule_code=eq.{code}",
            {"project_id": project_id, "rule_code": code, "rule_text": rule, "rule_type": rule_type, "priority": "high", "active": True},
            project_id,
        )

    for key, value, status in [
        ("hero_name", {"name": "Aarav"}, "LOCKED"),
        ("hero_weapon", {"item": "cracked brass bell"}, "LOCKED"),
        ("village_name", {"name": "Varsha"}, "LOCKED"),
        ("hollow_king_face", {"face": "unknown"}, "CHANGEABLE"),
    ]:
        ensure(
            "canon_facts",
            f"project_id=eq.{project_id}&fact_key=eq.{key}",
            {
                "project_id": project_id,
                "fact_type": "character" if "hero" in key else "location",
                "entity_type": "character" if "hero" in key else "location",
                "entity_id": "CHAR_AARAV" if "hero" in key else "LOC_GATE",
                "fact_key": key,
                "fact_value": value,
                "canon_status": status,
                "approved_by": ADMIN_EMAIL,
                "approved_at": now,
            },
            project_id,
        )

    ensure(
        "mystery_tracker",
        f"project_id=eq.{project_id}&mystery_id=eq.MYST_BROTHER",
        {
            "project_id": project_id,
            "mystery_id": "MYST_BROTHER",
            "created_episode": 1,
            "description": "Why does the drowned gate whisper Aarav's forgotten brother's name?",
            "importance": "high",
            "characters_aware": ["CHAR_AARAV", "CHAR_MIRA"],
            "clues": ["ghost bell", "rain map", "broken family portrait"],
            "planned_reveal_episode": 9,
            "status": "OPEN",
        },
        project_id,
    )
    ensure(
        "mystery_tracker",
        f"project_id=eq.{project_id}&mystery_id=eq.MYST_HOLLOW_KING",
        {
            "project_id": project_id,
            "mystery_id": "MYST_HOLLOW_KING",
            "created_episode": 1,
            "description": "Who sealed the Hollow King, and why does the seal use Aarav's family blood?",
            "importance": "critical",
            "characters_aware": ["CHAR_ROOK"],
            "clues": ["crimson vow", "first seal"],
            "planned_reveal_episode": 10,
            "status": "OPEN",
        },
        project_id,
    )

    ensure(
        "foreshadowing",
        f"project_id=eq.{project_id}&foreshadow_code=eq.FS_BELL",
        {
            "project_id": project_id,
            "foreshadow_code": "FS_BELL",
            "clue": "The bell rings without a hand touching it.",
            "first_appearance_ep": 1,
            "hidden_meaning": "Aarav's brother is still alive inside the seal.",
            "planned_reveal_ep": 9,
            "importance": "high",
            "status": "active",
        },
        project_id,
    )
    ensure(
        "foreshadowing",
        f"project_id=eq.{project_id}&foreshadow_code=eq.FS_RAIN_MAP",
        {
            "project_id": project_id,
            "foreshadow_code": "FS_RAIN_MAP",
            "clue": "The rain map has one street that does not exist above ground.",
            "first_appearance_ep": 1,
            "hidden_meaning": "The map was drawn by the Hollow Court to lure Aarav.",
            "planned_reveal_ep": 6,
            "importance": "medium",
            "status": "active",
        },
        project_id,
    )

    for code, power, level, source, weakness in [
        ("CHAR_AARAV", "Rainbinding", 3, "Family bloodline", "Loses a memory with every miracle."),
        ("CHAR_MIRA", "Mirror Step", 4, "Stolen court magic", "Cannot use it under direct moonlight."),
        ("CHAR_ROOK", "Crimson Vow", 5, "Hollow Court pact", "Every vow binds him physically."),
    ]:
        ensure(
            "power_system",
            f"project_id=eq.{project_id}&character_code=eq.{code}&power_name=eq.{power}",
            {
                "project_id": project_id,
                "character_code": code,
                "power_name": power,
                "power_level": level,
                "max_level": 10,
                "source": source,
                "abilities": ["rain manipulation", "memory echo"],
                "limitations": ["requires rainwater", "costs memory"],
                "cost": "memory",
                "weakness": weakness,
                "counter": "sealed shrines",
                "current_status": "unlocked",
                "first_unlock_ep": 1,
            },
            project_id,
        )

    for code, arc, flaw, goal in [
        ("CHAR_AARAV", "The keeper who learns to remember", "Avoids responsibility", "Close the Hollow Court without losing himself."),
        ("CHAR_MIRA", "The traitor who chooses a side", "Trusts plans more than people", "Find a third path between the court and the city."),
        ("CHAR_ROOK", "The rival who becomes a guardian", "Believes power justifies cruelty", "Open the court and survive its price."),
    ]:
        ensure(
            "character_arcs",
            f"project_id=eq.{project_id}&character_code=eq.{code}&arc_name=eq.{arc}",
            {
                "project_id": project_id,
                "character_code": code,
                "arc_name": arc,
                "arc_type": "redemption" if code != "CHAR_ROOK" else "fall",
                "start_ep": 1,
                "planned_end_ep": 10,
                "current_stage": "beginning",
                "stages": ["beginning", "test", "fracture", "choice", "resolution"],
                "flaw": flaw,
                "goal": goal,
                "internal_conflict": "Duty versus memory",
                "turning_points": ["ghost bell", "betrayal", "last lantern"],
            },
            project_id,
        )

    for a, b, rel, trust in [
        ("CHAR_AARAV", "CHAR_MIRA", "uneasy_allies", 55),
        ("CHAR_AARAV", "CHAR_ROOK", "rivals", 20),
        ("CHAR_MIRA", "CHAR_ROOK", "former_partners", 30),
    ]:
        ensure(
            "character_relationships",
            f"project_id=eq.{project_id}&char_a_code=eq.{a}&char_b_code=eq.{b}",
            {
                "project_id": project_id,
                "char_a_code": a,
                "char_b_code": b,
                "relationship_type": rel,
                "relationship_status": "active",
                "trust_level": trust,
                "strength": trust,
                "start_ep": 1,
                "history": ["shared a secret at the shrine"],
            },
            project_id,
        )

    for code, desc, consequences in [
        ("EVT_BELL", "The ghost bell rings in the sealed shrine.", "Aarav enters the hidden court."),
        ("EVT_MAP", "Aarav finds the rain map.", "The group learns the court is beneath Varsha."),
        ("EVT_BETRAYAL", "Rook steals the first seal.", "The Hollow Court begins to wake."),
        ("EVT_GATE", "Aarav opens the drowned gate.", "A forgotten name returns."),
    ]:
        ensure(
            "timeline_events",
            f"project_id=eq.{project_id}&event_code=eq.{code}",
            {
                "project_id": project_id,
                "event_code": code,
                "season_no": 1,
                "episode_no": 1,
                "event_description": desc,
                "consequences": consequences,
                "characters_involved": ["CHAR_AARAV", "CHAR_MIRA", "CHAR_ROOK"],
                "importance": "high",
            },
            project_id,
        )
        ensure(
            "story_timeline",
            f"project_id=eq.{project_id}&event_code=eq.{code}",
            {
                "project_id": project_id,
                "event_code": code,
                "event_era": "The Rain Year",
                "episode_no": 1,
                "season_no": 1,
                "location": "Varsha",
                "event_description": desc,
                "characters_involved": ["CHAR_AARAV", "CHAR_MIRA", "CHAR_ROOK"],
                "importance": "high",
                "consequences": consequences,
            },
            project_id,
        )

    ensure(
        "story_state",
        f"project_id=eq.{project_id}",
        {
            "project_id": project_id,
            "current_episode": 1,
            "active_characters": ["CHAR_AARAV", "CHAR_MIRA", "CHAR_ROOK"],
            "dead_or_injured": [],
            "open_mysteries": ["MYST_BROTHER", "MYST_HOLLOW_KING"],
            "world_state": {"city": "Varsha", "rain": "unnatural", "seal": "cracking"},
            "character_snapshots": {},
        },
        project_id,
    )

    for season_no in (1, 2):
        ensure(
            "season_summaries",
            f"project_id=eq.{project_id}&season_no=eq.{season_no}",
            {
                "project_id": project_id,
                "season_no": season_no,
                "summary_text": "Aarav uncovers the Hollow Court and its price." if season_no == 1 else "The court opens and the guardians fracture.",
                "key_events": ["ghost bell", "drowned gate"],
                "characters_introduced": ["CHAR_AARAV", "CHAR_MIRA", "CHAR_ROOK"],
                "mysteries_opened": ["MYST_BROTHER", "MYST_HOLLOW_KING"],
                "mysteries_resolved": [],
                "total_episodes": 5,
            },
            project_id,
        )

    for key, value in [
        ("protagonist", {"name": "Aarav", "goal": "close the Hollow Court"}),
        ("antagonist", {"name": "The Hollow King", "goal": "drink Varsha's memories"}),
        ("tone", {"value": "moody action fantasy"}),
    ]:
        ensure(
            "story_memory",
            f"project_id=eq.{project_id}&memory_key=eq.{key}&memory_level=eq.project",
            {
                "project_id": project_id,
                "memory_level": "project",
                "memory_key": key,
                "memory_value": value,
                "importance": "high",
            },
            project_id,
        )

    ensure(
        "bible_versions",
        f"project_id=eq.{project_id}&change_summary=eq.full-feature-seed-{RUN_TAG}",
        {
            "project_id": project_id,
            "season_no": 1,
            "episode_no": 1,
            "bible_snapshot": build_bible(project["name"]),
            "character_snapshot": [{"code": "CHAR_AARAV", "name": "Aarav"}],
            "change_summary": f"full-feature-seed-{RUN_TAG}",
        },
        project_id,
    )

    return episode_ids[(1, 1)]


def dispatch_episode(token, project_id):
    command_id = str(uuid.uuid4())
    payload = {
        "intent": "GENERATE_EPISODE",
        "project_id": project_id,
        "mode": "SAVE",
        "episode_no": 1,
        "season_no": 1,
        "episode_number": 1,
        "season_number": 1,
        "episode_title": "The Bell That Rang Alone",
        "episode_synopsis": "Aarav follows a ghost bell into the sealed shrine and finds a rain map beneath the city.",
        "user_prompt": "Write a compact one-minute anime episode script with four scenes. Use Hindi dialogue, a mystery hook, and a cliffhanger.",
        "project_style": {"visual_style": VISUAL_MEDIUM, "visual_medium": VISUAL_MEDIUM},
        "payload": {
            "episode_title": "The Bell That Rang Alone",
            "episode_synopsis": "Aarav follows a ghost bell into the sealed shrine and finds a rain map beneath the city.",
            "target_duration_sec": 60,
            "visual_medium": VISUAL_MEDIUM,
            "project_style": {"visual_style": VISUAL_STYLE, "visual_medium": VISUAL_MEDIUM},
        },
    }
    status, response = api(
        "/v1/anime/commands",
        method="POST",
        payload=payload,
        token=token,
        headers={"Idempotency-Key": f"full-feature-wf02-{RUN_TAG}-{command_id}"},
    )
    if status not in (200, 202):
        raise RuntimeError(f"command dispatch failed: {status} {str(response)[:1000]}")
    return response["data"]["command"]["id"]


def command_status(project_id, command_id):
    rows = db(
        f"api_commands?select=id,status,payload&id=eq.{command_id}&limit=1",
        project_id=project_id,
    )
    return rows[0] if rows else None


def wait_for_command(project_id, command_id, timeout=900):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        row = command_status(project_id, command_id)
        if row:
            last = row
            state = str(row.get("status") or "").upper()
            if state in {"SUCCEEDED", "FAILED", "CANCELLED", "MANUAL_REVIEW"}:
                return row
        time.sleep(5)
    return last


def fetch_rows(table, query, project_id):
    return db(f"{table}?{query}", project_id=project_id) or []


def seed_scenes(project_id, episode_id):
    db(
        f"clips?project_id=eq.{project_id}&episode_no=eq.1",
        method="DELETE",
        project_id=project_id,
    )
    db(
        f"scenes?project_id=eq.{project_id}&episode_no=eq.1",
        method="DELETE",
        project_id=project_id,
    )
    style_suffix = (
        " Photorealistic live-action cinema, real human actors, 8k RAW footage, "
        "ARRI Alexa cinematography, natural skin texture, volumetric rain, cinematic composition."
        if VISUAL_MEDIUM in {"REAL_HUMAN", "LIVE_ACTION", "CINEMATIC", "3D"}
        else " Masterpiece 2D anime cel-shaded keyframe, ufotable lighting, volumetric rain, cinematic composition."
    )
    scenes = [
        (1, "narration_wide", "Rain-soaked hilltop shrine at dusk, a bronze bell rings by itself.", "बारिश की रात, पुराने मंदिर की घंटियाँ खुद बज उठीं।", "CHAR_AARAV", "neutral", 15),
        (2, "dialogue_closeup", "Aarav reaches for the sealed bronze door, rain streaming down his face.", "ये आवाज़... कोई मुझे बुला रहा है।", "CHAR_AARAV", "fear", 15),
        (3, "dialogue_closeup", "Mira steps out of the shadows, silver eyes reflecting the bell.", "रुको! उस दरवाज़े के पीछे जो है, वो इंसान नहीं है।", "CHAR_MIRA", "anger", 15),
        (4, "action", "Rook raises a burnt crimson sword as the shrine doors crack open.", "देर हो गई, आरव। अब तुम्हारी रक्षा कोई नहीं कर सकता।", "CHAR_ROOK", "anger", 15),
    ]
    sfx_by_scene = {
        1: ["bell_toll"],
        2: ["rain_ambience"],
        3: ["door_creak"],
        4: ["sword_draw", "thunder_rumble"],
    }
    for order, category, desc, voice_text, speaker, emotion, duration in scenes:
        needs_motion = True
        needs_lipsync = category == "dialogue_closeup"
        needs_expression = needs_lipsync
        mouth_visible = needs_lipsync
        routing = "ANIMATEDIFF" if needs_motion else ("LIPSYNC" if needs_lipsync else "KEN_BURNS")
        bgm_hint = {"category": "battle_orchestral" if order == 4 else "cinematic_anime", "mood": emotion}
        ensure(
            "scenes",
            f"project_id=eq.{project_id}&season_no=eq.1&episode_no=eq.1&scene_order=eq.{order}",
            {
                "project_id": project_id,
                "episode_id": episode_id,
                "season_no": 1,
                "episode_no": 1,
                "scene_order": order,
                "scene_id": f"FULL-{project_id[:8]}-{order}",
                "category": category,
                "description": desc,
                "visual_prompt": desc + style_suffix,
                "dialogue_speaker_id": speaker,
                "status": "READY",
                "needs_image": True,
                "needs_voice": True,
                "needs_lipsync": needs_lipsync,
                "needs_motion": needs_motion,
                "needs_expression": needs_expression,
                "needs_camera_motion": True,
                "needs_subtitles": True,
                "needs_bgm": True,
                "needs_sfx": True,
                "mouth_visible": mouth_visible,
                "camera_motion_type": "ANIMATEDIFF" if needs_motion else ("LIPSYNC" if needs_lipsync else "KEN_BURNS"),
                "routing": routing,
                "gpu_priority": "P0" if needs_motion or needs_lipsync else "P1",
                "gpu_required": True,
            },
            project_id,
        )
        ensure(
            "clips",
            f"project_id=eq.{project_id}&season_no=eq.1&episode_no=eq.1&scene_order=eq.{order}",
            {
                "project_id": project_id,
                "season_no": 1,
                "episode_no": 1,
                "scene_order": order,
                "scene_type": category,
                "category": category,
                "description": desc,
                "voice_text": voice_text,
                "subtitle_text": voice_text,
                "voice_id": "svara_hi_male_hero_01" if speaker != "CHAR_MIRA" else "svara_hi_female_hero_01",
                "emotion": emotion,
                "duration_sec": duration,
                "status": "pending",
                "checkpoint_stage": "PENDING",
                "qc_status": "PENDING",
                "needs_image": True,
                "needs_voice": True,
                "needs_lipsync": needs_lipsync,
                "needs_motion": needs_motion,
                "needs_expression": needs_expression,
                "needs_subtitles": True,
                "needs_bgm": True,
                "needs_sfx": True,
                "mouth_visible": mouth_visible,
                "needs_camera_motion": True,
                "camera_motion_type": "ANIMATEDIFF" if needs_motion else ("LIPSYNC" if needs_lipsync else "KEN_BURNS"),
                "routing": routing,
                "routing_hint": routing,
                "gpu_priority": "P0" if needs_motion or needs_lipsync else "P1",
                "bgm_hint": bgm_hint,
                "sfx_hints": sfx_by_scene.get(order, []),
            },
            project_id,
        )
    db(
        f"episodes?project_id=eq.{project_id}&season_no=eq.1&episode_no=eq.1",
        method="PATCH",
        payload={"scene_count": len(scenes), "target_duration_sec": 60},
        prefer="return=representation",
        project_id=project_id,
    )
    return len(scenes)


def worker_job_token(project_id):
    try:
        secret = backend_env("ANIME_WORKER_JOB_TOKEN_SECRET")
    except RuntimeError:
        secret = backend_env("ANIME_WORKER_CALLBACK_SECRET")
    now = int(time.time())
    job_id = f"wf03-{RUN_TAG}"
    claims = {
        "iss": "anime-backend",
        "aud": "anime-cpu-worker",
        "sub": job_id,
        "job_id": job_id,
        "project_id": project_id,
        "tenant_id": None,
        "user_id": "e95248f1-c614-4e42-9c3b-cdafc703673c",
        "scope": ["tts", "ffmpeg", "health"],
        "iat": now,
        "exp": now + 21600,
        "jti": str(uuid.uuid4()),
    }
    payload = base64.urlsafe_b64encode(json.dumps(claims, separators=(",", ":")).encode()).rstrip(b"=").decode()
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    return payload + "." + base64.urlsafe_b64encode(signature).rstrip(b"=").decode()


def infrastructure_payload(project_id):
    sessions = db("kaggle_sessions?select=api_endpoint,worker_token&status=eq.active&order=updated_at.desc&limit=1")
    gpu_url = (os.environ.get("ANIME_E2E_GPU_URL") or (sessions[0].get("api_endpoint") if sessions else "") or "").rstrip("/")
    gpu_token = os.environ.get("ANIME_E2E_GPU_TOKEN") or (sessions[0].get("worker_token") if sessions else "") or ""
    cpu_url = os.environ.get("ANIME_E2E_CPU_URL", "").rstrip("/")
    telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN") or backend_env("TELEGRAM_BOT_TOKEN")
    telegram_chat = os.environ.get("TELEGRAM_STORAGE_CHAT_ID") or backend_env("TELEGRAM_STORAGE_CHAT_ID")
    worker_token = worker_job_token(project_id)
    routing = {
        "preferred_mode": "CUSTOM_GPU",
        "custom_gpu": {"enabled": True, "worker_url": gpu_url, "api_key": gpu_token},
        "kaggle_primary": {"worker_url": gpu_url, "api_key": gpu_token},
    }
    return {
        "gpu_routing": routing,
        "custom_gpu": {"enabled": True, "worker_url": gpu_url, "api_key": gpu_token},
        "github_worker": {"worker_url": cpu_url, "token": worker_token},
        "ffmpeg": {"worker_url": cpu_url, "token": worker_token},
        "tts": {"worker_url": cpu_url, "token": worker_token},
        "telegram_storage": {"bot_token": telegram_token, "storage_chat_id": telegram_chat},
    }


def run_wf03(project_id, command_id, scene_count, timeout=3600):
    episode_rows = db(
        f"episodes?select=target_duration_sec&project_id=eq.{project_id}&season_no=eq.1&episode_no=eq.1&limit=1",
        project_id=project_id,
    )
    target_duration_sec = float((episode_rows[0] if episode_rows else {}).get("target_duration_sec") or 0)
    payload = {
        "project_id": project_id,
        "target_duration_sec": target_duration_sec,
        "mode": "SAVE",
        "visual_medium": VISUAL_MEDIUM,
        "episode_no": 1,
        "season_no": 1,
        "total_scenes": scene_count,
        "scene_count": scene_count,
        "command_id": command_id,
        "sessionId": f"full-feature-wf03-{RUN_TAG}",
        "user_infrastructure": infrastructure_payload(project_id),
    }
    wrapper_id = n8n.insert_wrapper("FULLFEATURE03", payload, WF03_ID)
    try:
        before_id = n8n.max_execution_id(wrapper_id)
        result = n8n.compose(
            "run",
            "-T",
            "--rm",
            "--no-deps",
            "--entrypoint",
            "n8n",
            "n8n",
            "execute",
            "--id",
            wrapper_id,
            "--rawOutput",
            check=False,
        )
        row = n8n.wait_new_execution(wrapper_id, before_id, timeout=timeout)
        data = None
        if row:
            connection = n8n.sqlite3.connect(n8n.N8N_DB)
            found = connection.execute("select data from execution_data where executionId=?", (row[0],)).fetchone()
            connection.close()
            data = found[0] if found else None
        detail = n8n.inspect_execution(row[0], data) if row else {"lastNode": None, "errors": [str(result.stderr or result.stdout)[-1000:]]}
        return {
            "execution_id": row[0] if row else None,
            "status": row[1] if row else "no_execution",
            "last_node": detail.get("lastNode"),
            "errors": detail.get("errors", []),
        }
    finally:
        connection = n8n.sqlite3.connect(n8n.N8N_DB)
        connection.execute("delete from shared_workflow where workflowId=?", (wrapper_id,))
        connection.execute("delete from workflow_entity where id=?", (wrapper_id,))
        connection.commit()
        connection.close()


def redact_url(value):
    text = str(value or "")
    return "present" if text else "missing"


def main():
    token = admin_token()
    resume_id = os.environ.get("ANIME_E2E_PROJECT_ID", "").strip()
    if resume_id:
        _, response = api(f"/v1/anime/projects/{resume_id}", token=token)
        project = response["data"]
        name = project["name"]
    else:
        name = f"Full Feature Anime {RUN_TAG}"
        project = create_project(token, name)
    project_id = project["id"]
    print(json.dumps({"project_id": project_id, "name": name}, indent=2))
    episode_id = seed_project(project, token)
    if os.environ.get("ANIME_E2E_SKIP_WF02", "").lower() in {"1", "true", "yes"}:
        rows = db(f"api_commands?select=id,status&project_id=eq.{project_id}&intent=eq.GENERATE_EPISODE&status=eq.SUCCEEDED&order=created_at.desc&limit=1")
        if not rows:
            raise RuntimeError("no successful GENERATE_EPISODE command to reuse")
        command_id = rows[0]["id"]
        command = rows[0]
        print(json.dumps({"command_id": command_id, "state": "reused"}, indent=2))
    else:
        command_id = dispatch_episode(token, project_id)
        print(json.dumps({"command_id": command_id, "state": "dispatched"}, indent=2))
        command = wait_for_command(project_id, command_id)
    scenes = fetch_rows("scenes", "select=scene_order,status&project_id=eq.%s&season_no=eq.1&episode_no=eq.1&order=scene_order.asc" % project_id, project_id)
    wf02_scene_count = len(scenes)
    resume_render = os.environ.get("ANIME_E2E_RESUME", "").lower() in {"1", "true", "yes"}
    if resume_render and wf02_scene_count > 0:
        scene_count = wf02_scene_count
        print(json.dumps({"render_mode": "resume", "scene_count": scene_count}, indent=2))
    else:
        scene_count = seed_scenes(project_id, episode_id)
    wf03 = run_wf03(project_id, command_id, scene_count)
    episode = fetch_rows(
        "episodes",
        "select=id,title,current_state,qc_status,scene_count,target_duration_sec,telegram_file_id,telegram_url,output_media,script_json&project_id=eq.%s&season_no=eq.1&episode_no=eq.1&limit=1" % project_id,
        project_id,
    )
    clips = fetch_rows(
        "clips",
        "select=scene_order,status,checkpoint_stage,video_url,image_url,audio_url,tg_video_file_id,last_error&project_id=eq.%s&episode_no=eq.1&order=scene_order.asc" % project_id,
        project_id,
    )
    final_episode = episode[0] if episode else {}
    output_media = final_episode.get("output_media") if isinstance(final_episode.get("output_media"), dict) else {}
    result = {
        "project_id": project_id,
        "project_name": name,
        "episode_id": episode_id,
        "command_id": command_id,
        "command_status": (command or {}).get("status"),
        "wf02_scene_count": wf02_scene_count,
        "wf03_scene_count": scene_count,
        "wf03": wf03,
        "episode": {
            "current_state": final_episode.get("current_state"),
            "qc_status": final_episode.get("qc_status"),
            "scene_count": final_episode.get("scene_count"),
            "target_duration_sec": final_episode.get("target_duration_sec"),
            "telegram_file_id": redact_url(final_episode.get("telegram_file_id")),
            "telegram_url": redact_url(final_episode.get("telegram_url")),
            "output_media_keys": sorted(output_media.keys()),
            "final_video_url": redact_url(output_media.get("final_video_url")),
        },
        "clips": [
            {
                "scene_order": clip.get("scene_order"),
                "status": clip.get("status"),
                "checkpoint_stage": clip.get("checkpoint_stage"),
                "has_image": bool(clip.get("image_url")),
                "has_audio": bool(clip.get("audio_url")),
                "has_video": bool(clip.get("video_url")),
                "telegram_file_id": redact_url(clip.get("tg_video_file_id")),
                "last_error": clip.get("last_error"),
            }
            for clip in clips
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(RESULT_PATH, "w") as handle:
        json.dump(result, handle, indent=2)
    print(json.dumps(result, indent=2))
    print(f"wrote {RESULT_PATH}")
    return 0 if wf03.get("status") == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
