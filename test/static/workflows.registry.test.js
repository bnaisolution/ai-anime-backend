'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const DIR = path.join(H.backendRoot, 'n8n-workflows');

const CANONICAL = {
  'StoryWF-00_Main_Router.json': 'U4pLz7pXmG2OqXlt',
  'StoryWF-01.json': 'UeEXeimGGwqIh84T',
  'storywf02.json': 'qRUdhg1PNDK2wJk6',
  'storywf03.json': 's4RGuFSDlevgD5nC',
  'storywf04.json': '8q9tF3VE0mLUZQfa',
  'storywf05.json': 'ADPseu4KBfVveYrq',
  'storywf06.json': 'WAB7tCTJSUilOp07',
  'Storywf07.json': 'zvw63UrbObZhFUiW',
  'Storywf08.json': 'MrWrz58aRUVTzpLr',
  'storywf09.json': 'gT1c0Hpvrwyf9YS6',
  'StoryWf10.json': 'swOEbQV3iNUNmMwu',
  'Storywf11.json': 'baRqhI9JSob9m5oD',
  'StoryWf12.json': '2fcuca0HkGxGIYMv',
  'storywf13.json': 'jI39p4vr4CnWhpgw',
};

const STALE = [
  'BwP2L3HccmQ7dwmJ',
  'S71rbJqn85GNVIVo',
  'IfZyvmWlEijJ6Ccj',
  'k7HsOfo7Veyt8Huk',
  'PFXwsrQDk9nSIkRY',
  'y5DW83fQjvyrzE98',
];

function load() {
  return fs.readdirSync(DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({
      name,
      text: fs.readFileSync(path.join(DIR, name), 'utf8'),
      json: JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')),
    }));
}

function node(workflow, name) {
  const found = workflow.json.nodes.find((item) => item.name === name);
  assert.ok(found, `${workflow.name} has node ${name}`);
  return found;
}

test('every canonical workflow shared.workflowId matches its top-level id', () => {
  for (const workflow of load()) {
    const shared = workflow.json.shared;
    assert.ok(Array.isArray(shared) && shared.length > 0, `${workflow.name} has shared metadata`);
    assert.equal(shared[0].workflowId, workflow.json.id, `${workflow.name} shared id`);
    assert.equal(workflow.json.id, CANONICAL[workflow.name], `${workflow.name} canonical id`);
  }
});

test('no stale workflow ids remain in canonical exports', () => {
  for (const workflow of load()) {
    for (const stale of STALE) {
      assert.equal(workflow.text.includes(stale), false, `${workflow.name} contains ${stale}`);
    }
  }
});

test('canonical exports are inactive until approved for activation', () => {
  for (const workflow of load()) {
    assert.equal(workflow.json.active, false, `${workflow.name} must import inactive`);
  }
});

test('WF-00 routeMap resolves every routed intent to a canonical id', () => {
  const router = load().find((workflow) => workflow.name === 'StoryWF-00_Main_Router.json');
  const code = node(router, 'Mode & R12 Governance Engine').parameters.jsCode;
  for (const [file, id] of Object.entries(CANONICAL)) {
    const wf = file.match(/wf-?(\d{2})/i)[1];
    if (wf === '00' || wf === '07') continue;
    assert.ok(code.includes(id), `routeMap is missing WF-${wf} canonical id`);
  }
  for (const stale of STALE) {
    assert.equal(code.includes(stale), false, `routeMap contains stale id ${stale}`);
  }
});

test('WF-00 preflight resolves the canonical WF-12 quota governor', () => {
  const router = load().find((workflow) => workflow.name === 'StoryWF-00_Main_Router.json');
  const preflight = node(router, 'Pre-Flight 1: WF-12 Quota Governor');
  assert.match(String(preflight.parameters.workflowId), /2fcuca0HkGxGIYMv/);
  assert.doesNotMatch(String(preflight.parameters.workflowId), /y5DW83fQjvyrzE98/);
});

test('WF-02 dispatches the canonical WF-03 id', () => {
  const wf02 = load().find((workflow) => workflow.name === 'storywf02.json');
  const formatter = node(wf02, 'WF-03 Dispatch & Output Formatter');
  assert.match(formatter.parameters.jsCode, /s4RGuFSDlevgD5nC/);
  assert.doesNotMatch(formatter.parameters.jsCode, /IfZyvmWlEijJ6Ccj/);
});

test('WF-04 resolves the canonical WF-07 publisher id with a default', () => {
  const wf04 = load().find((workflow) => workflow.name === 'storywf04.json');
  const publisher = wf04.json.nodes.find((item) =>
    item.type === 'n8n-nodes-base.executeWorkflow' && String(item.name).includes('WF-07'));
  assert.ok(publisher, 'WF-04 invokes WF-07');
  assert.equal(publisher.parameters.workflowId, "={{ $env.WF_07_PUBLISHER_ID || 'zvw63UrbObZhFUiW' }}");
});
