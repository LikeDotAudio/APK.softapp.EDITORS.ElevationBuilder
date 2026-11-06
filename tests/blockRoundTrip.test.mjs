// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ROAD-3486: the rack_elevation block in and out over cad.like.audio/host@1,
// through the vendored apk-softapp client, wired as elevationApp.js wires it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { world, ORIGIN } from './softappWorld.mjs';
import { BLOCK_TYPE, rackFromBlock, rackToBlock, rackMeta, installDiscovered } from '../js/rackBlock.js';

const BLOCK = {
  type: BLOCK_TYPE, id: 'rck_7', name: 'RACK-07', room: 'MCR', totalRu: 12,
  installed: [{ id: 'a', name: 'Switch', startRu: 12, ru: 1, face: 'front', category: 'Network', powerW: 90, btuHr: 307 }],
};

function app(w) {
  let rack = { id: 'x', name: 'SAMPLE', totalRu: 42, installed: [] };
  const host = w.S.connectHost({
    editor: 'Elevation Builder',
    blockType: BLOCK_TYPE,
    onLoad: (block) => { rack = rackFromBlock(block, rack); },
    onRequest: () => ({ block: rackToBlock(rack), meta: rackMeta(rack) }),
  });
  return { host, rack: () => rack };
}

test('in the CAD: editorReady, load, request → blockSave carries the edited rack, to our origin only', () => {
  const w = world();
  const a = app(w);
  assert.deepEqual(w.toParent[0].m, { protocol: 'cad.like.audio/host@1', type: 'editorReady', editor: 'Elevation Builder', blockType: BLOCK_TYPE });
  w.fire({ protocol: 'cad.like.audio/host@1', type: 'load', block: BLOCK, meta: { blockName: 'RACK-07' } });
  assert.equal(a.rack().name, 'RACK-07');
  assert.equal(a.rack().totalRu, 12);
  a.rack().installed[0].powerW = 120;                       // an edit in the table
  w.fire({ protocol: 'cad.like.audio/host@1', type: 'request' });
  const save = w.toParent.at(-1);
  assert.equal(save.o, ORIGIN);
  assert.equal(save.m.type, 'blockSave');
  assert.equal(save.m.blockType, BLOCK_TYPE);
  assert.equal(save.m.block.installed[0].powerW, 120);
  assert.equal(save.m.meta.filename, 'elevation_rack_07');
  assert.equal(w.downloads.length, 0, 'no download when the CAD holds the block');
});

test('a load from a stranger (wrong source or origin) is ignored', () => {
  const w = world();
  const a = app(w);
  w.fire({ protocol: 'cad.like.audio/host@1', type: 'load', block: BLOCK }, { source: {} });
  w.fire({ protocol: 'cad.like.audio/host@1', type: 'load', block: BLOCK }, { origin: 'http://evil' });
  w.fire({ type: 'APK_LOAD_BLOCK', block: BLOCK });
  assert.equal(a.rack().name, 'SAMPLE');
});

test('standalone: save downloads the block as .json', () => {
  const w = world({ framed: false });
  const a = app(w);
  assert.equal(w.toParent.length, 0);
  assert.equal(a.host.save(rackToBlock(a.rack()), rackMeta(a.rack())), 'download');
  assert.equal(w.downloads[0].name, 'elevation_sample.json');
  assert.equal(JSON.parse(w.downloads[0].text).name, 'SAMPLE');
});

test('discovered things install once each, keyed by MAC/serial, never by IP', () => {
  const rack = rackFromBlock(BLOCK, {});
  const things = [
    { mac: 'aa:bb:cc:dd:ee:01', name: 'Dante Amp', ips: ['10.0.0.5'] },
    { serial: 'SN-42', vendor: 'ACME', model: 'X1', ips: ['10.0.0.5'] },
    { ips: ['10.0.0.9'] },                                  // nothing but an IP: no identity, not installed
  ];
  const added = installDiscovered(rack, things, 'front');
  assert.deepEqual(added.map((d) => d.identity), ['aa:bb:cc:dd:ee:01', 'SN-42']);
  assert.deepEqual(added.map((d) => d.startRu), [1, 2]);
  assert.equal(added[1].name, 'ACME X1');
  assert.equal(installDiscovered(rack, things, 'front').length, 0, 'a second sync adds nothing');
});

test('a library part is racked under its own category — a meter is Test & Measurement, not Audio (ROAD-3597)', async () => {
  const { categoryOfPart, CATEGORIES } = await import('../js/rackBlock.js');
  assert.equal(categoryOfPart({ category: 'Test & Measurement', class: 'Digital Multimeter' }), 'Test & Measurement');
  assert.equal(categoryOfPart({ category: 'Video', class: 'Camera' }), 'Video');
  assert.equal(categoryOfPart({ category: 'Network', class: 'Switch' }), 'Network');
  assert.equal(categoryOfPart({ category: 'Audio', class: 'Mixer' }), 'Audio');
  for (const c of ['Test & Measurement', 'Video', 'Control']) assert.ok(CATEGORIES.includes(c));
});

test('a Concepts part is refused with a reason, never racked as Audio (ROAD-3601)', async () => {
  const { notRackable, installFromLibrary } = await import('../js/rackBlock.js');
  const concept = { id: 'concept/adapter-mux', name: 'Container Mux (Adapter)', category: 'Concepts', class: 'Concept · Adapter' };
  assert.match(notRackable(concept), /Container Mux \(Adapter\) is a Concept, not a physical device: it cannot be racked/);
  assert.equal(notRackable({ category: 'Audio', class: 'Mixer' }), '');
  assert.equal(notRackable({}), '');
  const rack = rackFromBlock({ totalRu: 4 });
  assert.equal(installFromLibrary(rack, { bim: concept, ref: { part: concept.id } }, 'front'), null);
  assert.equal(rack.installed.length, 0, 'nothing installed');
  // the full part the ref resolves to decides too: a pick whose block omits the category
  assert.equal(installFromLibrary(rack, { bim: { id: concept.id } }, 'front', { category: 'Concepts' }), null);
  assert.ok(installFromLibrary(rack, { bim: { id: 'x/amp', category: 'Audio' } }, 'front'), 'a physical part still racks');
});
