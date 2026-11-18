'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const caps = H.dist('modules/ai/director/director.capabilities.js');
const { COMMAND_INTENT_WF_MAP, CommandIntent } = H.dist('modules/anime/commands/commands.types.js');

const RISKS = ['read_only', 'low_risk_write', 'external_side_effect', 'destructive'];
const RESOURCES = [
  'database', 'ai_text', 'ai_vision', 'gpu', 'cpu', 'storage', 'telegram', 'github', 'youtube', 'instagram'
];

test('capability registry is internally consistent', () => {
  const list = caps.listDirectorCapabilities();
  assert.ok(list.length >= 15, 'expected at least 15 Director capabilities');

  const keys = new Set();
  for (const capability of list) {
    assert.equal(capability.key, capability.intent, `key mismatch for ${capability.key}`);
    assert.ok(!keys.has(capability.key), `duplicate capability ${capability.key}`);
    keys.add(capability.key);

    assert.ok(
      Object.values(CommandIntent).includes(capability.intent),
      `unknown intent ${capability.intent}`
    );
    assert.equal(
      capability.workflow,
      COMMAND_INTENT_WF_MAP[capability.intent],
      `workflow mismatch for ${capability.key}`
    );
    assert.ok(RISKS.includes(capability.risk), `bad risk for ${capability.key}`);
    assert.equal(
      capability.requires_confirmation,
      capability.risk !== 'read_only',
      `confirmation gate mismatch for ${capability.key}`
    );
    assert.ok(Array.isArray(capability.required_resources));
    for (const resource of capability.required_resources) {
      assert.ok(RESOURCES.includes(resource), `unknown resource ${resource} on ${capability.key}`);
    }
    assert.ok(capability.version >= 1);
  }
});

test('unknown intents are rejected by the registry', () => {
  assert.equal(caps.getDirectorCapability('NOPE'), null);
  assert.equal(caps.getDirectorCapability(''), null);
  assert.equal(caps.isDirectorExecutableIntent('NOPE'), false);
  assert.equal(caps.isDirectorExecutableIntent('GENERATE_EPISODE'), true);
  assert.equal(caps.isDirectorExecutableIntent('PUBLISH_NOW'), true);
});

test('role ladder is monotonic and reviewer-gated for canon approvals', () => {
  assert.equal(caps.roleSatisfiesIntent('PUBLISH_NOW', 'viewer'), false);
  assert.equal(caps.roleSatisfiesIntent('PUBLISH_NOW', 'editor'), true);
  assert.equal(caps.roleSatisfiesIntent('CHECK_CANON', 'viewer'), true);
  assert.equal(caps.roleSatisfiesIntent('APPROVE_CANON_CHANGE', 'editor'), false);
  assert.equal(caps.roleSatisfiesIntent('APPROVE_CANON_CHANGE', 'reviewer'), true);
  assert.equal(caps.roleSatisfiesIntent('APPROVE_CANON_CHANGE', 'owner'), true);
});

test('prompt catalog exposes production capabilities with resource requirements', () => {
  const catalog = caps.directorActionPromptCatalog();
  assert.match(catalog, /GENERATE_EPISODE/);
  assert.match(catalog, /resources: database, ai_text, gpu, storage/);
  assert.match(catalog, /min role: reviewer/);
  assert.doesNotMatch(catalog, /^$/m);
});

test('risk and resource helpers mirror the manifest', () => {
  assert.equal(caps.directorActionRisk('REGENERATE_EPISODE'), 'destructive');
  assert.equal(caps.directorActionRisk('CHECK_CONTINUITY'), 'read_only');
  assert.deepEqual(caps.requiredResourcesForIntent('RUN_QC'), ['database', 'storage']);
  assert.deepEqual(caps.requiredResourcesForIntent('UNKNOWN'), []);
  assert.equal(caps.CAPABILITY_VERSION.length > 0, true);
});
