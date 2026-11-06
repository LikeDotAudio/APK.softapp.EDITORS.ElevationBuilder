// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * SAVE .IFC — the rack as one IFC4X3_ADD2 model (IFC-CORE-DELTAS racks-1/2, power-3; ROAD-3582/3583), the shape
 * DATABASE.server.BIM bim/bench_ifc.py writes for a rack on the bench, so a viewer reads both the same way.
 * Written with the contracts' STEP writer and GlobalId rule (vendor/apk-contracts/apk-ifc.js), no IfcOpenShell in
 * the page. Byte-deterministic: every GlobalId is uuid5 of a role under the rack id (contracts ifcGuid), an
 * embedded BIM part type keeps the GlobalIds of its own part file.
 *
 *   IfcProject ─ IfcSite ─ IfcBuilding ─ IfcBuildingStorey ─ IfcSpace (the rack's room)     units mm · kg · W
 *   the rack    IfcElementAssembly USERDEFINED ObjectType 'EquipmentRack', AssemblyPlace SITE, Tag = the rack's
 *               bench ref (else its id), contained in the space; it aggregates (IfcRelAggregates 'Rack') the frame
 *               and every installed device, which are therefore NOT contained in the space themselves
 *   the frame   IfcFurniture typed by an IfcFurnitureType TECHNICALCABINET (ElementType 'EquipmentRack'),
 *               APK_Rack (RackUnits = total RU, StaticLoadRating = loadRatingKg, FirstUnitHeight, UsableDepth,
 *               RailStandard 'EIA-310'), APK_RackQuantities.GrossWeight = frameWeightKg (IFC has no Qto for
 *               IfcFurniture); Pset_FurnitureTypeCommon.NominalLength = the frame's width when stated
 *   a device    the occurrence of its BIM part's own type (embedded from /api/bim/parts/<id>.ifc), else of a type
 *               stub with the library's GlobalId (ifcGuid('part', id)) + APK_Part, else of one type per category
 *               (contracts ifc/mapping.json's category rule); a filler is an IfcDiscreteAccessory USERDEFINED
 *               'BlankPanel'. Placed relative to the rack at z = FirstUnitHeight + (startRu − 1) × 44.45 mm, a
 *               rear one at the far rail turned 180° about z. APK_RackPosition (Rack, StartUnit, RackUnits, Face);
 *               APK_RackDevice (Category, Part, PartUrl, PartRevision, Filler, Identity — never an IP); its own
 *               W in Pset_ElectricalDeviceCommon.NominalPowerConsumption, its heat (BTU/hr ÷ 3.412) in
 *               HeatDissipation only when it is not just the power × 3.412, its kg in the entity's Qto GrossWeight
 *               (APK_RackDevice.Declared* / APK_BaseQuantities on an entity those do not apply to)
 *   roll-ups    DERIVED on export by the one roll-up (js/rackRollup.js → contracts rollup), never read back:
 *               APK_PowerRollup (+ Payload, StaticLoadRating, Overloaded) and APK_RackQuantities.LoadedGrossWeight
 *               on the rack, the rack's heat on the room as Pset_SpaceThermalLoad.EquipmentSensible
 *   the block   APK_RackElevation on the project (Schema, RackId, RackRef, Rig: the racks-2 reference)
 */

import { enumv, ifcGuid, real, ref, typed, writeStep } from '../../vendor/apk-contracts/apk-ifc.js';
import { rackRollup, BTU_PER_W } from '../rackRollup.js';
import { copyType, readPartType } from './partTypes.js';

export const IFC_SCHEMA = 'IFC4X3_ADD2';
export const NATIVE_SCHEMA = 'apk.rack_elevation/1';
export const RU_MM = 44.45;
const DERIVED = { kind: 'derived' };

/** A device type by rack category when its part is not in hand (contracts ifc/mapping.json `categories`). */
export const CATEGORY_TYPE = {
  Audio: ['IFCAUDIOVISUALAPPLIANCETYPE', 'USERDEFINED'],
  Video: ['IFCAUDIOVISUALAPPLIANCETYPE', 'USERDEFINED'],
  Network: ['IFCCOMMUNICATIONSAPPLIANCETYPE', 'NETWORKAPPLIANCE'],
  Control: ['IFCCOMMUNICATIONSAPPLIANCETYPE', 'USERDEFINED'],
  'Test & Measurement': ['IFCFLOWINSTRUMENTTYPE', 'USERDEFINED'],
  Power: ['IFCELECTRICAPPLIANCETYPE', 'USERDEFINED'],
  Compute: ['IFCCOMMUNICATIONSAPPLIANCETYPE', 'COMPUTER'],
  Infrastructure: ['IFCBUILDINGELEMENTPROXYTYPE', 'USERDEFINED'],
  Filler: ['IFCDISCRETEACCESSORYTYPE', 'USERDEFINED'],
  Discovered: ['IFCBUILDINGELEMENTPROXYTYPE', 'USERDEFINED'],
};

/** The weight Qto ISO 16739 gives each occurrence entity (EDITORS.PowerChain's table); others take APK_BaseQuantities. */
export const WEIGHT_QTO = {
  IFCAUDIOVISUALAPPLIANCE: 'Qto_AudioVisualApplianceBaseQuantities',
  IFCCOMMUNICATIONSAPPLIANCE: 'Qto_CommunicationsApplianceBaseQuantities',
  IFCTRANSFORMER: 'Qto_TransformerBaseQuantities',
  IFCFLOWINSTRUMENT: 'Qto_FlowInstrumentBaseQuantities',
  IFCELECTRICAPPLIANCE: 'Qto_ElectricApplianceBaseQuantities',
  IFCELECTRICDISTRIBUTIONBOARD: 'Qto_DistributionBoardBaseQuantities',
  IFCCONTROLLER: 'Qto_ControllerBaseQuantities',
  IFCELECTRICFLOWSTORAGEDEVICE: 'Qto_ElectricFlowStorageDeviceBaseQuantities',
  IFCSWITCHINGDEVICE: 'Qto_SwitchingDeviceBaseQuantities',
  IFCPROTECTIVEDEVICE: 'Qto_ProtectiveDeviceBaseQuantities',
};
/** Occurrence entities that are not IfcDistributionElement (Pset_ElectricalDeviceCommon does not apply). */
export const NOT_DISTRIBUTION = new Set(['IFCELEMENTASSEMBLY', 'IFCDISCRETEACCESSORY', 'IFCBUILDINGELEMENTPROXY', 'IFCFURNITURE', 'IFCMECHANICALFASTENER']);

const label = (s) => typed('IFCLABEL', String(s));
const ident = (s) => typed('IFCIDENTIFIER', String(s));
const bool = (b) => typed('IFCBOOLEAN', enumv(b ? 'T' : 'F'));
const measure = (type, x) => typed(type, real(x));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pos = (v) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) && n > 0 ? n : null; };
const nonNeg = (v) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) && n >= 0 ? n : null; };
const MAC_RE = /^[0-9a-f]{2}([:-][0-9a-f]{2}){5}$/i;
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$|^[0-9a-f:]*::[0-9a-f:]*$/i;

/** The heat (W) a row states of its own: BTU/hr ÷ 3.412, unless that is just its power × 3.412 (derived). */
export function ownHeatW(d) {
  const btu = pos(d.btuHr);
  const watts = pos(d.powerW);
  if (btu == null || (watts != null && btu === Math.round(watts * BTU_PER_W))) return null;
  return btu / BTU_PER_W;
}

class Writer {
  constructor() { this.entities = []; }
  add(type, ...args) {
    this.entities.push({ id: this.entities.length + 1, type, args });
    return ref(this.entities.length);
  }
}

function occurrenceArgs(entity, { gid, name, objectType, placement, tag, predefined = null }) {
  const head = [gid, null, name ?? null, null, objectType ?? null, placement ?? null, null, tag ?? null];
  if (entity === 'IFCELEMENTASSEMBLY') return [...head, enumv('SITE'), predefined ? enumv(predefined) : null];
  if (entity === 'IFCMECHANICALFASTENER') return [...head, null, null, predefined ? enumv(predefined) : null];
  return [...head, predefined ? enumv(predefined) : null];
}

/** The rack's reference and bench ref: what its assembly's Tag and every APK_RackPosition.Rack say. */
export const rackTag = (rack) => String(rack.ref || rack.id || 'rack');

/**
 * The rack (the editor's rack: {id, name, room, totalRu, frameWeightKg?, loadRatingKg?, ref?, rig?, installed})
 * as IFC4X3_ADD2 STEP text.  types: {partId: the part's .ifc text}, each device's type, embedded.
 */
export function rackToIfc(rack, { types = {}, fileName = null } = {}) {
  const W = new Writer();
  const key = String(rack.id || 'rack');
  const g = (...roles) => ifcGuid('elevation', key, ...roles);
  const tag = rackTag(rack);
  const installed = rack.installed || [];

  // ---- units and contexts
  const si = (type, prefix, name) => W.add('IFCSIUNIT', DERIVED, enumv(type), prefix ? enumv(prefix) : null, enumv(name));
  const units = [['LENGTHUNIT', 'MILLI', 'METRE'], ['MASSUNIT', 'KILO', 'GRAM'], ['POWERUNIT', null, 'WATT'],
    ['ELECTRICVOLTAGEUNIT', null, 'VOLT'], ['ELECTRICCURRENTUNIT', null, 'AMPERE'], ['FREQUENCYUNIT', null, 'HERTZ'],
    ['ELECTRICRESISTANCEUNIT', null, 'OHM']];
  const unitRef = new Map(units.map(([t, p, n]) => [`${t}/${p ?? ''}/${n}`, si(t, p, n)]));
  const unitAssignment = W.add('IFCUNITASSIGNMENT', [...unitRef.values()]);
  const point = (x, y, z) => W.add('IFCCARTESIANPOINT', [real(x), real(y), real(z)]);
  const origin = W.add('IFCAXIS2PLACEMENT3D', point(0, 0, 0), null, null);
  const ctx = W.add('IFCGEOMETRICREPRESENTATIONCONTEXT', null, 'Model', 3, real(1e-5), origin, null);
  const bodyCtx = W.add('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', 'Body', 'Model', DERIVED, DERIVED, DERIVED, DERIVED, ctx, null, enumv('MODEL_VIEW'), null);
  const project = W.add('IFCPROJECT', g('project'), null, rack.name ?? 'Rack', 'APK.audio Rack Elevation', null, null, null, [ctx], unitAssignment);

  // ---- property helpers
  const single = (name, value) => W.add('IFCPROPERTYSINGLEVALUE', name, null, value, null);
  const pset = (owners, ownerKey, name, props) => {
    const list = props.filter(Boolean);
    if (!list.length || !owners.length) return null;
    const ps = W.add('IFCPROPERTYSET', g('pset', ownerKey, name), null, name, null, list);
    W.add('IFCRELDEFINESBYPROPERTIES', g('props', ownerKey, name), null, null, null, owners, ps);
    return ps;
  };
  const typePset = (typeKey, name, props) => {
    const list = props.filter(Boolean);
    return list.length ? W.add('IFCPROPERTYSET', g('pset', typeKey, name), null, name, null, list) : null;
  };
  const qto = (owners, ownerKey, name, quantities, method = null) => {
    const list = quantities.filter(Boolean);
    if (!list.length || !owners.length) return null;
    const q = W.add('IFCELEMENTQUANTITY', g('qto', ownerKey, name), null, name, null, method, list);
    W.add('IFCRELDEFINESBYPROPERTIES', g('props', ownerKey, name), null, null, null, owners, q);
    return q;
  };
  const weightQ = (name, kg) => (isNum(kg) ? W.add('IFCQUANTITYWEIGHT', name, null, null, real(kg), null) : null);

  // ---- the spine
  const sitePl = W.add('IFCLOCALPLACEMENT', null, origin);
  const buildingPl = W.add('IFCLOCALPLACEMENT', sitePl, origin);
  const storeyPl = W.add('IFCLOCALPLACEMENT', buildingPl, origin);
  const spacePl = W.add('IFCLOCALPLACEMENT', storeyPl, origin);
  const site = W.add('IFCSITE', g('site'), null, 'Site', null, null, sitePl, null, null, enumv('ELEMENT'), null, null, null, null, null);
  const building = W.add('IFCBUILDING', g('building'), null, 'Building', null, null, buildingPl, null, null, enumv('ELEMENT'), null, null, null);
  const storey = W.add('IFCBUILDINGSTOREY', g('storey'), null, 'Level 0', null, null, storeyPl, null, null, enumv('ELEMENT'), real(0));
  const space = W.add('IFCSPACE', g('space'), null, rack.room ? String(rack.room) : 'Room', null, null, spacePl, null, null, enumv('ELEMENT'), enumv('INTERNAL'), null);
  W.add('IFCRELAGGREGATES', g('aggregates', 'project'), null, null, null, project, [site]);
  W.add('IFCRELAGGREGATES', g('aggregates', 'site'), null, null, null, site, [building]);
  W.add('IFCRELAGGREGATES', g('aggregates', 'building'), null, null, null, building, [storey]);
  W.add('IFCRELAGGREGATES', g('aggregates', 'storey'), null, null, null, storey, [space]);
  pset([project], 'project', 'APK_RackElevation', [
    single('Schema', ident(NATIVE_SCHEMA)), single('RackId', ident(key)),
    rack.ref ? single('RackRef', ident(rack.ref)) : null, rack.rig ? single('Rig', ident(rack.rig)) : null,
  ]);
  const declared = [];

  // ---- the rack and its frame
  const rackPl = W.add('IFCLOCALPLACEMENT', spacePl, origin);
  const assembly = W.add('IFCELEMENTASSEMBLY', ...occurrenceArgs('IFCELEMENTASSEMBLY', {
    gid: g('rack'), name: rack.name ?? tag, objectType: 'EquipmentRack', placement: rackPl, tag, predefined: 'USERDEFINED' }));
  const widthMm = pos(rack.widthMm);
  const frameSets = [typePset('frame/type', 'Pset_FurnitureTypeCommon', [widthMm != null ? single('NominalLength', measure('IFCNONNEGATIVELENGTHMEASURE', widthMm)) : null])].filter(Boolean);
  const frameType = W.add('IFCFURNITURETYPE', g('frame', 'type'), null, `${rack.name ?? tag} frame`, null, null, frameSets.length ? frameSets : null,
    null, null, 'EquipmentRack', enumv('NOTDEFINED'), enumv('TECHNICALCABINET'));
  declared.push(frameType);
  const frame = W.add('IFCFURNITURE', g('frame'), null, `${rack.name ?? tag} frame`, null, null,
    W.add('IFCLOCALPLACEMENT', rackPl, origin), null, null, null);
  W.add('IFCRELDEFINESBYTYPE', g('typed', 'frame'), null, null, null, [frame], frameType);
  const firstUnit = nonNeg(rack.firstUnitMm);
  const depth = pos(rack.usableDepthMm);
  pset([frame], 'frame', 'APK_Rack', [
    single('RackUnits', typed('IFCINTEGER', Math.round(Number(rack.totalRu) || 42))),
    pos(rack.loadRatingKg) != null ? single('StaticLoadRating', measure('IFCMASSMEASURE', pos(rack.loadRatingKg))) : null,
    firstUnit != null ? single('FirstUnitHeight', measure('IFCLENGTHMEASURE', firstUnit)) : null,
    depth != null ? single('UsableDepth', measure('IFCPOSITIVELENGTHMEASURE', depth)) : null,
    single('RailStandard', label('EIA-310')),
  ]);
  qto([frame], 'frame', 'APK_RackQuantities', [weightQ('GrossWeight', pos(rack.frameWeightKg))]);

  // ---- device types: the part's own (embedded), a library stub, or one per category
  const unitByKey = (u) => unitRef.get(`${u.args[1].value}/${u.args[2] ? u.args[2].value : ''}/${u.args[3].value}`);
  const contextUnits = new Map();
  const typeRefs = new Map(); // key → {ref, entity, occ: []}
  const stubType = (k, entity, predefined, { name, elementType, tagText = null, psets = [] }) => {
    const sets = psets.filter(Boolean);
    const t = W.add(entity, ifcGuid(...k), null, name, null, null, sets.length ? sets : null, null, tagText,
      predefined === 'USERDEFINED' ? elementType : null, enumv(predefined));
    declared.push(t);
    return t;
  };
  const typeOf = (d) => {
    const pid = d.bimId ? String(d.bimId) : '';
    const k = pid ? `part:${pid}` : `category:${d.isFiller ? 'Filler' : d.category || 'Audio'}`;
    if (typeRefs.has(k)) return typeRefs.get(k);
    let out = null;
    const found = pid ? readPartType(types[pid], pid) : null;
    if (found) {
      const c = copyType(W, found.file, found.t, { ctx, bodyCtx, unitByKey, contextUnits });
      declared.push(c.ref);
      out = { ref: c.ref, entity: c.entity.replace(/TYPE$/, '') };
    } else {
      const cat = d.isFiller ? 'Filler' : (CATEGORY_TYPE[d.category] ? d.category : 'Audio');
      const [entity, predefined] = CATEGORY_TYPE[cat];
      const word = cat === 'Filler' ? 'BlankPanel' : cat;
      if (pid) {
        const tk = `part/${pid}`;
        const t = stubType(['part', pid], entity, predefined, { name: pid, elementType: word, tagText: pid, psets: [
          typePset(tk, 'APK_Part', [single('PartId', ident(pid)), single('Category', label(cat)), single('Stage', label('stub'))]),
        ] });
        out = { ref: t, entity: entity.replace(/TYPE$/, '') };
      } else {
        const t = stubType(['elevation', key, 'type', cat], entity, predefined, { name: cat === 'Filler' ? 'Blank panel' : `${cat} device`, elementType: word });
        out = { ref: t, entity: entity.replace(/TYPE$/, '') };
      }
    }
    out.occ = [];
    typeRefs.set(k, out);
    return out;
  };

  // ---- devices at their RU
  const parts = [frame];
  const zOf = (ru) => (firstUnit ?? 0) + (Math.max(1, Number(ru) || 1) - 1) * RU_MM;
  installed.forEach((d, i) => {
    const okey = `dev/${d.id ?? i + 1}`;
    const t = typeOf(d);
    const entity = d.isFiller && !d.bimId ? 'IFCDISCRETEACCESSORY' : t.entity;
    const rear = String(d.face || 'front').toLowerCase() === 'rear';
    const z = zOf(d.startRu);
    const at = rear
      ? W.add('IFCAXIS2PLACEMENT3D', point(widthMm ?? 0, depth ?? 0, z), W.add('IFCDIRECTION', [real(0), real(0), real(1)]), W.add('IFCDIRECTION', [real(-1), real(0), real(0)]))
      : W.add('IFCAXIS2PLACEMENT3D', point(0, 0, z), null, null);
    const o = W.add(entity, ...occurrenceArgs(entity, {
      gid: g('dev', String(d.id ?? i + 1)), name: d.name ?? null, placement: W.add('IFCLOCALPLACEMENT', rackPl, at),
      tag: d.id ?? null, ...(entity === 'IFCDISCRETEACCESSORY' ? { predefined: 'USERDEFINED', objectType: 'BlankPanel' } : {}),
    }));
    t.occ.push(o);
    parts.push(o);
    const distribution = !NOT_DISTRIBUTION.has(entity);
    const watts = pos(d.powerW);
    const heat = ownHeatW(d);
    const identity = d.identity && !IP_RE.test(String(d.identity)) ? String(d.identity) : null;
    pset([o], okey, 'APK_RackPosition', [
      single('Rack', ident(tag)),
      single('StartUnit', typed('IFCINTEGER', Math.round(Number(d.startRu) || 1))),
      single('RackUnits', typed('IFCINTEGER', Math.max(1, Math.round(Number(d.ru) || 1)))),
      single('Face', label(rear ? 'REAR' : 'FRONT')),
    ]);
    pset([o], okey, 'APK_RackDevice', [
      d.category ? single('Category', label(d.category)) : null,
      d.bimId ? single('Part', ident(d.bimId)) : null,
      d.bimRef && d.bimRef.url ? single('PartUrl', label(d.bimRef.url)) : null,
      d.bimRef && d.bimRef.rev ? single('PartRevision', label(d.bimRef.rev)) : null,
      d.bimRef && d.bimRef.part && d.bimRef.part !== d.bimId ? single('PartRef', ident(d.bimRef.part)) : null,
      d.isFiller ? single('Filler', bool(true)) : null,
      identity ? single('Identity', ident(identity)) : null,
      !distribution && watts != null ? single('DeclaredPower', measure('IFCPOWERMEASURE', watts)) : null,
      !distribution && heat != null ? single('DeclaredHeatDissipation', measure('IFCPOWERMEASURE', heat)) : null,
    ]);
    if (identity && MAC_RE.test(identity)) pset([o], okey, 'APK_Identity', [single('MacAddress', ident(identity.toLowerCase().replace(/-/g, ':')))]);
    if (distribution) {
      pset([o], okey, 'Pset_ElectricalDeviceCommon', [
        heat != null ? single('HeatDissipation', measure('IFCPOWERMEASURE', heat)) : null,
        watts != null ? single('NominalPowerConsumption', measure('IFCPOWERMEASURE', watts)) : null,
      ]);
    }
    const kg = nonNeg(d.weightKg);
    if (kg != null) qto([o], okey, WEIGHT_QTO[entity] ?? 'APK_BaseQuantities', [weightQ('GrossWeight', kg)]);
  });
  W.add('IFCRELAGGREGATES', g('aggregates', 'rack'), null, 'Rack', null, assembly, parts);

  // ---- roll-ups: derived, by the one shared rule
  const r = rackRollup(rack);
  pset([assembly], 'rack', 'APK_PowerRollup', [
    isNum(r.watts) ? single('Load', measure('IFCPOWERMEASURE', r.watts)) : null,
    isNum(r.heatW) ? single('Heat', measure('IFCPOWERMEASURE', r.heatW)) : null,
    isNum(r.weightKg) ? single('Weight', measure('IFCMASSMEASURE', r.weightKg)) : null,
    isNum(r.va) ? single('ApparentPowerVA', measure('IFCREAL', r.va)) : null,
    single('LoadPartial', bool(!!r.partial.watts)),
    single('HeatPartial', bool(!!r.partial.heatW)),
    single('WeightPartial', bool(!!r.partial.weightKg)),
    single('UnknownLoadCount', typed('IFCINTEGER', r.unknown.watts)),
    single('UnknownWeightCount', typed('IFCINTEGER', r.unknown.weightKg)),
    single('HeatAssumed', bool(!!r.heatAssumed)),
    single('PowerFactorAssumed', bool(!!r.pfAssumed)),
    isNum(r.payloadKg) ? single('Payload', measure('IFCMASSMEASURE', r.payloadKg)) : null,
    'payloadPartial' in r ? single('PayloadPartial', bool(!!r.payloadPartial)) : null,
    isNum(r.capacityKg) ? single('StaticLoadRating', measure('IFCMASSMEASURE', r.capacityKg)) : null,
    typeof r.overload === 'boolean' ? single('Overloaded', bool(r.overload)) : null,
    single('Method', label('APK no-double-count')),
    single('Derived', bool(true)),
  ]);
  qto([assembly], 'rack', 'APK_RackQuantities', [weightQ('LoadedGrossWeight', r.weightKg)], 'APK no-double-count');
  if (isNum(r.heatW)) {
    pset([space], 'space', 'Pset_SpaceThermalLoad', [
      W.add('IFCPROPERTYBOUNDEDVALUE', 'EquipmentSensible', null, null, null, null, measure('IFCPOWERMEASURE', r.heatW)),
    ]);
  }

  // ---- types, containment
  for (const [k, t] of typeRefs) if (t.occ.length) W.add('IFCRELDEFINESBYTYPE', g('typed', k), null, null, null, t.occ, t.ref);
  W.add('IFCRELDECLARES', g('declares'), null, null, null, project, declared);
  W.add('IFCRELCONTAINEDINSPATIALSTRUCTURE', g('contains', 'space'), null, null, null, [assembly], space);

  const stem = String(fileName ?? rack.name ?? 'rack').replace(/\.[^.]+$/, '');
  const header = [
    { type: 'FILE_DESCRIPTION', args: [['ViewDefinition [ReferenceView]'], '2;1'] },
    { type: 'FILE_NAME', args: [`${stem}.ifc`, '1970-01-01T00:00:00', ['APK.audio'], ['APK.audio'], 'EDITORS.ElevationBuilder', 'APK.audio Rack Elevation', ''] },
    { type: 'FILE_SCHEMA', args: [[IFC_SCHEMA]] },
  ];
  return writeStep({ header, entities: W.entities });
}
