// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The rack_elevation block, in and out — no DOM, no bus, so the tests drive it.

export const BLOCK_TYPE = 'rack_elevation';
export const CATEGORIES = ['Audio', 'Video', 'Network', 'Control', 'Test & Measurement', 'Power', 'Compute', 'Infrastructure', 'Filler', 'Discovered'];

/** A rack from a block (the CAD's toEditor.load, or an opened .json); `rack` is what stays when the block says nothing. */
export function rackFromBlock(block, rack = {}) {
  const out = { ...rack, installed: Array.isArray(rack.installed) ? rack.installed : [] };
  if (!block || typeof block !== 'object') return out;
  out.id = block.id || out.id;
  out.name = block.name || out.name;
  out.room = block.room || out.room;
  out.totalRu = block.totalRu || block.heightU || out.totalRu || 42;
  for (const k of ['frameWeightKg', 'loadRatingKg']) if (block[k] != null) out[k] = block[k];   // the frame (js/rackRollup.js)
  if (Array.isArray(block.installed)) {
    out.installed = block.installed.map((d) => ({ ...d }));
  } else if (Array.isArray(block.devices)) {
    out.installed = block.devices.map((d, i) => ({
      id: d.id || `dev_${i}`,
      name: d.name || d.label || 'Device',
      startRu: d.startRu || d.uPosition || 1,
      ru: d.ru || d.uHeight || 1,
      face: d.face || 'front',
      category: d.category || 'Audio',
      powerW: d.powerW || 0,
      btuHr: d.btuHr || 0,
      ...(d.identity ? { identity: d.identity } : {}),
    }));
  }
  return out;
}

/** The block this rack saves as (toCad.blockSave / blockChanged). */
export function rackToBlock(rack, now = new Date()) {
  return {
    type: BLOCK_TYPE,
    id: rack.id,
    name: rack.name,
    room: rack.room,
    totalRu: rack.totalRu,
    ...(rack.frameWeightKg != null ? { frameWeightKg: rack.frameWeightKg } : {}),
    ...(rack.loadRatingKg != null ? { loadRatingKg: rack.loadRatingKg } : {}),
    installed: rack.installed.map((d) => ({ ...d })),
    timestamp: now.toISOString(),
  };
}

export function rackMeta(rack) {
  const name = String(rack.name || 'rack');
  return {
    title: `${name} (${rack.totalRu} RU)`,
    filename: `elevation_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
  };
}

/** The lowest free RU on `face` that fits `height`, or 0 when the face is full. */
export function nextFreeRu(rack, face, height = 1) {
  const occupied = new Set();
  rack.installed.forEach((d) => {
    if ((d.face || 'front') !== face) return;
    for (let u = d.startRu; u < d.startRu + (d.ru || 1); u++) occupied.add(u);
  });
  for (let u = 1; u <= rack.totalRu - height + 1; u++) {
    let fits = true;
    for (let h = 0; h < height; h++) if (occupied.has(u + h)) { fits = false; break; }
    if (fits) return u;
  }
  return 0;
}

/** A discovered thing's identity: MAC, else serial, else the agent — never an IP. */
export function thingIdentity(t) {
  return (t && (t.mac || t.serial || t.agent)) || '';
}

/**
 * Install every discovered thing (APKSoftapp.discovered().things()) that is not
 * in the rack yet, matched by identity, in the next free RU of `face`. Its height
 * is not known from the network, so it goes in as 1 RU for the user to set.
 * Returns the devices added; a full face adds nothing.
 */
export function installDiscovered(rack, things, face) {
  const have = new Set(rack.installed.map((d) => d.identity).filter(Boolean));
  const added = [];
  for (const t of things || []) {
    const identity = thingIdentity(t);
    if (!identity || have.has(identity)) continue;
    const startRu = nextFreeRu(rack, face, 1);
    if (!startRu) break;
    const dev = {
      id: `disc_${identity.replace(/[^\w]/g, '_')}`,
      name: t.name || [t.vendor, t.model].filter(Boolean).join(' ') || identity,
      startRu,
      ru: 1,
      face,
      category: 'Discovered',
      powerW: 0,
      btuHr: 0,
      identity,
    };
    rack.installed.push(dev);
    have.add(identity);
    added.push(dev);
  }
  return added;
}

/** The rack category a BIM part is shown under (CATEGORIES). */
export function categoryOfPart(bim = {}) {
  const c = `${bim.category || ''} ${bim.class || ''}`.toLowerCase();
  if (/test|measure|meter|scope|analy[sz]er|generator/.test(c)) return 'Test & Measurement';
  if (/video|camera|display|projector/.test(c)) return 'Video';
  if (/network|switch|router/.test(c)) return 'Network';
  if (/control/.test(c)) return 'Control';
  if (/power|pdu|ups/.test(c)) return 'Power';
  if (/comput|server/.test(c)) return 'Compute';
  if (/infrastructure|patch|panel/.test(c)) return 'Infrastructure';
  return 'Audio';
}

/**
 * 📚 A part picked from the BIM library (ROAD-3572: {bim, ref}, `full` the part the ref
 * resolves to when it was read) installed in the next free RU of `face` that fits its
 * height: its name, its rack units, power and weight from the part, and its bimId and bimRef
 * {part, url, rev}. → the device, or null when the face has no room for it.
 */
export function installFromLibrary(rack, item, face, full = null) {
  const bim = (item && item.bim) || {};
  const part = Object.assign({}, bim, full || {});
  const ru = Math.max(1, Math.round(Number(part.ru || (part.physical && part.physical.rack_units)) || 1));
  const startRu = nextFreeRu(rack, face, ru);
  if (!startRu) return null;
  const watts = Number(part.power && part.power.watts) || 0;
  const ref = item && item.ref && item.ref.part ? { part: String(item.ref.part), url: String(item.ref.url || ''), rev: String(item.ref.rev || '') } : null;
  const dev = {
    id: `bim_${String(bim.id || 'part').replace(/[^\w]/g, '_')}_${rack.installed.length + 1}`,
    name: part.name || [part.manufacturer, part.model].filter(Boolean).join(' ') || bim.id,
    startRu,
    ru,
    face,
    category: categoryOfPart(part),
    powerW: watts,
    btuHr: Number(part.power && part.power.btu_hr) || Math.round(watts * 3.412),
    ...(Number(part.physical && part.physical.weight_kg) > 0 ? { weightKg: Number(part.physical.weight_kg) } : {}),
    bimId: bim.id || (ref && ref.part) || '',
    ...(ref ? { bimRef: ref } : {}),
  };
  rack.installed.push(dev);
  return dev;
}
