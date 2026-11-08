'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

test('AnimeError maps error codes to HTTP statuses', () => {
  const { AnimeError, AnimeErrorCode } = H.dist('modules/anime/errors/anime.errors.js');
  const cases = [
    [AnimeErrorCode.AUTH_INVALID, 401],
    [AnimeErrorCode.PROJECT_FORBIDDEN, 403],
    [AnimeErrorCode.OUTPUT_INVALID, 422],
    [AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH, 502],
    [AnimeErrorCode.INTERNAL, 500],
  ];
  for (const [code, status] of cases) {
    const error = new AnimeError({ code, message: 'test' });
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, status);
  }
});

test('animeErrorHandler returns the standard error envelope', async () => {
  const Fastify = require('fastify');
  const { animeErrorHandler, AnimeError, AnimeErrorCode } = H.dist('modules/anime/errors/anime.errors.js');
  const { animeRequestIdHook } = H.dist('modules/anime/middleware/request-id.js');
  const app = Fastify({ logger: false });
  app.addHook('onRequest', animeRequestIdHook);
  app.setErrorHandler(animeErrorHandler);
  app.get('/boom', async () => {
    throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'denied' });
  });
  await app.ready();
  const response = await app.inject({ method: 'GET', url: '/boom' });
  assert.equal(response.statusCode, 403);
  const body = response.json();
  assert.equal(body.error.code, 'PROJECT_FORBIDDEN');
  assert.equal(body.error.retryable, false);
  assert.match(body.error.request_id, /^[0-9a-f-]{36}$/);
  await app.close();
});

test('animeErrorHandler converts unknown errors to INTERNAL 500', async () => {
  const Fastify = require('fastify');
  const { animeErrorHandler } = H.dist('modules/anime/errors/anime.errors.js');
  const app = Fastify({ logger: false });
  app.setErrorHandler(animeErrorHandler);
  app.get('/boom', async () => { throw new Error('unexpected'); });
  await app.ready();
  const response = await app.inject({ method: 'GET', url: '/boom' });
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.code, 'INTERNAL');
  await app.close();
});
