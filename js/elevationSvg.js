// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const CATEGORY_COLORS = {
  Network: { fill: '#1E3A5F', border: '#3B82F6', text: '#93C5FD' },
  Audio: { fill: '#144133', border: '#10B981', text: '#A7F3D0' },
  Power: { fill: '#4C1D24', border: '#EF4444', text: '#FECACA' },
  Compute: { fill: '#3B2456', border: '#A855F7', text: '#E9D5FF' },
  Infrastructure: { fill: '#1E293B', border: '#64748B', text: '#CBD5E1' },
  Filler: { fill: '#101726', border: '#3f3f46', text: '#64748B' },
};

export function buildElevationSvg(rack, options = {}) {
  const { face = 'front', showFigure = true } = options;
  const totalRu = Number(rack.totalRu) || 42;

  // Rack geometry in mm (1U = 44.45mm, 19" width = 482.6mm, usable width = 450mm)
  const ruHeightMm = 44.45;
  const rackInnerWidthMm = 450;
  const railWidthMm = 20;
  const rackTotalWidthMm = rackInnerWidthMm + railWidthMm * 2;
  const rackTotalHeightMm = totalRu * ruHeightMm;

  const marginMm = 25;
  const figureWidthMm = 120;
  const figureTotalWidthMm = showFigure ? figureWidthMm + 30 : 0;

  const totalSvgWidth = rackTotalWidthMm + marginMm * 2 + figureTotalWidthMm;
  const totalSvgHeight = rackTotalHeightMm + marginMm * 2 + 30;

  const rackX = marginMm;
  const rackY = marginMm + 15;

  const parts = [];

  // Rack frame and rails
  parts.push(`<rect x="${rackX}" y="${rackY}" width="${rackTotalWidthMm}" height="${rackTotalHeightMm}" rx="4" fill="#0C1220" stroke="#3f3f46" stroke-width="1.5"/>`);
  // Left and right mounting rails
  parts.push(`<rect x="${rackX}" y="${rackY}" width="${railWidthMm}" height="${rackTotalHeightMm}" fill="#161F36" stroke="#3f3f46" stroke-width="0.8"/>`);
  parts.push(`<rect x="${rackX + rackTotalWidthMm - railWidthMm}" y="${rackY}" width="${railWidthMm}" height="${rackTotalHeightMm}" fill="#161F36" stroke="#3f3f46" stroke-width="0.8"/>`);

  // RU grid lines and EIA numbers (RU 1 at bottom, RU totalRu at top)
  for (let u = 1; u <= totalRu; u++) {
    const ruY = rackY + (totalRu - u) * ruHeightMm;

    // Divider line
    parts.push(`<line x1="${rackX}" y1="${ruY}" x2="${rackX + rackTotalWidthMm}" y2="${ruY}" stroke="#2c2c2c" stroke-width="0.4"/>`);

    // Rail screw hole markers (3 per U standard EIA-310)
    [0.2, 0.5, 0.8].forEach(fraction => {
      const holeY = ruY + fraction * ruHeightMm;
      parts.push(`<circle cx="${rackX + railWidthMm / 2}" cy="${holeY}" r="1.5" fill="#121212" stroke="#3f3f46" stroke-width="0.4"/>`);
      parts.push(`<circle cx="${rackX + rackTotalWidthMm - railWidthMm / 2}" cy="${holeY}" r="1.5" fill="#121212" stroke="#3f3f46" stroke-width="0.4"/>`);
    });

    // RU number text on rails
    parts.push(`<text x="${rackX + railWidthMm / 2}" y="${ruY + ruHeightMm / 2 + 2}" fill="#64748B" font-size="7" font-weight="bold" text-anchor="middle" font-family="monospace">${u}</text>`);
    parts.push(`<text x="${rackX + rackTotalWidthMm - railWidthMm / 2}" y="${ruY + ruHeightMm / 2 + 2}" fill="#64748B" font-size="7" font-weight="bold" text-anchor="middle" font-family="monospace">${u}</text>`);
  }

  // Draw installed devices
  const devices = (rack.installed || []).filter(d => (d.face || 'front') === face);
  devices.forEach(dev => {
    const startU = Number(dev.startRu) || 1;
    const heightU = Number(dev.ru) || 1;
    // Y coordinate in SVG (top of device):
    const topU = startU + heightU - 1;
    const devY = rackY + (totalRu - topU) * ruHeightMm;
    const devHeightMm = heightU * ruHeightMm;
    const devWidthMm = rackInnerWidthMm;
    const devX = rackX + railWidthMm;

    const colors = CATEGORY_COLORS[dev.category] || CATEGORY_COLORS.Infrastructure;

    parts.push(`<g class="device-group" data-id="${esc(dev.id)}">`);
    parts.push(`<rect x="${devX + 1}" y="${devY + 1}" width="${devWidthMm - 2}" height="${devHeightMm - 2}" rx="2" fill="${colors.fill}" stroke="${colors.border}" stroke-width="1"/>`);

    // Device label and RU tag
    const titleY = devY + Math.min(devHeightMm / 2 + 3, 14);
    parts.push(`<text x="${devX + 12}" y="${titleY}" fill="${colors.text}" font-size="9" font-weight="bold" font-family="sans-serif">${esc(dev.name)}</text>`);

    if (devHeightMm >= 30) {
      parts.push(`<text x="${devX + 12}" y="${devY + devHeightMm - 8}" fill="#888888" font-size="7" font-family="monospace">${dev.powerW ? `${Number(dev.powerW) || 0}W · ${Number(dev.btuHr) || 0} BTU/hr` : ''} · ${esc(dev.category || '')}</text>`);
    }

    parts.push(`<text x="${devX + devWidthMm - 12}" y="${titleY}" fill="#888888" font-size="8" font-weight="bold" text-anchor="end" font-family="monospace">${heightU}U</text>`);
    parts.push(`</g>`);
  });

  // Human silhouette for physical scale (6ft / ~1830mm tall person)
  if (showFigure) {
    const figX = rackX + rackTotalWidthMm + 35;
    const personHeightMm = 1830 * 0.9; // ~6ft height
    const groundY = rackY + rackTotalHeightMm;
    const headY = groundY - personHeightMm;

    // Head
    parts.push(`<circle cx="${figX + 25}" cy="${headY + 20}" r="16" fill="#2c2c2c" stroke="#4A9EFF" stroke-width="1"/>`);
    // Body & Legs
    parts.push(`<rect x="${figX + 10}" y="${headY + 38}" width="30" height="70" rx="6" fill="#2c2c2c" stroke="#4A9EFF" stroke-width="1"/>`);
    parts.push(`<line x1="${figX + 18}" y1="${headY + 108}" x2="${figX + 18}" y2="${groundY}" stroke="#4A9EFF" stroke-width="3" stroke-linecap="round"/>`);
    parts.push(`<line x1="${figX + 32}" y1="${headY + 108}" x2="${figX + 32}" y2="${groundY}" stroke="#4A9EFF" stroke-width="3" stroke-linecap="round"/>`);
    parts.push(`<text x="${figX + 25}" y="${groundY + 15}" fill="#888888" font-size="7" text-anchor="middle" font-family="sans-serif">6ft / 1.83m Scale</text>`);
  }

  // Header Title
  parts.push(`<text x="${rackX + rackTotalWidthMm / 2}" y="${marginMm}" fill="#f4f4f5" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">${esc(rack.name || 'EQUIPMENT RACK')} · ${esc(String(face).toUpperCase())} ELEVATION (${totalRu} RU)</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSvgWidth} ${totalSvgHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
    + parts.join('')
    + `</svg>`;
}
