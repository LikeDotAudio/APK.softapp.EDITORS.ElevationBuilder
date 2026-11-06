// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * OPEN .IFC — a rack written by rackToIfc.js (or by DATABASE.server.BIM for a rack on the bench: the same
 * shape) read back to the editor's rack. The first IfcElementAssembly ObjectType 'EquipmentRack' is the rack;
 * what it aggregates is its frame (the IfcFurniture) and its devices. Only what the file STATES is read: each
 * occurrence's own sets (never its type's, so a part's figure does not become the row's), APK_RackPosition for
 * the RU / face, and nothing derived (APK_PowerRollup, LoadedGrossWeight) is read as truth.
 *
 *   rack    id = APK_RackElevation.RackId (else the assembly's Tag), name = its Name, room = the space's Name,
 *           ref / rig = APK_RackElevation.RackRef / Rig, totalRu = the frame's APK_Rack.RackUnits,
 *           loadRatingKg = StaticLoadRating, frameWeightKg = APK_RackQuantities.GrossWeight
 *   a row   id = Tag, name = Name, startRu / ru / face = APK_RackPosition, category / bimId / bimRef / isFiller /
 *           identity = APK_RackDevice (the type's APK_Part.PartId when the row names none), powerW = its own W,
 *           btuHr = its own heat × 3.412, else its power × 3.412 (the derivation the editor shows), weightKg = its
 *           own GrossWeight
 */

import { entitiesByType, inverseIndex, isRef, parseStep, unwrap } from '../../vendor/apk-contracts/apk-ifc.js';
import { BTU_PER_W } from '../rackRollup.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r6 = (x) => Math.round(x * 1e6) / 1e6;

/** {setName: {prop: value}} of the sets an object carries ITSELF (IfcRelDefinesByProperties), quantities too. */
export function ownSets(file, entity) {
  const out = {};
  for (const rel of inverseIndex(file).get(entity.id) || []) {
    if (rel.type !== 'IFCRELDEFINESBYPROPERTIES' || !(rel.args[4] || []).some((r) => isRef(r) && r.id === entity.id)) continue;
    const def = isRef(rel.args[5]) ? file.byId.get(rel.args[5].id) : null;
    if (!def || typeof def.args[2] !== 'string') continue;
    const props = out[def.args[2]] ?? (out[def.args[2]] = {});
    const list = def.type === 'IFCPROPERTYSET' ? def.args[4] : def.type === 'IFCELEMENTQUANTITY' ? def.args[5] : [];
    for (const r of list || []) {
      const p = isRef(r) ? file.byId.get(r.id) : null;
      if (!p) continue;
      if (p.type === 'IFCPROPERTYSINGLEVALUE') props[p.args[0]] = unwrap(p.args[2]);
      else if (p.type === 'IFCPROPERTYBOUNDEDVALUE') props[p.args[0]] = unwrap(p.args[5] ?? p.args[2]);
      else if (/^IFCQUANTITY/.test(p.type)) props[p.args[0]] = unwrap(p.args[3]);
    }
  }
  return out;
}

/** {setName: {...}} of a type object's own HasPropertySets. */
function typeSets(file, t) {
  const out = {};
  for (const r of t?.args[5] || []) {
    const def = isRef(r) ? file.byId.get(r.id) : null;
    if (!def || def.type !== 'IFCPROPERTYSET') continue;
    const props = out[def.args[2]] ?? (out[def.args[2]] = {});
    for (const pr of def.args[4] || []) {
      const p = isRef(pr) ? file.byId.get(pr.id) : null;
      if (p && p.type === 'IFCPROPERTYSINGLEVALUE') props[p.args[0]] = unwrap(p.args[2]);
    }
  }
  return out;
}

function related(file, rel, idx) {
  return (rel.args[idx] || []).filter(isRef).map((r) => file.byId.get(r.id)).filter(Boolean);
}

/** The IFC text (or a parsed file) → {rack, rackEntity} | throws a TypeError when it holds no EquipmentRack. */
export function ifcToRack(text) {
  const file = typeof text === 'string' ? parseStep(text) : text;
  const assembly = entitiesByType(file, 'IFCELEMENTASSEMBLY').find((a) => a.args[4] === 'EquipmentRack');
  if (!assembly) throw new TypeError('the file holds no rack (an IfcElementAssembly with ObjectType EquipmentRack)');
  const inv = inverseIndex(file);
  const refsTo = (e, type, at) => (inv.get(e.id) || []).filter((r) => r.type === type && isRef(r.args[at]) && r.args[at].id === e.id);
  const parts = refsTo(assembly, 'IFCRELAGGREGATES', 4).flatMap((r) => related(file, r, 5));
  const typeOf = (o) => {
    for (const rel of inv.get(o.id) || []) {
      if (rel.type === 'IFCRELDEFINESBYTYPE' && (rel.args[4] || []).some((r) => isRef(r) && r.id === o.id)) return isRef(rel.args[5]) ? file.byId.get(rel.args[5].id) : null;
    }
    return null;
  };

  const project = entitiesByType(file, 'IFCPROJECT')[0];
  const el = (project && ownSets(file, project).APK_RackElevation) || {};
  const space = (inv.get(assembly.id) || []).filter((r) => r.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE')
    .map((r) => (isRef(r.args[5]) ? file.byId.get(r.args[5].id) : null)).find(Boolean);
  const frame = parts.find((p) => p.type === 'IFCFURNITURE');
  const fs = frame ? ownSets(file, frame) : {};
  const apkRack = fs.APK_Rack || {};
  const rack = {
    id: el.RackId ?? assembly.args[7] ?? 'rack',
    name: assembly.args[2] ?? el.RackId ?? 'rack',
    room: space && space.args[2] !== 'Room' ? space.args[2] : undefined,
    totalRu: num(apkRack.RackUnits) ?? 42,
    installed: [],
  };
  if (rack.room === undefined) delete rack.room;
  if (el.RackRef) rack.ref = el.RackRef;
  if (el.Rig) rack.rig = el.Rig;
  if (num(apkRack.StaticLoadRating) != null) rack.loadRatingKg = apkRack.StaticLoadRating;
  if (num(fs.APK_RackQuantities?.GrossWeight) != null) rack.frameWeightKg = fs.APK_RackQuantities.GrossWeight;
  if (num(apkRack.FirstUnitHeight) != null) rack.firstUnitMm = apkRack.FirstUnitHeight;
  if (num(apkRack.UsableDepth) != null) rack.usableDepthMm = apkRack.UsableDepth;
  const ft = frame ? typeOf(frame) : null;
  const width = ft ? typeSets(file, ft).Pset_FurnitureTypeCommon?.NominalLength : null;
  if (num(width) != null) rack.widthMm = width;

  for (const o of parts) {
    if (o === frame) continue;
    const s = ownSets(file, o);
    const pos = s.APK_RackPosition || {};
    const dev = s.APK_RackDevice || {};
    const elec = s.Pset_ElectricalDeviceCommon || {};
    const t = typeOf(o);
    const typePart = t ? (typeSets(file, t).APK_Part || {}).PartId ?? null : null;
    const watts = num(elec.NominalPowerConsumption) ?? num(dev.DeclaredPower);
    const heat = num(elec.HeatDissipation) ?? num(dev.DeclaredHeatDissipation);
    let weight = null;
    for (const [name, set] of Object.entries(s)) {
      if ((name.startsWith('Qto_') || name === 'APK_BaseQuantities') && num(set.GrossWeight) != null) { weight = set.GrossWeight; break; }
    }
    const row = {
      id: o.args[7] ?? o.args[0],
      name: o.args[2] ?? '',
      startRu: num(pos.StartUnit) ?? 1,
      ru: num(pos.RackUnits) ?? 1,
      face: String(pos.Face || 'FRONT').toUpperCase() === 'REAR' ? 'rear' : 'front',
      category: dev.Category ?? (dev.Filler ? 'Filler' : 'Audio'),
      powerW: watts ?? 0,
      btuHr: heat != null ? r6(heat * BTU_PER_W) : watts != null ? Math.round(watts * BTU_PER_W) : 0,
    };
    if (weight != null) row.weightKg = weight;
    const bimId = dev.Part ?? typePart;
    if (bimId) row.bimId = bimId;
    if (dev.PartUrl || dev.PartRevision || dev.PartRef) row.bimRef = { part: String(dev.PartRef ?? bimId ?? ''), url: String(dev.PartUrl ?? ''), rev: String(dev.PartRevision ?? '') };
    if (dev.Identity) row.identity = dev.Identity;
    if (dev.Filler === true) row.isFiller = true;
    rack.installed.push(row);
  }
  return { rack, rackEntity: assembly };
}
