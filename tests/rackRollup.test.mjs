// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The rack's load / heat / weight by the one shared roll-up (contracts/src/ifc/rollup.ts in apk-ifc.js), ROAD-3582.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { rackRollup, rackNode, deviceNode, metricText } from '../js/rackRollup.js';
import { installFromLibrary, rackFromBlock, rackToBlock } from '../js/rackBlock.js';
import { rollup } from '../vendor/apk-contracts/apk-ifc.js';

const rack = () => ({
  id: 'R1', totalRu: 42, frameWeightKg: 72, loadRatingKg: 40,
  installed: [
    { id: 'amp', startRu: 34, ru: 2, face: 'front', powerW: 450, btuHr: 1535, weightKg: 20 },        // btu = 450 × 3.412: derived
    { id: 'dsp', startRu: 30, ru: 1, face: 'rear', powerW: 65, btuHr: 120, weightKg: 4 },            // heat stated: 120 BTU/hr
    { id: 'disc', startRu: 20, ru: 1, face: 'front', powerW: 0, btuHr: 0, category: 'Discovered' },  // nothing known
    { id: 'blk', startRu: 1, ru: 1, face: 'front', powerW: 0, btuHr: 0, isFiller: true },
  ],
});

test('rows become roll-up nodes: 0 W is unknown except on a filler; a derived BTU/hr is no heat statement', () => {
  const [amp, dsp, disc, blk] = rack().installed.map(deviceNode);
  assert.deepEqual([amp.watts, amp.heatW, amp.weightKg], [450, null, 20]);
  assert.deepEqual([dsp.heatW], [35.2]);
  assert.deepEqual([disc.watts, disc.heatW, disc.weightKg], [null, null, null]);
  assert.deepEqual([blk.watts, blk.heatW], [0, 0]);
});

test('the rack roll-up is the shared rule: frame weight in the total, not the payload; partial says so; overload checked', () => {
  const r = rackRollup(rack());
  assert.deepEqual(r, rollup(rackNode(rack())));
  assert.equal(r.watts, 515);
  assert.equal(r.partial.watts, true);
  assert.equal(r.unknown.watts, 1);
  assert.equal(r.weightKg, 96);           // 72 frame + 20 + 4, the discovered row unknown
  assert.equal(r.payloadKg, 24);
  assert.equal(r.overload, null, 'unknown weight could still tip a 40 kg rating');
  const t = metricText(r);
  assert.match(t.watts, /^515 W \(\+1 unknown\)$/);
  assert.match(t.weight, /96 kg \(\+2 unknown\) · rating 40 kg/);   // the discovered row and the blank state no weight
  const heavy = rack();
  heavy.installed[1].weightKg = 30;
  assert.equal(rackRollup(heavy).overload, true);
  assert.match(metricText(rackRollup(heavy)).weight, /OVER its 40 kg rating/);
});

test('a library pick carries the part weight; the frame and rating ride the block', () => {
  const r = { totalRu: 42, installed: [] };
  const dev = installFromLibrary(r, { bim: { id: 'x/amp' } }, 'front', { physical: { rack_units: 2, weight_kg: 9.2 }, power: { watts: 450 } });
  assert.equal(dev.weightKg, 9.2);
  const back = rackFromBlock(rackToBlock({ ...rack(), name: 'A' }, new Date(0)));
  assert.deepEqual([back.frameWeightKg, back.loadRatingKg], [72, 40]);
});

test('the shared rule answers the contracts vectors here too', () => {
  const vec = new URL('../../../../../../contracts/vectors/ifc/rollup.json', import.meta.url);
  if (!existsSync(vec)) return;
  for (const c of JSON.parse(readFileSync(vec, 'utf8')).cases) assert.deepEqual(rollup(c.node), c.expect, c.name);
});
