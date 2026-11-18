'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('vision save mode and character code reach WF-05 instead of being hardcoded to QUICK', () => {
  const route = read('src/modules/anime/media/media.routes.ts');
  assert.match(route, /save_to_character/);
  assert.match(route, /character_code/);
  assert.match(route, /Type\.Literal\('SAVE'\)/);

  const service = read('src/modules/anime/media/media.service.ts');
  assert.match(service, /requestedMode === 'SAVE'/);
  assert.match(service, /character_code_hint/);
  assert.match(service, /mode,\s*payload/);
  assert.doesNotMatch(service, /mode:\s*'QUICK',\s*payload:\s*\{ media_url/);

  const workflow = read('n8n-workflows/storywf05.json');
  assert.match(workflow, /effective_mode/);
  assert.match(workflow, /character_code_hint/);
  assert.match(workflow, /Mode Switch \(QUICK vs SAVE\)/);

  const androidDto = fs.readFileSync(path.resolve(root, '../ai-anime-android/app/src/main/java/org/dpdns/bnai/anime/core/network/AnimeApiService.kt'), 'utf8');
  assert.match(androidDto, /save_to_character/);
  assert.match(androidDto, /val mode: String\? = null/);

  const androidRepo = fs.readFileSync(path.resolve(root, '../ai-anime-android/app/src/main/java/org/dpdns/bnai/anime/core/network/AnimeRepository.kt'), 'utf8');
  assert.match(androidRepo, /mode = if \(saveToCharacter\) "SAVE" else "QUICK"/);
});
