import test from 'node:test';
import assert from 'node:assert/strict';
import { RackElevationEngine } from '../js/rackElevation.js';

test('RackElevationEngine installs equipment, prevents collision, and computes rollups', () => {
  const engine = new RackElevationEngine(42);

  // Install 3U UPS at RU 1 (occupies RU 1, 2, 3)
  const d1 = engine.installDevice('ups-3u', 1);
  assert.ok(d1, 'UPS installed');
  assert.equal(d1.startRu, 1);
  assert.equal(d1.ru, 3);

  // Attempting to install at RU 2 must collide and return false
  const collide = engine.installDevice('pdu-1u', 2);
  assert.equal(collide, false, 'Collision prevented at RU 2');

  // Install at RU 4 must succeed
  const d2 = engine.installDevice('pdu-1u', 4);
  assert.ok(d2, 'PDU installed at RU 4');

  const metrics = engine.getMetrics();
  assert.equal(metrics.occupiedRu, 4);
  assert.equal(metrics.availableRu, 38);
  assert.ok(metrics.totalWatts > 0);
  assert.ok(metrics.totalBtu > 0);
});
