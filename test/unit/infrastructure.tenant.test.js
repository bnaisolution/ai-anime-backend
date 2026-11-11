'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { isInfrastructureVisibleToTenant } = H.dist('modules/anime/infrastructure/infrastructure.service.js');

test('tenant-bound infrastructure is hidden from other tenants', () => {
  assert.equal(isInfrastructureVisibleToTenant({ bound_tenant_id: 'tenant-a' }, 'tenant-a'), true);
  assert.equal(isInfrastructureVisibleToTenant({ bound_tenant_id: 'tenant-a' }, 'tenant-b'), false);
  assert.equal(isInfrastructureVisibleToTenant({ bound_tenant_id: 'tenant-a' }, undefined), true);
  assert.equal(isInfrastructureVisibleToTenant({ bound_tenant_id: null }, 'tenant-b'), true);
  assert.equal(isInfrastructureVisibleToTenant({}, 'tenant-b'), true);
});
