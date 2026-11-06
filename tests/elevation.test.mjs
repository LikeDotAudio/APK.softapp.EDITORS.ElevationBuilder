import test from 'node:test';
import assert from 'node:assert/strict';
import { installFromLibrary } from '../js/rackBlock.js';

test('a part from the BIM library is installed at its own height with its BIM reference (ROAD-3572)', () => {
  const rack = { totalRu: 42, installed: [{ id: 'a', startRu: 1, ru: 1, face: 'front' }] };
  const ref = { part: 'keysight/34401a', url: 'http://bench:8160/api/bim/parts/keysight/34401a', rev: 'r1' };
  const dev = installFromLibrary(rack, { bim: { id: 'keysight/34401a', name: 'Agilent 34401A', category: 'Test & Measurement' }, ref }, 'front',
    { physical: { rack_units: 2 }, power: { watts: 25 } });
  assert.deepEqual([dev.startRu, dev.ru, dev.powerW, dev.bimId, dev.category], [2, 2, 25, 'keysight/34401a', 'Test & Measurement']);
  assert.deepEqual(dev.bimRef, ref);
  assert.equal(installFromLibrary({ totalRu: 1, installed: [{ startRu: 1, ru: 1, face: 'front' }] }, { bim: { id: 'x' }, ref }, 'front'), null, 'a full face installs nothing');
});
