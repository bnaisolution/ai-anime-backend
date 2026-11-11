'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const DIR = path.join(H.backendRoot, 'n8n-workflows');
const workflows = fs.readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => ({ name, json: JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')) }));

function httpNodes(workflow) {
  return workflow.json.nodes.filter((node) => node.type === 'n8n-nodes-base.httpRequest');
}

function nodeByName(workflow, name) {
  return workflow.json.nodes.find((node) => node.name === name);
}

test('every workflow dispatches success and failure callbacks', () => {
  for (const workflow of workflows) {
    const success = nodeByName(workflow, 'Backend: Success Callback');
    const failure = nodeByName(workflow, 'Backend: Error Callback');
    assert.ok(success, `${workflow.name}: success callback`);
    assert.ok(failure, `${workflow.name}: error callback`);
    assert.match(String(success.parameters.url), /\/v1\/anime\/internal\/workflow\/callback$/);
    assert.match(String(failure.parameters.url), /\/v1\/anime\/internal\/workflow\/callback$/);
    assert.match(String(success.parameters.jsonBody), /status: ("COMPLETED"|"DISPATCHED"|\(\$)/);
    assert.match(String(failure.parameters.jsonBody), /status: "FAILED"/);
    for (const node of [success, failure]) {
      assert.match(String(node.parameters.jsonBody), /wf_key: "WF-\d{2}"/);
      assert.match(String(node.parameters.jsonBody), /execution_id: \$execution\.id/);
      assert.match(String(node.parameters.jsonBody), /callback_id: \$execution\.id/);
      const headers = node.parameters.headerParameters?.parameters || [];
      const token = headers.find((header) => /^(x-anime-workflow-token|x-anime-workflow-system-token)$/.test(header.name));
      assert.ok(token, `${workflow.name}: callback gateway token`);
      assert.ok(headers.some((header) => header.name === 'x-anime-timestamp'), `${workflow.name}: callback timestamp`);
      assert.ok(headers.some((header) => header.name === 'x-anime-nonce'), `${workflow.name}: callback nonce`);
      assert.equal(headers.some((header) => /^(authorization|apikey)$/i.test(header.name)), false, `${workflow.name}: callback direct credential`);
    }
  }
});

test('every HTTP failure path reaches the error callback and stops', () => {
  for (const workflow of workflows) {
    const errorCallback = nodeByName(workflow, 'Backend: Error Callback');
    const stop = nodeByName(workflow, 'Stop: Workflow Failed');
    assert.ok(stop, `${workflow.name}: stop node`);
    assert.equal(stop.type, 'n8n-nodes-base.stopAndError');
    const stopConnections = workflow.json.connections['Backend: Error Callback']?.main?.[0] || [];
    assert.deepEqual(stopConnections.map((connection) => connection.node), ['Stop: Workflow Failed']);
    for (const node of httpNodes(workflow)) {
      if (node.name === 'Backend: Success Callback' || node.name === 'Backend: Error Callback') continue;
      assert.equal(node.onError, 'continueErrorOutput', `${workflow.name} / ${node.name}: error output`);
      const branches = workflow.json.connections[node.name]?.main || [];
      const errorBranch = branches[1] || [];
      assert.ok(errorBranch.some((connection) => connection.node === errorCallback.name), `${workflow.name} / ${node.name}: error callback edge`);
    }
  }
});

test('retries are bounded and only applied to safe calls', () => {
  let retried = 0;
  for (const workflow of workflows) {
    for (const node of httpNodes(workflow)) {
      if (node.retryOnFail === true) {
        retried += 1;
        assert.ok(Number(node.maxTries) >= 1 && Number(node.maxTries) <= 5, `${workflow.name} / ${node.name}: bounded retries`);
        assert.ok(Number(node.waitBetweenTries) > 0, `${workflow.name} / ${node.name}: retry backoff`);
      }
    }
  }
  assert.ok(retried > 0, 'at least one bounded retry is configured');
});

test('long-running sub-workflow dispatches are asynchronous', () => {
  const wf00 = workflows.find((workflow) => workflow.name === 'StoryWF-00_Main_Router.json');
  for (const name of [
    'Dispatch: WF-01 Bible Architect',
    'Dispatch: WF-02 Story Generator',
    'Dispatch: WF-03 Production Pipeline',
    'Dispatch: WF-05 Vision Pipeline',
    'Dispatch: Governance Direct (WF-06/08/09/10/11/12/13)',
  ]) {
    const node = nodeByName(wf00, name);
    assert.ok(node, name);
    assert.equal(node.parameters.options.waitForSubWorkflow, false, name);
  }
  const wf02 = workflows.find((workflow) => workflow.name === 'storywf02.json');
  assert.equal(nodeByName(wf02, 'Execute WF-03 Media Pipeline').parameters.options.waitForSubWorkflow, false);
  const wf04 = workflows.find((workflow) => workflow.name === 'storywf04.json');
  assert.equal(nodeByName(wf04, 'Rule 18 Gate: Invoke WF-07 Publisher').parameters.options.waitForSubWorkflow, false);
});
