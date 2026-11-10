# Batch 1 Android Cloud CI Report

Date: 2026-11-09
Branch: `opencode/batch-1-foundation`
Status: **CLOUD CI PASS — JVM, INSTRUMENTATION, MAESTRO, LINT, AND APK BUILD**

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

| Check | Evidence | Result |
|---|---|---|
| JVM unit tests | Run `42626123392` | PASS — 24 tests, 0 failed, 0 skipped |
| Compose instrumentation | Run `42626123392`, API 34 emulator | PASS — 116 tests, 0 failed, 0 skipped |
| Maestro smoke | Run `42626123392` | PASS — 2/2 flows |
| Android lint | Run `42626123392` | PASS |
| Debug APK build | Run `42624653122` | PASS |

The first JVM run `42622907233` failed one test because no-context token storage did not cache user role metadata. Commit `19e5890` added in-memory metadata caching. The next instrumentation run `42624028726` failed the owner-navigation test because the secure default role is now `normal_user`; commit `6d1a86b` seeds `owner_admin` explicitly in that test. Run `42626123392` passed all jobs.

## Scope note

These results are emulator and JVM evidence only. No physical-device validation was performed.

## Decision

Android Batch 1 auth/session changes **PASS** cloud CI. Physical-device behavior remains **NOT TESTED**.
