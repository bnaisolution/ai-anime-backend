const fs = require('fs');
const path = require('path');

const patchesDir = __dirname;

function loadPatch(relPath) {
  return fs.readFileSync(path.join(patchesDir, relPath), 'utf8');
}

function patchWorkflowFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Global Colab Removal -> Dynamic Kaggle Worker URL (Fix E)
  content = content.replace(
    /\{\{\s*\$env\.COLAB_WORKER_URL\s*\}\}\/v1\/image\/sdxl-pulid/g,
    "{{ ($json.user_infrastructure?.kaggle?.worker_url || $('Normalize Input & Enforce SAVE Mode').first().json.user_infrastructure?.kaggle?.worker_url || $env.KAGGLE_WORKER_URL) }}/v1/gpu/sdxl-pulid"
  );
  content = content.replace(
    /\{\{\s*\$env\.COLAB_WORKER_URL\s*\}\}\/v1\/tts\/(svara|supertonic)/g,
    "{{ ($json.user_infrastructure?.ffmpeg?.worker_url || $('Normalize Input & Enforce SAVE Mode').first().json.user_infrastructure?.ffmpeg?.worker_url || $env.FFMPEG_WORKER_URL) }}/v1/tts/$1"
  );
  content = content.replace(
    /\$env\.COLAB_WORKER_URL/g,
    "($json.user_infrastructure?.kaggle?.worker_url || $env.KAGGLE_WORKER_URL)"
  );

  // 2. Fix single-level optional chaining bugs on user_infrastructure
  content = content.replace(/user_infrastructure\?\.kaggle\.worker_url/g, 'user_infrastructure?.kaggle?.worker_url');
  content = content.replace(/user_infrastructure\?\.ffmpeg\.worker_url/g, 'user_infrastructure?.ffmpeg?.worker_url');
  content = content.replace(/user_infrastructure\?\.groq\.api_key/g, 'user_infrastructure?.groq?.api_key');
  content = content.replace(/user_infrastructure\?\.gemini\.api_key/g, 'user_infrastructure?.gemini?.api_key');
  content = content.replace(/user_infrastructure\?\.openai\.api_key/g, 'user_infrastructure?.openai?.api_key');
  content = content.replace(/user_infrastructure\?\.telegram\.bot_token/g, 'user_infrastructure?.telegram?.bot_token');
  content = content.replace(/user_infrastructure\?\.telegram\.channel_id/g, 'user_infrastructure?.telegram?.channel_id');
  content = content.replace(/user_infrastructure\?\.youtube\./g, 'user_infrastructure?.youtube?.');
  content = content.replace(/user_infrastructure\?\.instagram\./g, 'user_infrastructure?.instagram?.');

  const wf = JSON.parse(content);
  if (!Array.isArray(wf.nodes)) return;

  for (const node of wf.nodes) {
    // Fix B: Ensure Execute Workflow Trigger accepts all data
    if (node.type === 'n8n-nodes-base.executeWorkflowTrigger') {
      node.parameters = { inputSource: 'passthrough' };
    }

    // Node-specific JS code replacements
    if (node.name === 'Ingest Gate & Aankh Inspector') {
      node.parameters.jsCode = loadPatch('wf00/ingest_gate.js');
    } else if (node.name === 'Layer 1: Prefix Fast-Track') {
      node.parameters.jsCode = loadPatch('wf00/layer1_fast_track.js');
    } else if (node.name === 'Input Normalizer & Cost Estimator') {
      node.parameters.jsCode = loadPatch('wf12/input_normalizer.js');
    } else if (node.name === 'Final Quota Response Formatter') {
      node.parameters.jsCode = loadPatch('wf12/final_formatter.js');
    } else if (node.name === 'Final Canon Response Formatter') {
      node.parameters.jsCode = loadPatch('wf09/final_formatter.js');
    } else if (node.name === 'Response & Pre-Flight Formatter') {
      node.parameters.jsCode = loadPatch('wf06/final_formatter.js');
    } else if (node.name === 'Normalize Input & Lock SAVE Mode') {
      node.parameters.jsCode = loadPatch('wf02/normalize_input.js');
    } else if (node.name === 'Normalize Input & Enforce SAVE Mode') {
      node.parameters.jsCode = loadPatch('wf03/normalize_input.js');
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(wf, null, 2), 'utf8');
  console.log(`✅ Patched workflow: ${filePath}`);
}

const targetDir = process.argv[2] || process.cwd();
for (const file of fs.readdirSync(targetDir)) {
  if (file.endsWith('.json')) {
    patchWorkflowFile(path.join(targetDir, file));
  }
}
