'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const androidUi = path.join(root, '../ai-anime-android/app/src/main/java/org/dpdns/bnai/anime/ui');

const PRODUCTION_SCREENS = [
  'episode/EpisodePlannerScreen.kt',
  'preflight/PreflightScreen.kt',
  'production/SceneDetailScreen.kt',
  'project/ProjectViewModel.kt',
  'publish/PublishScreen.kt',
  'qc/QCScreen.kt',
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

test('Android production actions submit through the repository command gateway', () => {
  for (const relative of PRODUCTION_SCREENS) {
    const source = fs.readFileSync(path.join(androidUi, relative), 'utf8');
    assert.match(source, /repository\.submitStudioCommand/, `${relative} must submit a command`);
    assert.doesNotMatch(source, /apiService\.submitCommand/, `${relative} must not bypass the repository`);
  }
});

test('Android UI has no direct command API calls outside the repository', () => {
  const offenders = walk(androidUi).filter((file) => {
    if (!file.endsWith('.kt')) return false;
    return /apiService\.submitCommand/.test(fs.readFileSync(file, 'utf8'));
  });
  assert.deepEqual(offenders, []);
});

test('Approving an episode updates persisted episode approval state', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/modules/anime/approvals/approvals.service.ts'),
    'utf8'
  );
  assert.match(source, /approval_status:\s*'APPROVED'/);
  assert.match(source, /\.from\('episodes'\)/);
});
