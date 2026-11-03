// Part of APK.audio - Equipment Rack Elevation Builder
// Ported from OneThing FEATURE.Elevation and 260_elevation

export const EQUIPMENT_CATALOG = [
  { id: 'sw-48p', name: '48-Port PoE+ Core Switch', ru: 1, powerW: 380, btuHr: 1296, category: 'Network' },
  { id: 'dsp-core', name: 'Audio DSP Core Frame', ru: 2, powerW: 150, btuHr: 512, category: 'Audio' },
  { id: 'amp-4ch', name: '4x1000W Class-D Amplifier', ru: 2, powerW: 850, btuHr: 2900, category: 'Audio' },
  { id: 'patch-48', name: '48-Port Cat6A Feedthrough', ru: 1, powerW: 0, btuHr: 0, category: 'Infrastructure' },
  { id: 'bantam-96', name: '96-Point TT Audio Patchbay', ru: 1, powerW: 0, btuHr: 0, category: 'Audio' },
  { id: 'srv-1u', name: 'Micro BareMetal Node', ru: 1, powerW: 220, btuHr: 750, category: 'Compute' },
  { id: 'ups-3u', name: '3000VA Online Double-Conversion UPS', ru: 3, powerW: 120, btuHr: 410, category: 'Power' },
  { id: 'pdu-1u', name: 'Switched Metered PDU (8x C13)', ru: 1, powerW: 15, btuHr: 51, category: 'Power' }
];

export class RackElevationEngine {
  constructor(totalRu = 42) {
    this.totalRu = totalRu;
    this.installed = []; // { id, catalogId, name, startRu, ru, powerW, btuHr }
    this.nextId = 1;
  }

  installDevice(catalogId, startRu) {
    const item = EQUIPMENT_CATALOG.find(e => e.id === catalogId);
    if (!item) return false;

    // Check bounds
    if (startRu < 1 || startRu + item.ru - 1 > this.totalRu) {
      return false;
    }

    // Check collision
    const endRu = startRu + item.ru - 1;
    for (const d of this.installed) {
      const dEnd = d.startRu + d.ru - 1;
      if (!(endRu < d.startRu || startRu > dEnd)) {
        return false; // Collision
      }
    }

    const device = {
      id: this.nextId++,
      catalogId,
      name: item.name,
      startRu,
      ru: item.ru,
      powerW: item.powerW,
      btuHr: item.btuHr
    };
    this.installed.push(device);
    return device;
  }

  removeDevice(id) {
    const before = this.installed.length;
    this.installed = this.installed.filter(d => d.id !== id);
    return this.installed.length < before;
  }

  getMetrics() {
    const occupiedRu = this.installed.reduce((acc, d) => acc + d.ru, 0);
    const totalWatts = this.installed.reduce((acc, d) => acc + d.powerW, 0);
    const totalBtu = this.installed.reduce((acc, d) => acc + d.btuHr, 0);
    const utilizationPct = Math.round((occupiedRu / this.totalRu) * 100);

    return {
      totalRu: this.totalRu,
      occupiedRu,
      availableRu: this.totalRu - occupiedRu,
      utilizationPct,
      totalWatts,
      totalBtu
    };
  }
}
