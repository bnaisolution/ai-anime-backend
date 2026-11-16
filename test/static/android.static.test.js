'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const androidRoot = path.join(H.repoRoot, 'ai-anime-android');
const mainJava = path.join(androidRoot, 'app/src/main/java/org/dpdns/bnai/anime');
const repository = fs.readFileSync(path.join(mainJava, 'core/network/AnimeRepository.kt'), 'utf8');
const studio = fs.readFileSync(path.join(mainJava, 'ui/studio/StudioViewModel.kt'), 'utf8');
const retrofit = fs.readFileSync(path.join(mainJava, 'core/network/RetrofitClient.kt'), 'utf8');
const api = fs.readFileSync(path.join(mainJava, 'core/network/AnimeApiService.kt'), 'utf8');
const gradle = fs.readFileSync(path.join(androidRoot, 'app/build.gradle.kts'), 'utf8');
const settings = fs.readFileSync(path.join(mainJava, 'ui/settings/SettingsScreen.kt'), 'utf8');

test('X-Project-Id is only sent for a non-blank active project', () => {
  assert.match(retrofit, /activeProject\.isNotBlank\(\)/);
  assert.match(retrofit, /header\("X-Project-Id", activeProject\)/);
});

test('Bearer token is only sent for a non-blank token', () => {
  assert.match(retrofit, /!activeToken\.isNullOrBlank\(\)/);
  assert.match(retrofit, /"Bearer \$activeToken"/);
});

test('createProjectSync declares the canonical POST path', () => {
  assert.match(api, /@POST\("v1\/anime\/projects"\)[\s\S]{0,120}createProjectSync/);
});

test('Android JVM test dependencies and test sources are present', () => {
  assert.match(gradle, /testImplementation\("junit:junit:4\.13\.2"\)/);
  assert.match(gradle, /testImplementation\("io\.mockk:mockk:/);
  assert.equal(fs.existsSync(path.join(androidRoot, 'app/src/test/java/org/dpdns/bnai/anime/core/auth/TokenManagerTest.kt')), true);
  assert.equal(fs.existsSync(path.join(androidRoot, 'app/src/test/java/org/dpdns/bnai/anime/core/network/AnimeApiContractTest.kt')), true);
});

test('Settings saves the nested infrastructure schema consumed by the backend', () => {
  for (const key of ['kaggle_primary', 'telegram_storage', 'github_worker']) {
    assert.match(settings, new RegExp(`"${key}" to mapOf`), `missing nested ${key}`);
  }
  assert.match(settings, /"auto_deploy_kaggle" to gpuChoice\.startsWith\("KAGGLE"\)/);
  assert.match(settings, /infraPayload\["primary_llm_provider"\] = primaryProvider/);
  assert.match(settings, /infraPayload\["groq_api_key"\]/);
  assert.match(settings, /infraPayload\["gemini_api_key"\]/);
});

test('Settings hydrates nested values with legacy flat fallbacks', () => {
  assert.match(settings, /map\(d\["kaggle_primary"\]\)/);
  assert.match(settings, /map\(d\["telegram_storage"\]\)/);
  assert.match(settings, /map\(d\["github_worker"\]\)/);
  assert.match(settings, /kagglePrimary\?\.get\("username"\)/);
  assert.match(settings, /telegram\?\.get\("storage_chat_id"\)/);
  assert.match(settings, /github\?\.get\("repository"\)/);
});
