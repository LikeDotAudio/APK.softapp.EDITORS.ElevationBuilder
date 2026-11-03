// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import test from 'node:test';
import assert from 'node:assert/strict';

import { autoBlankFace } from '../js/autoBlank.js';
import { buildElevationSvg } from '../js/elevationSvg.js';

test('Auto-Blank Face Gap Filling', () => {
  const rack = {
    totalRu: 10,
    installed: [
      { id: 'd1', name: 'Dev 1', startRu: 1, ru: 2, face: 'front' }, // covers 1, 2
      { id: 'd2', name: 'Dev 2', startRu: 5, ru: 2, face: 'front' }, // covers 5, 6
    ],
  };

  const blanks = autoBlankFace(rack, 'front');
  // Free slots: 3, 4, 7, 8, 9, 10 -> exactly 6 blanks
  assert.equal(blanks.length, 6);
  assert.equal(blanks[0].startRu, 3);
  assert.equal(blanks[1].startRu, 4);
  assert.equal(blanks[2].startRu, 7);
  assert.equal(blanks[5].startRu, 10);
});

test('SVG Rack Elevation Rendering', () => {
  const rack = {
    name: 'TEST-RACK-01',
    totalRu: 42,
    installed: [
      { id: 'sw1', name: 'Core Switch 48P', startRu: 42, ru: 1, face: 'front', category: 'Network', powerW: 350, btuHr: 1200 },
    ],
  };

  const svg = buildElevationSvg(rack, { face: 'front', showFigure: true });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('TEST-RACK-01'));
  assert.ok(svg.includes('Core Switch 48P'));
  assert.ok(svg.includes('6ft / 1.83m Scale'));
  assert.ok(svg.endsWith('</svg>'));
});
