'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const wf02 = require('../../n8n-workflows/storywf02.json');
const wf03 = require('../../n8n-workflows/storywf03.json');
const wf11 = require('../../n8n-workflows/Storywf11.json');

function codeFor(workflow, name) {
  const node = workflow.nodes.find((entry) => entry.name === name);
  assert.ok(node, `missing node: ${name}`);
  return node.parameters.jsCode;
}

test('WF-02 carries project format, language, season context, and target episode count', () => {
  const normalize = codeFor(wf02, 'Normalize Input & Lock SAVE Mode');
  assert.match(normalize, /project_format/);
  assert.match(normalize, /languageName/);
  assert.match(normalize, /target_episode_count/);

  const context = codeFor(wf02, 'Context Assembly & Prompt Constructor');
  assert.match(context, /PROJECT FORMAT RULES/);
  assert.match(context, /Dialogue Language/);
  assert.match(context, /seasonContextText/);
  assert.doesNotMatch(context, /Write a complete Hindi\/Hinglish episode/);

  const stage2 = codeFor(wf02, 'Stage 1 Parser & Stage 2 Prompt Builder');
  assert.match(stage2, /__stage2Context/);
  assert.match(stage2, /STAGE1_SUMMARY/);
  assert.match(stage2, /DIALOGUE_LANGUAGE/);
});

test('WF-03 carries language into image and TTS requests', () => {
  const normalize = codeFor(wf03, 'Normalize Input & Enforce SAVE Mode');
  assert.match(normalize, /const language =/);
  assert.match(normalize, /project_format/);

  const cache = codeFor(wf03, 'Cache Evaluator & Stage Resolver');
  assert.match(cache, /visualDnaPrompt/);
  assert.match(cache, /identityLock/);
  assert.match(cache, /language, language_name: languageName/);

  const svara = wf03.nodes.find((entry) => entry.name === 'Branch B1: GitHub Svara TTS Primary');
  assert.match(svara.parameters.jsonBody, /language: \$json\.language/);
  const fallback = wf03.nodes.find((entry) => entry.name === 'Branch B2: Supertonic TTS Fallback');
  assert.match(fallback.parameters.jsonBody, /language: \$\(\'Restore Scene Context After Image\'\)\.item\.json\.language/);
});

test('WF-11 never auto-approves a failed QC result', () => {
  const code = codeFor(wf11, 'Automated QC Inspector');
  assert.match(code, /outObj\.qc_passed !== true/);
  assert.match(code, /__failures\.length > 0/);
  const unsafe = code.match(/qc_passed: true,[\s\S]{0,200}qc_failures: Array\.isArray\(outObj\.qc_failures\)/g) || [];
  assert.equal(unsafe.length, 0);
});
