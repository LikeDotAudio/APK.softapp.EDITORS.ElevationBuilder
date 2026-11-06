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

import { installFromLibrary } from '../js/rackBlock.js';
test('a part from the BIM library is installed at its own height with its BIM reference (ROAD-3572)', () => {
  const rack = { totalRu: 42, installed: [{ id: 'a', startRu: 1, ru: 1, face: 'front' }] };
  const ref = { part: 'keysight/34401a', url: 'http://bench:8160/api/bim/parts/keysight/34401a', rev: 'r1' };
  const dev = installFromLibrary(rack, { bim: { id: 'keysight/34401a', name: 'Agilent 34401A', category: 'Test & Measurement' }, ref }, 'front',
    { physical: { rack_units: 2 }, power: { watts: 25 } });
  assert.deepEqual([dev.startRu, dev.ru, dev.powerW, dev.bimId], [2, 2, 25, 'keysight/34401a']);
  assert.deepEqual(dev.bimRef, ref);
  assert.equal(installFromLibrary({ totalRu: 1, installed: [{ startRu: 1, ru: 1, face: 'front' }] }, { bim: { id: 'x' }, ref }, 'front'), null, 'a full face installs nothing');
});
