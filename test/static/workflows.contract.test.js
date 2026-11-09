'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const DIR = path.join(H.backendRoot, 'n8n-workflows');
const ALL_DIR = path.join(H.backendRoot, 'n8n-workflows-all');

const EXPECTED = {
  'StoryWF-00_Main_Router.json': { id: 'U4pLz7pXmG2OqXlt', nodes: 34 },
  'StoryWF-01.json': { id: 'UeEXeimGGwqIh84T', nodes: 33 },
  'storywf02.json': { id: 'qRUdhg1PNDK2wJk6', nodes: 26 },
  'storywf03.json': { id: 's4RGuFSDlevgD5nC', nodes: 38 },
  'storywf04.json': { id: '8q9tF3VE0mLUZQfa', nodes: 30 },
  'storywf05.json': { id: 'ADPseu4KBfVveYrq', nodes: 16 },
  'storywf06.json': { id: 'WAB7tCTJSUilOp07', nodes: 17 },
  'Storywf07.json': { id: 'zvw63UrbObZhFUiW', nodes: 27 },
  'Storywf08.json': { id: 'MrWrz58aRUVTzpLr', nodes: 22 },
  'storywf09.json': { id: 'gT1c0Hpvrwyf9YS6', nodes: 14 },
  'StoryWf10.json': { id: 'swOEbQV3iNUNmMwu', nodes: 14 },
  'Storywf11.json': { id: 'baRqhI9JSob9m5oD', nodes: 15 },
  'StoryWf12.json': { id: '2fcuca0HkGxGIYMv', nodes: 8 },
  'storywf13.json': { id: 'jI39p4vr4CnWhpgw', nodes: 13 },
};

function loadWorkflows(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({
      name,
      path: path.join(dir, name),
      json: JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
    }));
}

test('canonical workflow directory contains exactly 14 JSON files', () => {
  const names = fs.readdirSync(DIR).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(names, Object.keys(EXPECTED).sort());
});

test('every canonical workflow has the expected id and node count', () => {
  for (const workflow of loadWorkflows(DIR)) {
    const expected = EXPECTED[workflow.name];
    assert.ok(expected, `unexpected workflow file ${workflow.name}`);
    assert.equal(workflow.json.id, expected.id, workflow.name);
    assert.equal(workflow.json.nodes.length, expected.nodes, workflow.name);
    assert.ok(workflow.json.name, `${workflow.name} has a name`);
    assert.ok(workflow.json.connections && typeof workflow.json.connections === 'object', `${workflow.name} has connections`);
  }
});

test('canonical workflow ids are unique within the canonical directory', () => {
  const seen = new Map();
  const duplicates = [];
  for (const workflow of loadWorkflows(DIR)) {
    const id = workflow.json.id;
    if (seen.has(id)) duplicates.push(`${id}: ${seen.get(id)} and ${workflow.name}`);
    seen.set(id, workflow.name);
  }
  assert.deepEqual(duplicates, []);
});

test('AUXILIARY INVENTORY: n8n-workflows-all duplicates canonical workflow ids', () => {
  const canonicalIds = new Set(loadWorkflows(DIR).map((workflow) => workflow.json.id));
  const duplicates = loadWorkflows(ALL_DIR).filter((workflow) => canonicalIds.has(workflow.json.id));
  assert.equal(duplicates.length, 15, 'all 14 canonical ids plus the lowercase Storywf09 copy exist in the auxiliary directory');
});

test('every connection references an existing node exactly once', () => {
  for (const workflow of loadWorkflows(DIR)) {
    const nodeNames = new Set(workflow.json.nodes.map((node) => node.name));
    assert.equal(nodeNames.size, workflow.json.nodes.length, `${workflow.name} has duplicate node names`);
    for (const source of Object.keys(workflow.json.connections)) {
      assert.ok(nodeNames.has(source), `${workflow.name}: connection source ${source} is missing`);
      const outputs = workflow.json.connections[source].main || [];
      for (const branch of outputs) {
        for (const connection of branch || []) {
          assert.ok(nodeNames.has(connection.node), `${workflow.name}: connection target ${connection.node} is missing`);
        }
      }
    }
  }
});

test('main router exposes the canonical webhook path and chat trigger', () => {
  const router = loadWorkflows(DIR).find((workflow) => workflow.name === 'StoryWF-00_Main_Router.json');
  const nodeTypes = router.json.nodes.map((node) => node.type);
  assert.ok(nodeTypes.some((type) => type.includes('webhook')));
  assert.ok(nodeTypes.some((type) => type.includes('chatTrigger')), 'chat trigger exists');
  const webhook = router.json.nodes.find((node) => node.type.includes('webhook'));
  assert.equal(webhook.parameters.path, 'api/v1/router');
});

test('WF-13 exposes both schedule and executeWorkflow triggers', () => {
  const wf13 = loadWorkflows(DIR).find((workflow) => workflow.name === 'storywf13.json');
  const types = wf13.json.nodes.map((node) => node.type);
  assert.ok(types.some((type) => type.includes('scheduleTrigger')));
  assert.ok(types.some((type) => type.includes('executeWorkflowTrigger')));
});

test('canonical workflows contain no obvious committed credentials', () => {
  const patterns = [
    /eyJ[A-Za-z0-9_-]{20,}/,
    /sk-[A-Za-z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /xoxb-/,
    /service_role/,
  ];
  for (const workflow of loadWorkflows(DIR)) {
    for (const pattern of patterns) {
      assert.equal(pattern.test(fs.readFileSync(workflow.path, 'utf8')), false, `${workflow.name} matches ${pattern}`);
    }
  }
});

test('command intent workflow map only references canonical workflow numbers', () => {
  const { COMMAND_INTENT_WF_MAP } = H.dist('modules/anime/commands/commands.types.js');
  const available = new Set(
    Object.keys(EXPECTED).map((name) => {
      const match = name.match(/wf-?(\d{2})/i);
      return match ? `WF-${match[1]}` : null;
    }).filter(Boolean)
  );
  const missing = [...new Set(Object.values(COMMAND_INTENT_WF_MAP))].filter((key) => !available.has(key));
  assert.deepEqual(missing, []);
});

test('WF-02 dispatches the approved scene plan to WF-03 through executeWorkflow', () => {
  const wf02 = loadWorkflows(DIR).find((workflow) => workflow.name === 'storywf02.json');
  const dispatcher = wf02.json.nodes.find((node) => node.type === 'n8n-nodes-base.executeWorkflow');
  assert.ok(dispatcher, 'WF-02 has an executeWorkflow node');
  assert.equal(dispatcher.parameters.source, 'database');
  assert.match(String(dispatcher.parameters.workflowId), /next_workflow_id/);
  assert.equal(dispatcher.parameters.options.waitForSubWorkflow, false);
  const outbound = wf02.json.connections['WF-03 Dispatch & Output Formatter']?.main?.[0] ?? [];
  assert.deepEqual(outbound.map((connection) => connection.node), [dispatcher.name]);
});

test('WF-02 forwards the IMAGE prompt contract to WF-03', () => {
  const wf02 = loadWorkflows(DIR).find((workflow) => workflow.name === 'storywf02.json');
  const formatter = wf02.json.nodes.find((node) => node.name === 'WF-03 Dispatch & Output Formatter');
  assert.ok(formatter);
  assert.match(formatter.parameters.jsCode, /image_system_prompt/);
  assert.match(formatter.parameters.jsCode, /image_prompt_config/);
});
