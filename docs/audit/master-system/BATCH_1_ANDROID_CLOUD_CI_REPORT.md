# Batch 1 Android Cloud CI Report

Date: 2026-11-09
Branch: `opencode/batch-1-foundation`
Status: **BLOCKED — NO CLOUD RUN**

## Scope completed in source

| Change | File |
|---|---|
| Keystore-backed token storage | `core/auth/TokenManager.kt` |
| Refresh-token and expiry persistence | `core/auth/TokenManager.kt` |
| Legacy plaintext preference cleanup | `core/auth/TokenManager.kt` |
| Login session persistence | `ui/auth/AuthViewModel.kt` |
| Refresh and logout API contracts | `core/network/AnimeApiService.kt` |
| OkHttp refresh authenticator and retry | `core/network/RetrofitClient.kt` |
| Backend logout plus local clear | `core/network/AnimeRepository.kt`, `ui/navigation/AppNavGraph.kt` |
| Backup exclusion | `app/src/main/AndroidManifest.xml` |
| Keystore dependency | `app/build.gradle.kts` |

## Tests added

| File | Coverage |
|---|---|
| `TokenManagerTest.kt` | Session refresh token, expiry, owner role, clear |
| `RetrofitClientIsolationTest.kt` | 401 → refresh → retry-once flow |
| `AnimeApiContractTest.kt` | Refresh and logout paths |

## CI status

No Android workflow run exists for this branch. Android builds and tests remain restricted to GitHub Actions Ubuntu x86_64 runners.

Required next steps:

1. Push the Android branch.
2. Open a PR or dispatch `Android Tests` and `Build Anime APK`.
3. Record JVM, instrumentation, lint, Maestro, and APK outcomes.
4. Replace `BLOCKED` only when the cloud run exists.

## Decision

Android implementation is **NOT TESTED**. Do not claim Android completion, APK readiness, or device behavior.
