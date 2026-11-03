// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * Auto-blank generator: fills unoccupied rack units on a face with 1U blanking panels.
 */
export function autoBlankFace(rack, face = 'front') {
  const totalRu = Math.max(1, rack.totalRu || 42);
  const occupied = new Set();

  (rack.installed || []).forEach(dev => {
    if ((dev.face || 'front') === face) {
      const start = dev.startRu || 1;
      const height = dev.ru || 1;
      for (let u = start; u < start + height; u++) {
        occupied.add(u);
      }
    }
  });

  const blanksAdded = [];
  for (let u = 1; u <= totalRu; u++) {
    if (!occupied.has(u)) {
      blanksAdded.push({
        id: `blk_${Date.now()}_${u}`,
        name: `1U Blank Panel (RU ${u})`,
        startRu: u,
        ru: 1,
        face,
        category: 'Filler',
        powerW: 0,
        btuHr: 0,
        isFiller: true,
      });
    }
  }

  return blanksAdded;
}
