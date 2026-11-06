// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* THE DEVICES' PART TYPES — every device installed from the BIM library is an occurrence of its part, and the
   part's IFC type is the stored twin GET <BIM API>/parts/<maker>/<model>.ifc (DATABASE.server.BIM). Save Model
   embeds that type in the rack's .ifc with its own GlobalIds (ifcGuid('part', id), the BIM writer's), ports and
   sets. The API is same-origin /api/bim unless the page sets window.APK_BIM_API. A part that does not answer is
   still a type: rackToIfc writes a stub with the same GlobalId (ifcGuid('part', id)) and APK_Part.PartId, so the
   file joins the library's when both are loaded. copyType is EDITORS.PowerChain js/ifc/powerToIfc.js's. */

import { isRef, isTypeObject, parseStep, ref } from '../../vendor/apk-contracts/apk-ifc.js';

export const bimApi = () => String(globalThis.APK_BIM_API || '/api/bim').replace(/\/$/, '');

/** The URL of a part's .ifc type (ids are <maker>/<model>). */
export function partIfcUrl(pid, base = bimApi()) {
  const [maker, model] = String(pid).split('/');
  return `${base}/parts/${encodeURIComponent(maker)}/${encodeURIComponent(model)}.ifc`;
}

/** Every part id the rack's devices name. */
export function partIdsOf(rack) {
  return [...new Set((rack.installed || []).map((d) => d.bimId).filter((p) => /^[a-z0-9-]+\/[a-z0-9-]+$/.test(String(p || ''))))].sort();
}

/** The part's type entity in its own .ifc (Tag = the part id, else the only type). */
export function partTypeEntity(file, partId) {
  const types = file.entities.filter((e) => isTypeObject(e.type));
  if (partId) {
    const byTag = types.find((t) => t.args[7] === partId);
    if (byTag) return byTag;
  }
  return types.length === 1 ? types[0] : (types.find((t) => /^IFC[A-Z]+TYPE$/.test(t.type) && t.args[7]) ?? null);
}

/** Fetch the .ifc types the rack's devices need (cached: pid → text | null). → {types: {pid: text}, missing: [pid]}. */
export async function loadPartTypes(rack, cache, { fetchFn = globalThis.fetch, base = bimApi() } = {}) {
  const missing = [];
  for (const pid of partIdsOf(rack)) {
    if (!cache.has(pid)) {
      let text = null;
      try {
        const r = await fetchFn(partIfcUrl(pid, base), { headers: { Accept: 'model/step, application/x-step' } });
        if (r.ok) text = await r.text();
      } catch (_) { text = null; }
      cache.set(pid, text && text.startsWith('ISO-10303-21') ? text : null);
    }
    if (!cache.get(pid)) missing.push(pid);
  }
  const types = {};
  for (const [pid, text] of cache) if (text) types[pid] = text;
  return { types, missing };
}

/**
 * Copy one part's type object out of its own .ifc into the writer W: the type, its sets, its nested ports and
 * their sets, keeping their GlobalIds. Its owner history goes (optional), its units and contexts become this
 * file's. → {ref, entity, name}.
 */
export function copyType(W, file, t, { ctx, bodyCtx, unitByKey, contextUnits }) {
  const include = new Set([t.id]);
  const portIds = new Set();
  for (const e of file.entities) {
    if (e.type === 'IFCRELNESTS' && isRef(e.args[4]) && e.args[4].id === t.id) {
      include.add(e.id);
      for (const r of e.args[5] ?? []) if (isRef(r)) portIds.add(r.id);
    }
  }
  for (const id of portIds) include.add(id);
  for (const e of file.entities) {
    if (e.type === 'IFCRELDEFINESBYPROPERTIES' && (e.args[4] ?? []).every((r) => isRef(r) && portIds.has(r.id))) include.add(e.id);
  }
  const map = new Map();
  const mapped = (id) => {
    const e = file.byId.get(id);
    if (!e) return undefined;
    if (e.type === 'IFCOWNERHISTORY') return null;
    if (e.type === 'IFCGEOMETRICREPRESENTATIONCONTEXT') return ctx;
    if (e.type === 'IFCGEOMETRICREPRESENTATIONSUBCONTEXT') return bodyCtx;
    if (e.type === 'IFCSIUNIT') return unitByKey(e) ?? undefined;
    if (e.type === 'IFCCONTEXTDEPENDENTUNIT' && contextUnits.has(e.args[2])) return contextUnits.get(e.args[2]);
    return undefined;
  };
  const order = [];
  const visit = (id) => {
    if (map.has(id)) return;
    const m = mapped(id);
    if (m !== undefined) { map.set(id, m); return; }
    map.set(id, 'pending');
    order.push(id);
    const e = file.byId.get(id);
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (isRef(v)) visit(v.id);
      else if (v && typeof v === 'object' && v.kind === 'typed') walk(v.value);
    };
    e.args.forEach(walk);
  };
  [...include].sort((a, b) => a - b).forEach(visit);
  order.sort((a, b) => a - b);
  const base = W.entities.length;
  order.forEach((id, i) => map.set(id, ref(base + i + 1)));
  const remap = (v) => {
    if (Array.isArray(v)) return v.map(remap);
    if (isRef(v)) return map.get(v.id);
    if (v && typeof v === 'object' && v.kind === 'typed') return { ...v, value: remap(v.value) };
    return v;
  };
  for (const id of order) {
    const e = file.byId.get(id);
    const r = W.add(e.type, ...e.args.map(remap));
    if (e.type === 'IFCCONTEXTDEPENDENTUNIT') contextUnits.set(e.args[2], r);
  }
  return { ref: map.get(t.id), entity: t.type, name: t.args[2] };
}

/** Parse a part's .ifc text and find its type: {file, t} or null. */
export function readPartType(text, pid) {
  if (typeof text !== 'string' || !text) return null;
  try {
    const file = parseStep(text);
    const t = partTypeEntity(file, pid);
    return t ? { file, t } : null;
  } catch (_) { return null; }
}
