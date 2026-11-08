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
