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

test('Director retry is owner-scoped and reuses server gates', () => {
  const route = fs.readFileSync(
    path.join(root, 'src/modules/ai/director/director.routes.ts'),
    'utf8'
  );
  const service = fs.readFileSync(
    path.join(root, 'src/modules/ai/director/director.retry.ts'),
    'utf8'
  );
  assert.match(route, /director\/timeline\/:command_id\/retry/);
  assert.match(route, /requireProjectRole\(\['owner', 'admin', 'editor'\]/);
  assert.match(service, /command\.user_id/);
  assert.match(service, /submitAnimeCommand/);
  assert.match(service, /RETRYABLE_STATUSES/);
});

test('Android Director timeline consumes failure reason and retry state', () => {
  const api = fs.readFileSync(
    path.join(root, '../ai-anime-android/app/src/main/java/org/dpdns/bnai/anime/core/network/AnimeApiService.kt'),
    'utf8'
  );
  assert.match(api, /data class DirectorTimelineJobDto/);
  assert.match(api, /failure_reason/);
  assert.match(api, /retryable/);
  assert.match(api, /director\/timeline\/\{command_id\}\/retry/);
});

test('episode QC approval honours WF-11 human-pending state and blocks direct qc_status PATCH', () => {
  const route = fs.readFileSync(path.join(root, 'src/modules/anime/reads/lore.routes.ts'), 'utf8');
  assert.match(route, /PENDING_HUMAN_APPROVAL/);
  assert.match(route, /patch\.qc_status = 'APPROVED'/);
  assert.doesNotMatch(route, /patchData\.qc_status = body\.qc_status/);
});

test('Android episode planning forwards the selected season to the command gateway', () => {
  const planner = fs.readFileSync(path.join(androidUi, 'episode/EpisodePlannerScreen.kt'), 'utf8');
  assert.match(planner, /submitStudioCommand\([\s\S]*seasonNo\s*=\s*selectedSeason/);
});

test('Director clip context is filtered by season', () => {
  const context = fs.readFileSync(path.join(root, 'src/modules/ai/director/director.context.ts'), 'utf8');
  assert.match(context, /from\('clips'\)[\s\S]{0,300}\.eq\('season_no',\s*targetSeason\)/, 'clips query must filter season');
});
