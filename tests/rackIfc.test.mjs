// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The rack as IFC4X3 (IFC-CORE-DELTAS racks-1/2, power-3; ROAD-3582/3583): an EquipmentRack assembly holding
// its IfcFurniture frame and every device at its RU, typed by the BIM parts, the roll-ups by the one shared rule
// — written, read back equal, the racks-2 reference block, and checked by IfcOpenShell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ifcGuid, IFC_GUID_RE, parseStep } from '../vendor/apk-contracts/apk-ifc.js';
import { rackToIfc, RU_MM, ownHeatW } from '../js/ifc/rackToIfc.js';
import { ifcToRack, ownSets } from '../js/ifc/ifcToRack.js';
import { loadPartTypes, partIfcUrl } from '../js/ifc/partTypes.js';
import { rackRollup } from '../js/rackRollup.js';
import { rackFromBlock, rackToBlock } from '../js/rackBlock.js';
import { buildBundle, BUNDLE } from '../scripts/vendor-ifc.mjs';
import { world } from './softappWorld.mjs';

const DIR = new URL('./fixtures/parts/', import.meta.url);
/** {partId: .ifc text} of the fixture parts (DATABASE.server.BIM's stored twins, via EDITORS.PowerChain). */
function partTypes() {
  const out = {};
  for (const f of readdirSync(DIR).sort()) out[f.replace('--', '/').replace(/\.ifc$/, '')] = readFileSync(new URL(f, DIR), 'utf8');
  return out;
}

/** A 42 U rack, both faces: library parts (two typed by their embedded types, one the library does not answer
 *  for), a discovered switch, a measured row with its own heat, and a blank. */
function fixtureRack() {
  return {
    id: 'rck_mcr_01', name: 'RACK-01 (MCR)', room: 'MCR', totalRu: 42, frameWeightKg: 72, loadRatingKg: 40,
    firstUnitMm: 100, usableDepthMm: 800, widthMm: 600, ref: 'R1', rig: 'bench',
    installed: [
      { id: 'amp1', name: 'Biamp REVAMP1120T', startRu: 40, ru: 1, face: 'front', category: 'Audio', powerW: 120, btuHr: 409, weightKg: 4.5,
        bimId: 'biamp/revamp1120t', bimRef: { part: 'biamp/revamp1120t', url: '/api/bim/parts/biamp/revamp1120t', rev: '3' } },
      { id: 'dsp1', name: 'Wheatstone 134', startRu: 37, ru: 2, face: 'front', category: 'Audio', powerW: 150, btuHr: 400, weightKg: 5,
        bimId: 'wheatstone/134' },
      { id: 'pdu1', name: 'PDU A', startRu: 2, ru: 1, face: 'rear', category: 'Power', powerW: 0, btuHr: 0, bimId: 'salamander-designs/sa-rm-pdu' },
      { id: 'cnv1', name: 'Converter', startRu: 30, ru: 1, face: 'front', category: 'Video', powerW: 0, btuHr: 0, bimId: 'acme/converter' },
      { id: 'disc_aa_bb', name: 'Core switch', startRu: 38, ru: 1, face: 'rear', category: 'Network', powerW: 90, btuHr: 307,
        identity: 'aa:bb:cc:dd:ee:01', weightKg: 3.2 },
      { id: 'blk_1', name: '1U Blank Panel (RU 1)', startRu: 1, ru: 1, face: 'front', category: 'Filler', powerW: 0, btuHr: 0, isFiller: true },
    ],
  };
}
const exportFixture = () => rackToIfc(fixtureRack(), { types: partTypes() });
const byType = (text, type) => parseStep(text).entities.filter((e) => e.type === type);

test('the vendored STEP codec is what contracts/src/ifc builds to today', async () => {
  const now = await buildBundle();
  if (now == null) return; // this repo on its own: the committed bundle is what there is
  assert.equal(readFileSync(BUNDLE, 'utf8'), now, 'run node scripts/vendor-ifc.mjs');
});

test('Save Model is byte-deterministic, every GlobalId is valid and unique', () => {
  const a = exportFixture();
  assert.equal(a, exportFixture());
  assert.match(a, /^ISO-10303-21;/);
  assert.match(a, /FILE_SCHEMA\(\('IFC4X3_ADD2'\)\)/);
  const gids = parseStep(a).entities.map((e) => e.args[0]).filter((v) => typeof v === 'string' && IFC_GUID_RE.test(v));
  assert.equal(new Set(gids).size, gids.length);
});

test('the rack is an EquipmentRack assembly in its room, aggregating its frame and every device (which are not contained)', () => {
  const text = exportFixture();
  const file = parseStep(text);
  const [asm] = byType(text, 'IFCELEMENTASSEMBLY');
  assert.equal(asm.args[4], 'EquipmentRack');
  assert.equal(asm.args[7], 'R1', 'the Tag is the bench ref (APK_RackPosition.Rack names it)');
  assert.equal(asm.args[8].value, 'SITE');
  assert.equal(asm.args[9].value, 'USERDEFINED');
  const [furnType] = byType(text, 'IFCFURNITURETYPE');
  assert.equal(furnType.args[10].value, 'TECHNICALCABINET');
  const [agg] = byType(text, 'IFCRELAGGREGATES').filter((r) => r.args[4].id === asm.id);
  const parts = agg.args[5].map((r) => file.byId.get(r.id));
  assert.deepEqual(parts.map((p) => p.type), ['IFCFURNITURE', 'IFCAUDIOVISUALAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCE',
    'IFCELECTRICDISTRIBUTIONBOARD', 'IFCAUDIOVISUALAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCE', 'IFCDISCRETEACCESSORY']);
  const [contains] = byType(text, 'IFCRELCONTAINEDINSPATIALSTRUCTURE');
  assert.deepEqual(contains.args[4].map((r) => r.id), [asm.id], 'only the assembly is in the space');
  assert.equal(file.byId.get(contains.args[5].id).args[2], 'MCR');
  const blank = parts.at(-1);
  assert.equal(blank.args[4], 'BlankPanel');
  const frameSets = ownSets(file, parts[0]);
  assert.equal(frameSets.APK_Rack.RackUnits, 42);
  assert.equal(frameSets.APK_Rack.StaticLoadRating, 40);
  assert.equal(frameSets.APK_RackQuantities.GrossWeight, 72);
});

test('devices are typed by their BIM parts: the embedded type keeps the library GlobalId; a part not in hand is a stub with that GlobalId', () => {
  const text = exportFixture();
  const file = parseStep(text);
  const types = file.entities.filter((e) => /TYPE$/.test(e.type));
  const gidOf = (pid) => ifcGuid('part', pid);
  for (const pid of ['biamp/revamp1120t', 'wheatstone/134', 'salamander-designs/sa-rm-pdu', 'acme/converter']) {
    assert.ok(types.some((t) => t.args[0] === gidOf(pid)), `${pid} type is written with GlobalId part/${pid}`);
  }
  const embedded = types.find((t) => t.args[0] === gidOf('biamp/revamp1120t'));
  assert.equal(embedded.type, 'IFCAUDIOVISUALAPPLIANCETYPE');
  assert.match(readFileSync(new URL('biamp--revamp1120t.ifc', DIR), 'utf8'), new RegExp(embedded.args[0].replace(/\$/g, '\\$')), 'the part file\'s own GlobalId');
  const stub = types.find((t) => t.args[0] === gidOf('acme/converter'));
  assert.equal(stub.type, 'IFCAUDIOVISUALAPPLIANCETYPE', 'a Video row: the category rule (contracts ifc/mapping.json)');
  // every device has a type
  const typed = new Set(byType(text, 'IFCRELDEFINESBYTYPE').flatMap((r) => r.args[4].map((x) => x.id)));
  for (const t of ['IFCAUDIOVISUALAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCE', 'IFCELECTRICDISTRIBUTIONBOARD', 'IFCDISCRETEACCESSORY', 'IFCFURNITURE']) {
    for (const o of byType(text, t)) assert.ok(typed.has(o.id), `${t} #${o.id} has an IfcRelDefinesByType`);
  }
});

test('each device sits at FirstUnitHeight + (startRu − 1) × 44.45 mm; a rear one at the far rail, turned 180°', () => {
  const text = exportFixture();
  const file = parseStep(text);
  const rack = fixtureRack();
  const devices = file.entities.filter((e) => rack.installed.some((d) => d.id === e.args[7]) && e.args[5]);
  assert.equal(devices.length, rack.installed.length);
  for (const o of devices) {
    const d = rack.installed.find((x) => x.id === o.args[7]);
    const pl = file.byId.get(o.args[5].id);
    const ax = file.byId.get(pl.args[1].id);
    const [x, y, z] = file.byId.get(ax.args[0].id).args[0].map((v) => v.value ?? v);
    assert.ok(Math.abs(z - (100 + (d.startRu - 1) * RU_MM)) < 1e-6, `${d.id} z ${z}`);
    const s = ownSets(file, o).APK_RackPosition;
    assert.deepEqual([s.Rack, s.StartUnit, s.RackUnits, s.Face], ['R1', d.startRu, d.ru, d.face.toUpperCase()]);
    if (d.face === 'rear') {
      assert.deepEqual([x, y], [600, 800]);
      assert.deepEqual(file.byId.get(ax.args[2].id).args[0].map((v) => v.value ?? v), [-1, 0, 0]);
    } else {
      assert.equal(ax.args[2], null);
    }
  }
});

test('the roll-ups on the rack are the shared rule\'s (rackRollup → contracts rollup), derived, never read back', () => {
  const text = exportFixture();
  const file = parseStep(text);
  const [asm] = byType(text, 'IFCELEMENTASSEMBLY');
  const sets = ownSets(file, asm);
  const r = rackRollup(fixtureRack());
  assert.equal(sets.APK_PowerRollup.Load, r.watts);
  assert.equal(sets.APK_PowerRollup.Weight, r.weightKg);
  assert.equal(sets.APK_PowerRollup.Payload, r.payloadKg);
  assert.equal(sets.APK_PowerRollup.StaticLoadRating, 40);
  assert.equal(sets.APK_PowerRollup.Derived, true);
  assert.equal(sets.APK_RackQuantities.LoadedGrossWeight, r.weightKg);
  assert.equal(r.weightKg, 72 + 4.5 + 5 + 3.2, 'the frame is in the weight');
  assert.equal(r.payloadKg, 4.5 + 5 + 3.2, 'but not in the payload');
  const space = byType(text, 'IFCSPACE')[0];
  assert.equal(ownSets(file, space).Pset_SpaceThermalLoad.EquipmentSensible, r.heatW);
  // an overloaded rack says so
  const heavy = { ...fixtureRack(), loadRatingKg: 5, installed: fixtureRack().installed.filter((d) => d.weightKg != null) };
  const hs = ownSets(parseStep(rackToIfc(heavy)), byType(rackToIfc(heavy), 'IFCELEMENTASSEMBLY')[0]);
  assert.equal(hs.APK_PowerRollup.Overloaded, true);
});

test('heat: a row\'s own BTU/hr is written as W only when it is not just its power × 3.412', () => {
  assert.equal(ownHeatW({ powerW: 120, btuHr: 409 }), null);
  assert.ok(Math.abs(ownHeatW({ powerW: 150, btuHr: 400 }) - 400 / 3.412) < 1e-9);
  assert.equal(ownHeatW({ powerW: 0, btuHr: 0 }), null);
});

test('Open Model reads the .ifc back to the same rack (lossless for what a row states)', () => {
  const back = ifcToRack(exportFixture()).rack;
  assert.deepEqual(back, fixtureRack());
  // and with no part types in hand (offline): the same rows, the stubs carry the part ids
  assert.deepEqual(ifcToRack(rackToIfc(fixtureRack())).rack, fixtureRack());
  // an empty rack too
  const empty = { id: 'r0', name: 'EMPTY', totalRu: 12, installed: [] };
  assert.deepEqual(ifcToRack(rackToIfc(empty)).rack, empty);
  assert.throws(() => ifcToRack("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('x'),'2;1');\nFILE_NAME('a','',(''),(''),'','','');\nFILE_SCHEMA(('IFC4X3_ADD2'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n"), TypeError);
});

test('an IP is never identity: an address in the identity column is not written', () => {
  const rack = { id: 'r', name: 'R', totalRu: 4, installed: [{ id: 'x', name: 'X', startRu: 1, ru: 1, face: 'front', category: 'Network', powerW: 0, btuHr: 0, identity: '10.1.1.1' }] };
  const text = rackToIfc(rack);
  assert.doesNotMatch(text, /10\.1\.1\.1/);
});

test('the racks-2 reference block: rack + rig name the bench instance; the frame fields ride along', () => {
  const block = rackToBlock(fixtureRack(), new Date(0));
  assert.equal(block.rack, 'R1');
  assert.equal(block.rig, 'bench');
  assert.equal(block.frameWeightKg, 72);
  assert.equal(block.loadRatingKg, 40);
  const back = rackFromBlock(block, { id: 'other', ref: 'R9', installed: [] });
  assert.equal(back.ref, 'R1');
  assert.equal(back.rig, 'bench');
  const plain = rackFromBlock({ id: 'b', name: 'B', totalRu: 12, installed: [] }, back);
  assert.equal(plain.ref, undefined, 'a block without a reference does not inherit the last one');
});

test('part types come from /api/bim/parts/<maker>/<model>.ifc, each asked once; a part that does not answer is missing', async () => {
  assert.equal(partIfcUrl('biamp/revamp1120t', '/api/bim'), '/api/bim/parts/biamp/revamp1120t.ifc');
  const texts = partTypes();
  const asked = [];
  const fetchFn = async (url) => {
    asked.push(url);
    const pid = decodeURIComponent(url.replace('/api/bim/parts/', '').replace(/\.ifc$/, ''));
    return texts[pid] ? { ok: true, text: async () => texts[pid] } : { ok: false, status: 404, text: async () => '' };
  };
  const cache = new Map();
  const r = await loadPartTypes(fixtureRack(), cache, { fetchFn, base: '/api/bim' });
  assert.deepEqual(r.missing, ['acme/converter']);
  assert.equal(Object.keys(r.types).length, 3);
  await loadPartTypes(fixtureRack(), cache, { fetchFn, base: '/api/bim' });
  assert.equal(asked.length, 4);
  assert.equal(rackToIfc(fixtureRack(), { types: r.types }), exportFixture());
});

test('Save Model through the vendored APKSoftapp writes <rack>.ifc and <rack>.json; Open Model takes the .ifc back', async () => {
  const w = world({ framed: false });
  const rack = fixtureRack();
  const r = await w.S.saveModel(rack, { name: 'elevation_rack_01', picker: false, toJson: (x) => rackToBlock(x, new Date(0)), toIfc: (x) => rackToIfc(x, { types: partTypes() }) });
  assert.equal(r.ok, true, JSON.stringify(r.problem));
  assert.deepEqual([...r.files], ['elevation_rack_01.ifc', 'elevation_rack_01.json']);   // (an array of the page's vm realm)
  const ifcText = exportFixture();
  const o = await w.S.openModel({ file: { name: 'elevation_rack_01.ifc', text: async () => ifcText }, fromIfc: (text) => rackToBlock(ifcToRack(text).rack, new Date(0)) });
  assert.equal(o.ok, true);
  assert.equal(o.kind, 'ifc');
  const back = rackFromBlock(o.model, { installed: [] });
  delete back.timestamp; delete back.type;
  assert.deepEqual(back, fixtureRack());
});

// IfcOpenShell (LGPL, test-only, never vendored) when the environment has it: APK_IFC_PYTHON=<python with ifcopenshell + ifctester>
test('IfcOpenShell: 0 schema + EXPRESS errors, sets match the templates / apk_psets.py, RU placement and rack weight check', { skip: !process.env.APK_IFC_PYTHON && 'set APK_IFC_PYTHON to a python with ifcopenshell + ifctester' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'elevation-ifc-'));
  const files = {
    'rack.ifc': exportFixture(),
    'rack-offline.ifc': rackToIfc(fixtureRack()),
    'rack-empty.ifc': rackToIfc({ id: 'r0', name: 'EMPTY', totalRu: 12, installed: [] }),
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const script = new URL('../scripts/validate-ifc.py', import.meta.url).pathname;
  const run = spawnSync(process.env.APK_IFC_PYTHON, ['-I', script, ...Object.keys(files).map((n) => join(dir, n))], { cwd: tmpdir(), encoding: 'utf8' });
  const rows = run.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(rows.length, Object.keys(files).length, run.stderr);
  for (const r of rows) {
    assert.equal(r.schema, 'IFC4X3_ADD2', r.file);
    assert.equal(r.statements, 0, `${r.file}: ${r.first.join(' | ')}`);
    assert.deepEqual(r.checks, [], r.file);
    if (r.oracle) assert.deepEqual(r.pset_problems, [], r.file);
  }
  const rack = rows.find((r) => r.file.endsWith('/rack.ifc')).racks[0];
  assert.equal(rack.walk, rack.loaded);
  assert.equal(rack.devices.length, 6);
  assert.equal(run.status, 0, run.stdout);
});
