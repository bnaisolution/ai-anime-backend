const fs = require('fs');
const path = require('path');
const patchesDir = __dirname;
function loadPatch(relPath) { return fs.readFileSync(path.join(patchesDir, relPath), 'utf8'); }

function patchNodeArray(nodes, wfName) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (node.type === 'n8n-nodes-base.executeWorkflowTrigger') {
      node.parameters = { inputSource: 'passthrough' };
    }
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

    if (node.name === 'Mode & R12 Governance Engine' && node.parameters?.jsCode) {
      node.parameters.jsCode = node.parameters.jsCode.replace(
        /preflight_workflow_ids:\s*\{[^}]+\}/,
        "preflight_workflow_ids: { wf_10_quota: $env.WF_12_QUOTA_ID || null, wf_12_quota: $env.WF_12_QUOTA_ID || null, wf_09_canon: $env.WF_09_CANON_ID || null, wf_06_continuity: $env.WF_06_CONTINUITY_ID || null, wf_10_state: $env.WF_10_STATE_ID || null }"
      );
    }

    // FIXED BUG 5: Kept workflowInputs passthrough to prevent data drop
    if (node.name === 'Dispatch: WF-02 Story Generator' && node.parameters) {
      node.parameters = {
        workflowId: "={{ $('Restore Context After Audit').first().json.target_workflow_id }}",
        options: { waitForSubWorkflow: true },
        workflowInputs: { mappingMode: "passthrough" }
      };
    }

    if (node.parameters && typeof node.parameters.jsCode === 'string') {
      let code = node.parameters.jsCode;
      code = code.replace(
        /`=== VISUAL STYLE: \$\{visualStyle\} ===`,\s*`PREFIX: \$\{stylePrefix\}`,\s*const hydratedContextText = \[/g,
        "const hydratedContextText = [\n  `=== VISUAL STYLE: ${visualStyle} ===`,\n  `PREFIX: ${stylePrefix}`,"
      );
      code = code.replace(/\$\((['"][^'"]+['"])\)\.item\.json/g, "$($1).first().json");
      code = code.replace(/\$\((['"][^'"]+['"])\)\.item\.binary/g, "($($1).first().binary || {})");
      node.parameters.jsCode = code;

      try {
        new Function('$input', '$json', '$env', '$now', '$execution', '$', code);
      } catch (syntaxErr) {
        console.error(`❌ SyntaxError in [${wfName}] -> Node [${node.name}]:`, syntaxErr.message);
      }
    }
  }
}

function patchWorkflowFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/\{\{\s*\$env\.COLAB_WORKER_URL\s*\}\}\/v1\/image\/sdxl-pulid/g, "{{ ($json.user_infrastructure?.kaggle?.worker_url || $env.KAGGLE_WORKER_URL) }}/v1/gpu/sdxl-pulid");
  content = content.replace(/\{\{\s*\$env\.COLAB_WORKER_URL\s*\}\}\/v1\/tts\/(svara|supertonic)/g, "{{ ($json.user_infrastructure?.ffmpeg?.worker_url || $env.FFMPEG_WORKER_URL) }}/v1/tts/$1");
  content = content.replace(/\$env\.COLAB_WORKER_URL/g, "($json.user_infrastructure?.kaggle?.worker_url || $env.KAGGLE_WORKER_URL)");
  content = content.replace(/user_infrastructure\?\.kaggle\.worker_url/g, 'user_infrastructure?.kaggle?.worker_url');
  content = content.replace(/user_infrastructure\?\.ffmpeg\.worker_url/g, 'user_infrastructure?.ffmpeg?.worker_url');
  content = content.replace(/user_infrastructure\?\.groq\.api_key/g, 'user_infrastructure?.groq?.api_key');
  content = content.replace(/user_infrastructure\?\.gemini\.api_key/g, 'user_infrastructure?.gemini?.api_key');
  content = content.replace(/user_infrastructure\?\.openai\.api_key/g, 'user_infrastructure?.openai?.api_key');
  content = content.replace(/user_infrastructure\?\.telegram\.bot_token/g, 'user_infrastructure?.telegram?.bot_token');
  content = content.replace(/user_infrastructure\?\.telegram\.channel_id/g, 'user_infrastructure?.telegram?.channel_id');
  content = content.replace(/user_infrastructure\?\.youtube\./g, 'user_infrastructure?.youtube?.');
  content = content.replace(/user_infrastructure\?\.instagram\./g, 'user_infrastructure?.instagram?.');
  content = content.replace(/openai\/gpt-oss-120b/g, 'llama-3.3-70b-versatile');
  content = content.replace(/models\/gemini-2\.0-flash/g, 'gemini-2.0-flash');
  content = content.replace(/\$\(\\'([^']+)\\'\)\.item\.json/g, "$('$1').first().json");
  content = content.replace(/\$\('([^']+)'\)\.item\.json/g, "$('$1').first().json");

  const wf = JSON.parse(content);
  const wfName = path.basename(filePath);
  patchNodeArray(wf.nodes, wfName);
  if (wf.activeVersion && Array.isArray(wf.activeVersion.nodes)) {
    patchNodeArray(wf.activeVersion.nodes, `${wfName} [activeVersion]`);
  }
  fs.writeFileSync(filePath, JSON.stringify(wf, null, 2), 'utf8');
  console.log(`✅ Patched & Verified: ${wfName}`);
}

const targetDir = process.argv[2] || process.cwd();
if (fs.existsSync(targetDir)) {
  const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.json')).sort();
  console.log(`Found ${files.length} workflow JSON files in ${targetDir}`);
  for (const file of files) { patchWorkflowFile(path.join(targetDir, file)); }
} else {
  console.error(`❌ Workflow directory not found: ${targetDir}`); process.exit(1);
}
