# CPU Worker Test Report

Date: 2026-11-09
Status: **CONTRACT TESTS PASSED — RUNTIME NOT TESTED**

## Summary

| Item | Result |
|---|---|
| Worker commit | `da069d3bb30d2389992cc8de82a9b5bad1e31eea` |
| Contract tests | 5/5 PASS |
| CI run | `42457744833` — PASS |
| Dependency pinning | PASS — exact pins |
| TTS runtime | NOT TESTED |
| FFmpeg render runtime | NOT TESTED |
| Telegram upload runtime | NOT TESTED |
| Worker endpoint authentication | MISSING |

## Test execution

Local command:

```sh
cd anime-cpu-worker
python3 -m pytest tests -q
```

Result:

```text
5 passed
```

CI workflow `.github/workflows/worker-tests.yml` runs the same static contract tests on Python 3.11 and uploads JUnit XML.

## Covered contracts

| Contract | Status |
|---|---|
| `POST /v1/tts/svara` exists | PASS |
| `POST /v1/tts/supertonic` exists | PASS |
| `POST /v1/ffmpeg/render-episode` exists | PASS |
| `GET /health` exists | PASS |
| Pydantic schemas exist | PASS |
| No literal Telegram/AWS/GitHub/OpenAI credentials | PASS |
| Telegram settings are environment-driven | PASS |
| Runtime dependencies are exactly pinned | PASS |

## Not tested

- Loading Svara/Supertonic/VITS models.
- TTS synthesis and audio quality.
- FFmpeg scene rendering, subtitles, concatenation, and output upload.
- Telegram document upload with a live bot.
- Large payloads, timeouts, retries, and concurrency.
- Backend → worker job dispatch and callback.
- Worker authorization, replay protection, and job scope.
- GPU availability and model compatibility.

## Security gap

The FastAPI endpoints have no signed job-scoped authorization. This remains a P0 open item even though contract tests pass.

## Decision

CPU worker contract status is **TESTED AND PASSED**. Runtime/media status is **NOT TESTED**. Do not claim TTS or FFmpeg production readiness.

## Evidence

- `anime-cpu-worker/tests/test_contracts.py`
- `anime-cpu-worker/requirements.txt`
- `anime-cpu-worker/.github/workflows/worker-tests.yml`
- `reports/android-testing/evidence/ci-worker-42457744833/`
