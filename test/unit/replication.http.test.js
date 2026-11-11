'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const H = require('../helpers/env');

const { getReplicationAdapter } = H.dist('modules/anime/replication/replication.service.js');

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
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

function clearEnv() {
  delete process.env.ANIME_REPLICATION_MODE;
  delete process.env.ANIME_REPLICATION_PRIMARY;
  delete process.env.ANIME_REPLICATION_SECONDARY;
  delete process.env.ANIME_REPLICATION_FAILOVER_URL;
  delete process.env.ANIME_REPLICATION_FAILOVER_TOKEN;
  delete process.env.ANIME_REPLICATION_MAX_LAG_SECONDS;
}

test('HTTP replication probes lag/consistency and performs confirmed failover through a controller', async () => {
  let secondaryToken = 'token-a';
  let secondaryOk = true;
  const failoverBodies = [];
  await withServer(async (req, res) => {
    if (req.url === '/primary') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ provider: 'primary-db', lag_seconds: 1, consistency_token: 'token-a' }));
      return;
    }
    if (req.url === '/secondary') {
      if (!secondaryOk) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'down' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ provider: 'secondary-db', lag_seconds: 2, consistency_token: secondaryToken }));
      return;
    }
    if (req.url === '/failover' && req.method === 'POST') {
      failoverBodies.push(JSON.parse(await readBody(req)));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  }, async (base) => {
    clearEnv();
    process.env.ANIME_REPLICATION_MODE = 'http';
    process.env.ANIME_REPLICATION_PRIMARY = JSON.stringify({ health_url: `${base}/primary`, provider: 'primary-db' });
    process.env.ANIME_REPLICATION_SECONDARY = JSON.stringify({ health_url: `${base}/secondary`, provider: 'secondary-db' });
    process.env.ANIME_REPLICATION_FAILOVER_URL = `${base}/failover`;
    process.env.ANIME_REPLICATION_FAILOVER_TOKEN = 'controller-token';

    const adapter = getReplicationAdapter();
    assert.equal(adapter.mode, 'http');
    const status = await adapter.status();
    assert.equal(status.configured, true);
    assert.equal(status.primary.healthy, 'healthy');
    assert.equal(status.secondary.healthy, 'healthy');
    assert.equal(status.primary.lag_seconds, 1);
    assert.equal(status.secondary.lag_seconds, 2);
    assert.equal(status.consistency, 'consistent');
    assert.equal(status.failover_supported, true);

    const result = await adapter.failover({ confirmed: true, requestedBy: 'owner-1' });
    assert.equal(result.simulated, false);
    assert.equal(failoverBodies.length, 1);
    assert.equal(failoverBodies[0].requested_by, 'owner-1');
    assert.equal(failoverBodies[0].confirmed, true);

    secondaryToken = 'token-b';
    const inconsistent = await adapter.status();
    assert.equal(inconsistent.consistency, 'inconsistent');
    assert.equal(inconsistent.failover_supported, false);
    await assert.rejects(
      () => adapter.failover({ confirmed: true, requestedBy: 'owner-1' }),
      (error) => error.code === 'MANUAL_REVIEW_REQUIRED'
    );

    secondaryToken = 'token-a';
    secondaryOk = false;
    const degraded = await adapter.status();
    assert.equal(degraded.secondary.healthy, 'degraded');
    await assert.rejects(
      () => adapter.failover({ confirmed: true, requestedBy: 'owner-1' }),
      (error) => error.code === 'PROVIDER_UNAVAILABLE'
    );

    delete process.env.ANIME_REPLICATION_FAILOVER_URL;
    const noController = await adapter.status();
    assert.equal(noController.failover_supported, false);
    await assert.rejects(
      () => adapter.failover({ confirmed: true, requestedBy: 'owner-1' }),
      (error) => error.code === 'REPLICATION_NOT_CONFIGURED'
    );
    await assert.rejects(
      () => adapter.failover({ confirmed: false, requestedBy: 'owner-1' }),
      (error) => error.code === 'MANUAL_REVIEW_REQUIRED'
    );
  });
  clearEnv();
});
