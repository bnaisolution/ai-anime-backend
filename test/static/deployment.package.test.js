'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test('deployment package is reviewable and cannot deploy production', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/build_deployment_package.sh'), 'utf8');
  const runbook = fs.readFileSync(path.join(ROOT, 'docs/operations/DEPLOYMENT_PACKAGE.md'), 'utf8');

  assert.match(script, /Deployment performed: NO/);
  assert.match(script, /Deployment was NOT performed/);
  assert.match(script, /Image digest/);
  assert.match(script, /OD-14/);
  assert.match(script, /OD-15/);
  assert.match(script, /AR-10/);
  assert.match(script, /supabase\/migrations/);
  assert.match(script, /SHA256SUMS/);
  assert.match(script, /ALLOW_DIRTY/);
  assert.equal(/\b(?:docker\s+push|kubectl\s+apply|ssh\s+|aws\s+deploy|npx\s+wrangler\s+deploy)\b/i.test(script), false);
  assert.match(runbook, /does not authorize production changes/i);
  assert.match(runbook, /No production deployment/);
});
