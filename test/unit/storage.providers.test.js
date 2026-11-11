'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const H = require('../helpers/env');

process.env.ANIME_ENCRYPTION_KEY = 'storage-test-encryption-key-material-32';

const {
  classifyStorageConfig,
  listStorageProviders,
  selectStorageRecord,
  validateStorageKey,
} = H.dist('modules/anime/storage/storage.service.js');
const { putObject, signS3Put } = H.dist('modules/anime/storage/storage.adapters.js');
const { encryptWithCurrentKey } = H.dist('modules/anime/infrastructure/keyRegistry.js');

function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', async () => {
      try {
        const { port } = server.address();
        const result = await fn(`http://127.0.0.1:${port}`);
        server.close(() => resolve(result));
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function record(id, config, tenantId = null) {
  return {
    id, user_id: 'user-1', name: id, provider_type: 'custom',
    config_encrypted: encryptWithCurrentKey(JSON.stringify(config)).ciphertext,
    capabilities: {}, status: 'active', is_default: false,
    last_verified_at: null, last_error: null, key_version: 2,
    bound_tenant_id: tenantId, last_rotated_at: null, revoked_at: null,
    fingerprint: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

test('storage registry exposes user-owned Telegram, S3-compatible, and custom HTTP providers', () => {
  const providers = listStorageProviders();
  assert.deepEqual(providers.map((p) => p.id), ['telegram', 's3_compatible', 'custom_http']);
  assert.equal(providers.every((p) => p.user_owned_credentials === true), true);
  assert.deepEqual(classifyStorageConfig({ s3: { bucket: 'b' } }).provider, 's3_compatible');
  assert.deepEqual(classifyStorageConfig({ upload_url: 'https://storage.test/put' }).provider, 'custom_http');
  assert.deepEqual(classifyStorageConfig({ telegram_storage: { bot_token: 'x', storage_chat_id: '1' } }).provider, 'telegram');
  assert.equal(classifyStorageConfig({ unrelated: true }), null);
});

test('tenant-scoped storage resolution skips mismatched bindings', () => {
  const records = [
    record('r1', { telegram_storage: { bot_token: 'token', storage_chat_id: '1' } }, 'tenant-a'),
    record('r2', { upload_url: 'https://storage.test/put' }, 'tenant-b'),
  ];
  assert.equal(selectStorageRecord(records, 'tenant-a').record_id, 'r1');
  assert.equal(selectStorageRecord(records, 'tenant-b').record_id, 'r2');
  assert.equal(selectStorageRecord(records, 'tenant-c'), null);
  assert.throws(() => validateStorageKey('../escape'), /relative path/);
});

test('custom HTTP adapter uploads bytes with user-owned bearer credentials', async () => {
  await withServer(async (req, res) => {
    assert.equal(req.method, 'PUT');
    assert.equal(req.headers.authorization, 'Bearer custom-token');
    assert.equal(req.headers['x-storage-key'], 'projects/p1/clip.mp4');
    const body = await readBody(req);
    assert.equal(body.toString(), 'video-bytes');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'custom-1', url: 'https://cdn.test/clip.mp4' }));
  }, async (base) => {
    const result = await putObject('custom_http', { upload_url: `${base}/put`, bearer_token: 'custom-token' }, {
      key: 'projects/p1/clip.mp4', filename: 'clip.mp4', content_type: 'video/mp4', data: Buffer.from('video-bytes'),
    });
    assert.equal(result.provider, 'custom_http');
    assert.equal(result.remote_id, 'custom-1');
    assert.equal(result.url, 'https://cdn.test/clip.mp4');
    assert.equal(result.bytes, 11);
  });
});

test('Telegram adapter uploads a document using the user bot token and chat', async () => {
  await withServer(async (req, res) => {
    assert.match(req.url, /^\/bot123:abc\/sendDocument$/);
    const body = await readBody(req);
    const text = body.toString();
    assert.match(text, /name="chat_id"/);
    assert.match(text, /name="document"; filename="voice.mp3"/);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: { message_id: 42, document: { file_id: 'file-42' } } }));
  }, async (base) => {
    const result = await putObject('telegram', { bot_token: '123:abc', storage_chat_id: '99', api_base: base }, {
      key: 'voice/voice.mp3', filename: 'voice.mp3', content_type: 'audio/mpeg', data: Buffer.from('audio'),
    });
    assert.equal(result.provider, 'telegram');
    assert.equal(result.remote_id, '42');
    assert.equal(result.url, 'telegram:file-42');
  });
});

test('S3-compatible adapter signs and uploads with path-style URLs', async () => {
  await withServer(async (req, res) => {
    assert.equal(req.method, 'PUT');
    assert.equal(req.url, '/bucket/prefix/projects/p1/image.png');
    assert.match(req.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIATEST\/\d{8}\/us-east-1\/s3\/aws4_request/);
    assert.equal(req.headers['x-amz-content-sha256'].length, 64);
    const body = await readBody(req);
    assert.equal(body.toString(), 'png-bytes');
    res.writeHead(200, { etag: '"etag-1"' });
    res.end();
  }, async (base) => {
    const result = await putObject('s3_compatible', {
      endpoint: base, bucket: 'bucket', region: 'us-east-1', prefix: 'prefix',
      access_key_id: 'AKIATEST', secret_access_key: 'secret-test-key',
    }, { key: 'projects/p1/image.png', filename: 'image.png', content_type: 'image/png', data: Buffer.from('png-bytes') });
    assert.equal(result.provider, 's3_compatible');
    assert.equal(result.key, 'prefix/projects/p1/image.png');
    assert.equal(result.remote_id, '"etag-1"');
  });
});

test('S3 signing is deterministic for a fixed clock and encodes object keys', () => {
  const signed = signS3Put({
    endpoint: 'https://s3.example.com', bucket: 'bucket', key: 'folder/a b.png', region: 'us-east-1',
    access_key_id: 'AKIATEST', secret_access_key: 'secret-test-key',
    payload: Buffer.from('data'), content_type: 'image/png', now: new Date('2026-11-11T00:00:00.000Z'),
  });
  assert.equal(signed.url, 'https://s3.example.com/bucket/folder/a%20b.png');
  assert.equal(signed.headers['x-amz-date'], '20261111T000000Z');
  assert.match(signed.headers.authorization, /Signature=[a-f0-9]{64}$/);
});
