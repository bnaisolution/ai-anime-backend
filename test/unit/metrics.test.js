'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const {
  incrementCounter,
  setGauge,
  observeHistogram,
  renderPrometheusMetrics,
  resetMetricsForTests,
} = H.dist('modules/anime/observability/metrics.js');

test('counters, gauges, and histograms render valid Prometheus text', () => {
  resetMetricsForTests();
  incrementCounter('anime_test_total', { route: '/x"y' }, 2);
  incrementCounter('anime_test_total', { route: '/x"y' }, 1);
  setGauge('anime_test_gauge', 7, { kind: 'rss' });
  observeHistogram('anime_test_duration_seconds', 0.2, { route: '/x' }, [0.1, 0.5]);
  const text = renderPrometheusMetrics();
  assert.match(text, /anime_test_total\{route="\/x\\"y"\} 3/);
  assert.match(text, /anime_test_gauge\{kind="rss"\} 7/);
  assert.match(text, /anime_test_duration_seconds_bucket\{route="\/x",le="0.1"\} 0/);
  assert.match(text, /anime_test_duration_seconds_bucket\{route="\/x",le="0.5"\} 1/);
  assert.match(text, /anime_test_duration_seconds_count\{route="\/x"\} 1/);
  resetMetricsForTests();
});
