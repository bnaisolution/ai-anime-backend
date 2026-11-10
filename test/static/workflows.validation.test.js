'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const DIR = path.join(H.backendRoot, 'n8n-workflows');
const ALL_DIR = path.join(H.backendRoot, 'n8n-workflows-all');

function loadWorkflows(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      name,
      path: path.join(dir, name),
      raw: fs.readFileSync(path.join(dir, name), 'utf8'),
      json: JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
    }));
}

function workflowNumber(name) {
  const match = name.match(/wf-?(\d{2})/i);
  return match ? `WF-${match[1]}` : null;
}

function assertNodeContract(workflow, node) {
  const label = `${workflow.name} / ${node.name || '<unnamed>'}`;
  assert.equal(typeof node.name, 'string', `${label}: name`);
  assert.ok(node.name.length > 0, `${label}: non-empty name`);
  assert.equal(typeof node.type, 'string', `${label}: type`);
  assert.ok(node.type.length > 0, `${label}: non-empty type`);
  assert.ok(
    typeof node.typeVersion === 'number' || typeof node.typeVersion === 'string',
    `${label}: typeVersion`
  );
  assert.ok(node.parameters && typeof node.parameters === 'object' && !Array.isArray(node.parameters), `${label}: parameters`);
  assert.ok(node.position && Number.isFinite(node.position[0]) && Number.isFinite(node.position[1]), `${label}: position`);
}

const workflows = loadWorkflows(DIR);

test('canonical workflow inventory is exactly WF-00 through WF-13', () => {
  const numbers = workflows.map((workflow) => workflowNumber(workflow.name)).sort();
  assert.deepEqual(numbers, Array.from({ length: 14 }, (_, index) => `WF-${String(index).padStart(2, '0')}`));
  assert.equal(workflows.length, 14);
  assert.equal(workflows.some((workflow) => /WF-14/i.test(workflow.raw)), false);
  assert.equal(fs.existsSync(path.join(DIR, 'WF-14.json')), false);
});

test('canonical workflow ids and file names are unique', () => {
  const ids = workflows.map((workflow) => workflow.json.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(workflows.map((workflow) => workflow.name)).size, workflows.length);
  for (const workflow of workflows) {
    assert.equal(typeof workflow.json.id, 'string', workflow.name);
    assert.ok(workflow.json.id.length > 0, workflow.name);
    assert.equal(typeof workflow.json.name, 'string', workflow.name);
    assert.ok(workflow.json.name.length > 0, workflow.name);
    assert.equal(typeof workflow.json.active, 'boolean', `${workflow.name}: active must be boolean`);
    assert.ok(Array.isArray(workflow.json.nodes) && workflow.json.nodes.length > 0, workflow.name);
    assert.ok(workflow.json.connections && typeof workflow.json.connections === 'object', workflow.name);
  }
});

test('canonical workflow node names are unique and all connections resolve', () => {
  for (const workflow of workflows) {
    const names = workflow.json.nodes.map((node) => node.name);
    assert.equal(new Set(names).size, names.length, `${workflow.name}: duplicate node names`);
    for (const [source, outputs] of Object.entries(workflow.json.connections)) {
      assert.ok(names.includes(source), `${workflow.name}: missing source ${source}`);
      for (const branches of Object.values(outputs)) {
        for (const branch of branches || []) {
          for (const connection of branch || []) {
            assert.ok(names.includes(connection.node), `${workflow.name}: missing target ${connection.node}`);
          }
        }
      }
    }
  }
});

for (const workflow of workflows) {
  test(`${workflow.name} has complete node parameter contracts`, () => {
    assert.ok(Array.isArray(workflow.json.nodes) && workflow.json.nodes.length > 0);
    for (const node of workflow.json.nodes) {
      assertNodeContract(workflow, node);
    }

    const triggerTypes = [
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.scheduleTrigger',
      'n8n-nodes-base.executeWorkflowTrigger',
      'n8n-nodes-base.chatTrigger',
    ];
    const triggers = workflow.json.nodes.filter((node) => triggerTypes.some((type) => node.type.includes(type)));
    assert.ok(triggers.length > 0, `${workflow.name}: no supported trigger node`);

    for (const node of workflow.json.nodes) {
      if (node.type === 'n8n-nodes-base.code') {
        const code = node.parameters.jsCode || node.parameters.functionCode;
        assert.equal(typeof code, 'string', `${workflow.name} / ${node.name}: code`);
        assert.ok(code.trim().length > 0, `${workflow.name} / ${node.name}: empty code`);
      }
      if (node.type === 'n8n-nodes-base.httpRequest') {
        assert.equal(typeof node.parameters.url, 'string', `${workflow.name} / ${node.name}: url`);
        assert.ok(node.parameters.url.length > 0, `${workflow.name} / ${node.name}: empty url`);
        if (/worker|svara|supertonic|ffmpeg/i.test(node.parameters.url)) {
          const timeout = node.parameters.options?.timeout;
          assert.ok(Number(timeout) > 0, `${workflow.name} / ${node.name}: worker timeout`);
        }
      }
      if (node.type === 'n8n-nodes-base.executeWorkflow') {
        assert.equal(typeof node.parameters.workflowId, 'string', `${workflow.name} / ${node.name}: workflowId`);
        assert.ok(node.parameters.workflowId.length > 0, `${workflow.name} / ${node.name}: empty workflowId`);
      }
    }
  });
}

test('canonical workflows do not commit obvious credentials or secrets', () => {
  const patterns = [
    /eyJ[A-Za-z0-9_-]{20,}/,
    /sk-[A-Za-z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /xoxb-/,
    /service_role/,
    /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/,
  ];
  for (const workflow of workflows) {
    for (const pattern of patterns) {
      assert.equal(pattern.test(workflow.raw), false, `${workflow.name} matches ${pattern}`);
    }
  }
});

test('auxiliary workflow directory is not a canonical source of truth', () => {
  const canonicalIds = new Set(workflows.map((workflow) => workflow.json.id));
  const auxiliary = loadWorkflows(ALL_DIR);
  const duplicates = auxiliary.filter((workflow) => canonicalIds.has(workflow.json.id));
  assert.equal(auxiliary.length, 28);
  assert.equal(duplicates.length, 15);
  assert.ok(duplicates.every((workflow) => workflow.name !== ''));
});

test('workflow activation inventory is reported without changing it', () => {
  const active = workflows.filter((workflow) => workflow.json.active === true);
  const inactive = workflows.filter((workflow) => workflow.json.active === false);
  assert.equal(active.length + inactive.length, 14);
  assert.equal(workflows.every((workflow) => typeof workflow.json.active === 'boolean'), true);
});
