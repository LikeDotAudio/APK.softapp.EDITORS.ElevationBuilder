// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE RACK'S LOAD, HEAT AND WEIGHT (IFC-CORE-DELTAS power-3, ROAD-3582), by the
 * ONE shared roll-up: contracts/src/ifc/rollup.ts, vendored in apk-ifc.js (its
 * Python twin DATABASE.server.BIM SRC/bim/rollup.py writes the same figures into
 * the rig's .ifc). Its rules: a declared total wins, unknown stays unknown (never
 * 0), heat falls back to the power (assumed), the frame's weight is in the rack's
 * weight but not in its payload, and the payload is checked against the rack's
 * static load rating.
 *
 * What a row states: powerW (W), btuHr (display; heat in W is btuHr / 3.412 only
 * when it is not just the power × 3.412), weightKg (kg). A 0 W row is unknown
 * unless it is a filler (a blank draws nothing). The rack itself may state
 * frameWeightKg (its empty frame) and loadRatingKg (APK_Rack.StaticLoadRating).
 * Nothing here is stored: the figures are computed on read.
 */
import { rollup } from '../vendor/apk-contracts/apk-ifc.js';

export const BTU_PER_W = 3.412;

const pos = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The row's own figures, as a roll-up node. */
export function deviceNode(d) {
  const filler = !!d.isFiller;
  const watts = filler ? (pos(d.powerW) ?? 0) : pos(d.powerW);
  const btu = pos(d.btuHr);
  const derived = watts != null && btu != null && btu === Math.round(watts * BTU_PER_W);
  const heatW = filler && btu == null ? 0 : btu != null && !derived ? Math.round((btu / BTU_PER_W) * 10) / 10 : null;
  const weightKg = Number.isFinite(Number(d.weightKg)) && d.weightKg !== '' && d.weightKg != null && Number(d.weightKg) >= 0 ? Number(d.weightKg) : null;
  return { id: d.id, watts, heatW, weightKg, parts: [] };
}

/** The rack as a roll-up node: its frame (when it states a weight) and every installed row, both faces. */
export function rackNode(rack) {
  const parts = (rack.installed || []).map(deviceNode);
  if (pos(rack.frameWeightKg) != null) parts.unshift({ id: `${rack.id || 'rack'}/frame`, role: 'frame', weightKg: pos(rack.frameWeightKg) });
  const node = { id: rack.id || 'rack', parts };
  if (pos(rack.loadRatingKg) != null) node.capacityKg = pos(rack.loadRatingKg);
  return node;
}

/** The rack's roll-up (contracts rollup()): watts, heatW, weightKg, va, partial / unknown counts, overload. */
export function rackRollup(rack) {
  return rollup(rackNode(rack));
}

const fmt = (n, digits = 0) => (n == null ? '?' : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits }));

/** The three metric lines the panel shows: W, BTU/hr (display of heat W) and kg, each saying when it is partial or assumed. */
export function metricText(r) {
  const unknownNote = (key) => (r.partial[key] ? ` (+${r.unknown[key]} unknown)` : '');
  const watts = r.watts == null ? 'unknown' : `${fmt(r.watts)} W${unknownNote('watts')}`;
  const heat = r.heatW == null ? 'unknown'
    : `${fmt(Math.round(r.heatW * BTU_PER_W))} BTU/hr${r.heatAssumed ? ' (assumed from power)' : ''}${unknownNote('heatW')}`;
  let weight = r.weightKg == null ? 'unknown' : `${fmt(r.weightKg, 1)} kg${unknownNote('weightKg')}`;
  if (r.capacityKg != null) {
    weight += r.overload === true ? ` · OVER its ${fmt(r.capacityKg, 1)} kg rating`
      : r.overload === false ? ` · within its ${fmt(r.capacityKg, 1)} kg rating` : ` · rating ${fmt(r.capacityKg, 1)} kg, unknown weight could tip it`;
  }
  return { watts, heat, weight };
}
