'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const androidRoot = path.join(root, '../ai-anime-android');
const androidUi = path.join(androidRoot, 'app/src/main/java/org/dpdns/bnai/anime/ui');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function readAndroid(relative) {
  return fs.readFileSync(path.join(androidUi, relative), 'utf8');
}

test('WF-02 consumes persisted cast visual DNA and voice configuration', () => {
  const wf02 = read('n8n-workflows/storywf02.json');
  assert.match(wf02, /Fetch Characters & Voice Config/);
  assert.match(wf02, /select=character_code,name,visual_dna,voice_config/);
  assert.match(wf02, /character_voice_map/);
  assert.match(wf02, /voice_id:\s*vc\./);
  assert.match(wf02, /registeredCharCodes/);
});

test('WF-03 consumes persisted cast DNA, reference images and voices', () => {
  const wf03 = read('n8n-workflows/storywf03.json');
  assert.match(wf03, /Fetch Characters & DNA/);
  assert.match(wf03, /select=character_code,name,visual_dna,voice_config,reference_version,image_file_id/);
  assert.match(wf03, /charByCode/);
  assert.match(wf03, /voiceConfig\.voice_id/);
  assert.match(wf03, /charObj\.visual_dna/);
});

test('Bible approval hands off to the scoped studio prefill and first-episode preflight', () => {
  const bible = readAndroid('project/BibleScreen.kt');
  assert.match(bible, /onOpenCharacters/);
  assert.match(bible, /onOpenPreflight/);
  assert.match(bible, /Plan First Episode/);
  assert.match(bible, /loadCastCount\(projectId\)/);
  assert.match(bible, /repository\.fetchCharacters\(targetPid\)/);

  const nav = fs.readFileSync(
    path.join(androidRoot, 'app/src/main/java/org/dpdns/bnai/anime/ui/navigation/AppNavGraph.kt'),
    'utf8'
  );
  assert.match(nav, /onOpenPreflight\s*=\s*\{\s*pid\s*->\s*navController\.navigate\("preflight\/\$pid"\)/);
});

test('First episode planning is not blocked by the scenes readiness check', () => {
  const preflight = readAndroid('preflight/PreflightScreen.kt');
  assert.match(preflight, /key = "scenes"/);
  assert.match(preflight, /fixRoute = "episodes"/);
  assert.match(preflight, /blocking = false/);
  assert.match(preflight, /report\.allReady/);
});
