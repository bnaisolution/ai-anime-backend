'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const {
  deriveProjectDefaultDurationSec,
  resolveTargetSelection,
  classifyDuration,
  distributeTargetDuration,
  actualRuntimeSec,
} = H.dist('modules/ai/director/director.duration.js');

const {
  buildActionProposal,
  extractStructuredDirectorAction,
  verifyDirectorActionToken,
} = H.dist('modules/ai/director/director.actions.js');

const { compactDirectorContext } = H.dist('modules/ai/director/director.context.js');

test('project default duration uses story_bible minutes with 24m fallback', () => {
  assert.equal(deriveProjectDefaultDurationSec({ episode_duration_min: 22 }), 1320);
  assert.equal(deriveProjectDefaultDurationSec({}), 1440);
  assert.equal(deriveProjectDefaultDurationSec({ episode_duration_min: 0 }), 1440);
});

test('explicit target wins and conflicts with a materially different executing target', () => {
  const explicit = resolveTargetSelection({ explicitSec: 1500, executingSec: 1440, persistedSec: 1440 });
  assert.equal(explicit.targetDurationSec, 1500);
  assert.equal(explicit.source, 'explicit');
  assert.equal(explicit.conflict, false);

  const conflict = resolveTargetSelection({ explicitSec: 1800, executingSec: 1440 });
  assert.equal(conflict.conflict, true);
  assert.match(conflict.conflictReason, /conflicts/i);
});

test('duration classification stays on target inside tolerance and flags under/over', () => {
  assert.equal(classifyDuration(1440, 1420).status, 'on_target');
  assert.equal(classifyDuration(1440, 1200).status, 'under');
  assert.equal(classifyDuration(1440, 1700).status, 'over');
  assert.equal(classifyDuration(0, 1200).status, 'unknown');
});

test('scene distribution is deterministic and sums exactly to the target', () => {
  const parts = distributeTargetDuration(1440, 7);
  assert.equal(parts.length, 7);
  assert.equal(parts.reduce((a, b) => a + b, 0), 1440);
  assert.deepEqual(parts, distributeTargetDuration(1440, 7));
});

test('actual runtime ignores missing durations and reports them', () => {
  assert.deepEqual(actualRuntimeSec([{ duration_sec: 10 }, { duration_sec: 2.5 }, {}]), {
    totalSec: 13,
    counted: 2,
    missing: 1,
  });
});

test('server-signed action tokens round-trip and reject tampering', () => {
  const proposal = buildActionProposal({
    userId: 'user-1',
    projectId: '11111111-1111-1111-1111-111111111111',
    contextVersion: 'ctx-1',
    targetDurationSec: 1440,
    requested: {
      intent: 'CONTINUE_EPISODE',
      season_no: 1,
      episode_no: 3,
      target_duration_sec: 1500,
      payload: { instruction: 'continue', api_key: 'super-secret' },
    },
  });
  const parsed = verifyDirectorActionToken(proposal.action_id);
  assert.equal(parsed.sub, 'user-1');
  assert.equal(parsed.intent, 'CONTINUE_EPISODE');
  assert.equal(parsed.target_duration_sec, 1500);
  assert.equal(parsed.payload.api_key, '[REDACTED]');
  assert.throws(() => verifyDirectorActionToken(proposal.action_id.slice(0, -2) + 'xx'), /ACTION_INVALID/);
});

test('structured action blocks are extracted and removed from the visible reply', () => {
  const result = extractStructuredDirectorAction(
    'I can prepare episode 4 now.\n<director_actions>{"intent":"CONTINUE_EPISODE","season_no":1,"episode_no":4,"target_duration_sec":1440}</director_actions>'
  );
  assert.equal(result.requested.intent, 'CONTINUE_EPISODE');
  assert.equal(result.requested.episode_no, 4);
  assert.equal(result.reply.includes('<director_actions>'), false);
  assert.match(result.reply, /prepare episode 4/);
});

test('expired action tokens are rejected', () => {
  const proposal = buildActionProposal({
    userId: 'user-1',
    projectId: '11111111-1111-1111-1111-111111111111',
    contextVersion: 'ctx-1',
    targetDurationSec: 1440,
    requested: { intent: 'RUN_QC', episode_no: 1 },
    now: Date.now() - 60 * 60 * 1000,
  });
  assert.throws(() => verifyDirectorActionToken(proposal.action_id), /ACTION_EXPIRED/);
});

test('compact director context stays valid JSON and bounded', () => {
  const context = {
    context_version: 'ctx-1',
    project: { id: 'p1', name: 'Long Project', phase: 'SCRIPT_READY' },
    target: { targetDurationSec: 1440, duration_status: 'on_target' },
    bible: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`field_${i}`, 'x'.repeat(2000)])),
    cast: Array.from({ length: 20 }, (_, i) => ({ name: `Character ${i}` })),
    episode: { episode_no: 1, summary: 'y'.repeat(3000) },
    recent_episodes: Array.from({ length: 20 }, (_, i) => ({ episode_no: i + 1 })),
    recent_commands: Array.from({ length: 20 }, (_, i) => ({ intent: `INTENT_${i}` })),
    pending_actions: 0,
    failed_jobs: 0,
    resources: { byod_provider_count: 1 },
    quota: { rpm_used: 1, rpm_limit: 30 },
  };
  const compact = compactDirectorContext(context);
  assert.ok(compact.length <= 14000);
  const parsed = JSON.parse(compact);
  assert.equal(parsed.target.targetDurationSec, 1440);
});
