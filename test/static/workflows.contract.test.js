'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const DIR = path.join(H.backendRoot, 'n8n-workflows');
const ALL_DIR = path.join(H.backendRoot, 'n8n-workflows-all');

const EXPECTED = {
  'StoryWF-00_Main_Router.json': { id: 'U4pLz7pXmG2OqXlt', nodes: 37 },
  'StoryWF-01.json': { id: 'UeEXeimGGwqIh84T', nodes: 24 },
  'storywf02.json': { id: 'qRUdhg1PNDK2wJk6', nodes: 29 },
  'storywf03.json': { id: 's4RGuFSDlevgD5nC', nodes: 41 },
  'storywf04.json': { id: '8q9tF3VE0mLUZQfa', nodes: 33 },
  'storywf05.json': { id: 'ADPseu4KBfVveYrq', nodes: 19 },
  'storywf06.json': { id: 'WAB7tCTJSUilOp07', nodes: 20 },
  'Storywf07.json': { id: 'zvw63UrbObZhFUiW', nodes: 30 },
  'Storywf08.json': { id: 'MrWrz58aRUVTzpLr', nodes: 25 },
  'storywf09.json': { id: 'gT1c0Hpvrwyf9YS6', nodes: 17 },
  'StoryWf10.json': { id: 'swOEbQV3iNUNmMwu', nodes: 17 },
  'Storywf11.json': { id: 'baRqhI9JSob9m5oD', nodes: 18 },
  'StoryWf12.json': { id: '2fcuca0HkGxGIYMv', nodes: 11 },
  'storywf13.json': { id: 'jI39p4vr4CnWhpgw', nodes: 16 },
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
  assert.match(String(dispatcher.parameters.workflowId), /WF_03_PROD_ID|s4RGuFSDlevgD5nC/);
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

test('WF-02 derives script length from runtime contract and batches long episodes', () => {
  const wf02 = loadWorkflows(DIR).find((workflow) => workflow.name === 'storywf02.json');
  const assembly = wf02.json.nodes.find((node) => node.name === 'Context Assembly & Prompt Constructor');
  const parser = wf02.json.nodes.find((node) => node.name === 'Stage 1 Parser & Stage 2 Prompt Builder');
  assert.ok(assembly && parser);
  assert.doesNotMatch(assembly.parameters.jsCode, /30 to 50 granular beats/);
  assert.doesNotMatch(assembly.parameters.jsCode, /at least \$\{seriesConfig\.script_word_count\}/);
  assert.match(assembly.parameters.jsCode, /runtime_contract/);
  assert.match(assembly.parameters.jsCode, /beat_range/);
  assert.match(assembly.parameters.jsCode, /screenplay_word_range/);
  assert.match(parser.parameters.jsCode, /batch: __stage2Batch/);
  assert.match(parser.parameters.jsCode, /batch: __stage2FallbackBatch/);
  assert.match(parser.parameters.jsCode, /act_count/);
});

test('WF-02 forwards canonical duration to WF-03 and WF-03 enforces the duration gate', () => {
  const wf02 = loadWorkflows(DIR).find((workflow) => workflow.name === 'storywf02.json');
  const wf03 = loadWorkflows(DIR).find((workflow) => workflow.name === 'storywf03.json');
  const formatter = wf02.json.nodes.find((node) => node.name === 'WF-03 Dispatch & Output Formatter');
  const normalizer = wf03.json.nodes.find((node) => node.name === 'Normalize Input & Enforce SAVE Mode');
  const selector = wf03.json.nodes.find((node) => node.name === 'Audio Selector (3-Tier Fallback) & Scene Merge Gate');
  const verifier = wf03.json.nodes.find((node) => node.name === 'Verify Final Master Video & Prepare DB Finalization');
  assert.match(formatter.parameters.jsCode, /target_duration_sec: state\.target_duration_sec/);
  assert.match(formatter.parameters.jsCode, /runtime_contract: state\.runtime_contract/);
  assert.match(normalizer.parameters.jsCode, /target_duration_sec/);
  assert.match(selector.parameters.jsCode, /target_duration_sec/);
  assert.match(verifier.parameters.jsCode, /Duration Gate Failed/);
  assert.match(verifier.parameters.jsCode, /duration_status/);
});

test('WF-03 composes the IMAGE system prompt into scene visual prompts', () => {
  const wf03 = loadWorkflows(DIR).find((workflow) => workflow.name === 'storywf03.json');
  const normalizer = wf03.json.nodes.find((node) => node.name === 'Normalize Input & Enforce SAVE Mode');
  const resolver = wf03.json.nodes.find((node) => node.name === 'Cache Evaluator & Stage Resolver');
  assert.ok(normalizer && resolver);
  assert.match(normalizer.parameters.jsCode, /image_system_prompt/);
  assert.match(resolver.parameters.jsCode, /composedPrompt/);
  assert.match(resolver.parameters.jsCode, /imageSystemPrompt/);
});


test('WF-01 never writes story_bible directly and only returns an approval patch', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(DIR, 'StoryWF-01.json'), 'utf8'));
  const names = workflow.nodes.map((node) => node.name);
  assert.ok(names.includes('Prepare Bible Patch'));
  assert.ok(!names.some((name) => /Update Master Bible|Upsert Characters|Insert Story Rules/.test(name)));
  const saveEdges = workflow.connections['Intent Switch (BIBLE_SAVE vs BIBLE_CHAT)'].main[0];
  assert.deepEqual(saveEdges.map((edge) => edge.node), ['Prepare Bible Patch']);
  const saveNodes = workflow.nodes.filter((node) => node.name === 'Prepare Bible Patch');
  assert.equal(saveNodes.length, 1);
  assert.match(saveNodes[0].parameters.jsCode, /base_hash/);
  assert.match(saveNodes[0].parameters.jsCode, /changed_fields/);
});

test('WF-11 QC reads and writes are season-aware', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(DIR, 'Storywf11.json'), 'utf8'));
  const targets = workflow.nodes.filter((node) => {
    const body = JSON.stringify(node.parameters || {});
    return /\/rest\/v1\/(episodes|episode_states)\?/.test(body);
  });
  assert.ok(targets.length >= 5, 'expected episode reads plus QC status writes');
  for (const node of targets) {
    const body = JSON.stringify(node.parameters || {});
    assert.match(body, /season_no=eq\./, `${node.name} must filter by season_no`);
  }
  const approvals = targets.filter((node) => /qc_status/.test(JSON.stringify(node.parameters || {})));
  assert.ok(approvals.length >= 3, 'expected PENDING/REJECTED/APPROVED writes');
});

test('WF-00 carries season, title and synopsis into the WF-02 dispatch', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(DIR, 'StoryWF-00_Main_Router.json'), 'utf8'));
  const dispatch = workflow.nodes.find((node) => node.name === 'Dispatch: WF-02 Story Generator');
  assert.ok(dispatch, 'WF-02 dispatch node exists');
  const values = dispatch.parameters.workflowInputs.value;
  assert.match(values.season_number, /json\.season_no/);
  assert.match(values.episode_title, /episode_title/);
  assert.match(values.episode_synopsis, /episode_synopsis/);
  const ingest = workflow.nodes.find((node) => node.name === 'Ingest Gate & Aankh Inspector');
  assert.match(ingest.parameters.jsCode, /incomingSeasonNo/);
  assert.match(ingest.parameters.jsCode, /incomingEpisodeTitle/);
  assert.match(ingest.parameters.jsCode, /incomingEpisodeSynopsis/);
});

test('WF-00 idempotency lock query is season-aware', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(DIR, 'StoryWF-00_Main_Router.json'), 'utf8'));
  const lock = workflow.nodes.find((node) => node.name === 'Supabase: Query Episode States Lock');
  assert.ok(lock, 'episode states lock node exists');
  const body = JSON.stringify(lock.parameters);
  assert.match(body, /episode_states\?/);
  assert.match(body, /season_no=eq\./);
});

test('WF-11 never substitutes expected duration for the actual master runtime', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(DIR, 'Storywf11.json'), 'utf8'));
  const inspector = workflow.nodes.find((node) => node.name === 'Automated QC Inspector');
  assert.ok(inspector, 'Automated QC Inspector exists');
  const code = inspector.parameters.jsCode;
  assert.ok(!/actualDuration\s*=\s*Number\([^)]*expectedDuration/.test(code), 'actual duration must not fall back to expected');
  assert.match(code, /outputMedia\.actual_duration_sec/);
  assert.match(code, /Actual master duration is missing/);
  assert.match(code, /Expected duration is missing/);
});

test('WF-11 accepts the file size shape emitted by WF-03', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(DIR, 'Storywf11.json'), 'utf8'));
  const inspector = workflow.nodes.find((node) => node.name === 'Automated QC Inspector');
  assert.match(inspector.parameters.jsCode, /base\.file_size_bytes/);
});

test('WF-11 accepts extensionless media URLs but still rejects malformed ones', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(DIR, 'Storywf11.json'), 'utf8'));
  const inspector = workflow.nodes.find((node) => node.name === 'Automated QC Inspector');
  const code = inspector.parameters.jsCode;
  assert.ok(!/\.\(mp4\|mov\|mkv\|webm\)/.test(code), 'must not require a video file extension');
  assert.match(code, /new URL\(resolvedUrl\)/);
  assert.match(code, /\['http:', 'https:'\]\.includes\(parsedMasterUrl\.protocol\)/);
});


test('WF-07 episode reads and publish writes are season-scoped', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(DIR, 'Storywf07.json'), 'utf8'));
  const targets = workflow.nodes.filter((node) => {
    const body = JSON.stringify(node.parameters || {});
    return /\/rest\/v1\/episodes\?/.test(body);
  });
  assert.ok(targets.length >= 2, 'expected episode read and publish write');
  for (const node of targets) {
    const body = JSON.stringify(node.parameters || {});
    assert.match(body, /season_no=eq\./, `${node.name} must filter by season_no`);
    assert.match(body, /episode_no=eq\./, `${node.name} must filter by episode_no`);
  }
});

test('WF-11 human approval task carries exact season and episode identity', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(DIR, 'Storywf11.json'), 'utf8'));
  const inspector = workflow.nodes.find((node) => node.name === 'Automated QC Inspector');
  assert.ok(inspector, 'Automated QC Inspector exists');
  const code = inspector.parameters.jsCode;
  assert.match(code, /action_payload:\s*\{[^}]*season_no:/);
  assert.match(code, /action_payload:\s*\{[^}]*episode_no:/);
});

test('WF-03 forwards CPU audio_stats into persisted output_media', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(DIR, 'storywf03.json'), 'utf8'));
  const verifier = workflow.nodes.find((node) => node.name === 'Verify Final Master Video & Prepare DB Finalization');
  assert.ok(verifier, 'final verifier exists');
  assert.match(verifier.parameters.jsCode, /audio_stats:\s*ffmpegResp\.audio_stats/);
});
