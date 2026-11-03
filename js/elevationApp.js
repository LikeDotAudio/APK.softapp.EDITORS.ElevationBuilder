// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { BlockBridge } from './blockBridge.js';
import { buildElevationSvg } from './elevationSvg.js';
import { autoBlankFace } from './autoBlank.js';

export class ElevationApp {
  constructor() {
    this.rack = {
      id: 'rck_01',
      name: 'RACK-01',
      room: 'MDF / A01',
      totalRu: 42,
      installed: [],
    };

    this.activeFace = 'front';
    this.showFigure = true;

    this.bridge = new BlockBridge({
      name: 'Elevation Builder',
      type: 'rack_elevation',
      onBlockLoaded: (block, meta) => this.handleBlockLoaded(block, meta),
      onBlockChanged: () => {},
    });

    this.initElements();
    this.attachEvents();
    this.loadInitialData();
  }

  initElements() {
    this.btnOpen = document.getElementById('btn-open');
    this.btnSave = document.getElementById('btn-save');
    this.btnClose = document.getElementById('btn-close');
    this.btnSyncDiscovered = document.getElementById('btn-sync-discovered');

    this.inputRackName = document.getElementById('input-rack-name');
    this.inputTotalRu = document.getElementById('input-total-ru');
    this.selectFace = document.getElementById('select-face');
    this.chkScaleFigure = document.getElementById('chk-scale-figure');

    this.btnAutoBlank = document.getElementById('btn-auto-blank');
    this.btnAddDevice = document.getElementById('btn-add-device');
    this.btnClearFillers = document.getElementById('btn-clear-fillers');

    this.metricsRu = document.getElementById('metrics-ru');
    this.metricsWatts = document.getElementById('metrics-watts');
    this.metricsBtu = document.getElementById('metrics-btu');

    this.previewStage = document.getElementById('preview-stage');
    this.tableBody = document.getElementById('device-table-body');
  }

  attachEvents() {
    this.btnOpen?.addEventListener('click', () => this.promptOpen());
    this.btnSave?.addEventListener('click', () => this.saveBlock());
    this.btnClose?.addEventListener('click', () => this.bridge.close());
    this.btnSyncDiscovered?.addEventListener('click', () => this.loadFromDiscoveredProject());

    this.inputRackName.addEventListener('input', (e) => {
      this.rack.name = e.target.value;
      this.renderPreviewOnly();
      this.bridge.notifyChanged();
    });

    this.inputTotalRu.addEventListener('change', (e) => {
      this.rack.totalRu = parseInt(e.target.value, 10) || 42;
      this.render();
      this.bridge.notifyChanged();
    });

    this.selectFace.addEventListener('change', (e) => {
      this.activeFace = e.target.value;
      this.render();
    });

    this.chkScaleFigure.addEventListener('change', (e) => {
      this.showFigure = e.target.checked;
      this.renderPreviewOnly();
    });

    this.btnAutoBlank.addEventListener('click', () => {
      const blanks = autoBlankFace(this.rack, this.activeFace);
      this.rack.installed.push(...blanks);
      this.render();
      this.bridge.notifyChanged();
    });

    this.btnClearFillers.addEventListener('click', () => {
      this.rack.installed = this.rack.installed.filter(d => !d.isFiller);
      this.render();
      this.bridge.notifyChanged();
    });

    this.btnAddDevice.addEventListener('click', () => {
      const nextU = this.findNextAvailableRu(1);
      this.rack.installed.push({
        id: `dev_${Date.now()}`,
        name: 'New AV Device',
        startRu: nextU,
        ru: 1,
        face: this.activeFace,
        category: 'Audio',
        powerW: 100,
        btuHr: 341,
        isFiller: false,
      });
      this.render();
      this.bridge.notifyChanged();
    });
  }

  findNextAvailableRu(desiredHeight = 1) {
    const occupied = new Set();
    this.rack.installed.forEach(d => {
      if ((d.face || 'front') === this.activeFace) {
        for (let u = d.startRu; u < d.startRu + d.ru; u++) occupied.add(u);
      }
    });
    for (let u = 1; u <= (this.rack.totalRu - desiredHeight + 1); u++) {
      let fits = true;
      for (let h = 0; h < desiredHeight; h++) {
        if (occupied.has(u + h)) { fits = false; break; }
      }
      if (fits) return u;
    }
    return 1;
  }

  loadInitialData() {
    this.loadFromDiscoveredProject().catch(() => {
      this.loadSampleRack();
    });
  }

  async loadFromDiscoveredProject() {
    try {
      const data = await this.bridge.fetchDiscoveredProject();
      if (data && (data.racks || data.rackElevation || data.equipmentRacks)) {
        const racks = data.racks || data.rackElevation || data.equipmentRacks;
        if (Array.isArray(racks) && racks.length > 0) {
          this.handleBlockLoaded(racks[0], { title: racks[0].name });
          return;
        }
      }
    } catch (_) {}
    this.loadSampleRack();
  }

  loadSampleRack() {
    this.rack = {
      id: 'rck_mdf_01',
      name: 'RACK-01 (MDF Core)',
      room: 'MDF',
      totalRu: 42,
      installed: [
        { id: 'd1', name: '48-Port 10G Core Switch', startRu: 42, ru: 1, face: 'front', category: 'Network', powerW: 350, btuHr: 1195 },
        { id: 'd2', name: 'Cat6A Patch Panel 01', startRu: 41, ru: 1, face: 'front', category: 'Infrastructure', powerW: 0, btuHr: 0 },
        { id: 'd3', name: 'Cat6A Patch Panel 02', startRu: 40, ru: 1, face: 'front', category: 'Infrastructure', powerW: 0, btuHr: 0 },
        { id: 'd4', name: 'Audio DSP Core Frame', startRu: 37, ru: 2, face: 'front', category: 'Audio', powerW: 180, btuHr: 614 },
        { id: 'd5', name: '4x1200W Amp Channel A/B', startRu: 34, ru: 2, face: 'front', category: 'Audio', powerW: 850, btuHr: 2900 },
        { id: 'd6', name: '4x1200W Amp Channel C/D', startRu: 32, ru: 2, face: 'front', category: 'Audio', powerW: 850, btuHr: 2900 },
        { id: 'd7', name: 'Micro BareMetal Server Node', startRu: 20, ru: 1, face: 'front', category: 'Compute', powerW: 220, btuHr: 750 },
        { id: 'd8', name: 'Switched PDU (8x C13)', startRu: 5, ru: 1, face: 'front', category: 'Power', powerW: 20, btuHr: 68 },
        { id: 'd9', name: '3000VA Online Double-Conversion UPS', startRu: 1, ru: 3, face: 'front', category: 'Power', powerW: 140, btuHr: 477 },
      ],
    };
    this.render();
  }

  handleBlockLoaded(block, meta = {}) {
    if (!block) return;
    this.rack.id = block.id || this.rack.id;
    this.rack.name = block.name || this.rack.name;
    this.rack.room = block.room || this.rack.room;
    this.rack.totalRu = block.totalRu || block.heightU || this.rack.totalRu;
    if (Array.isArray(block.installed)) {
      this.rack.installed = block.installed;
    } else if (Array.isArray(block.devices)) {
      this.rack.installed = block.devices.map((d, i) => ({
        id: d.id || `dev_${i}`,
        name: d.name || d.label || 'Device',
        startRu: d.startRu || d.uPosition || 1,
        ru: d.ru || d.uHeight || 1,
        face: d.face || 'front',
        category: d.category || 'Audio',
        powerW: d.powerW || 0,
        btuHr: d.btuHr || 0,
      }));
    }
    this.render();
  }

  saveBlock() {
    const block = {
      type: 'rack_elevation',
      id: this.rack.id,
      name: this.rack.name,
      room: this.rack.room,
      totalRu: this.rack.totalRu,
      installed: this.rack.installed,
      timestamp: new Date().toISOString(),
    };
    this.bridge.saveBlock(block, {
      title: `${this.rack.name} (${this.rack.totalRu} RU)`,
      filename: `elevation_${this.rack.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    });
  }

  render() {
    this.inputRackName.value = this.rack.name;
    this.inputTotalRu.value = this.rack.totalRu;
    this.renderMetrics();
    this.renderTable();
    this.renderPreviewOnly();
  }

  renderMetrics() {
    const occupied = this.rack.installed
      .filter(d => (d.face || 'front') === this.activeFace)
      .reduce((sum, d) => sum + (d.ru || 1), 0);
    const watts = this.rack.installed.reduce((sum, d) => sum + (d.powerW || 0), 0);
    const btu = this.rack.installed.reduce((sum, d) => sum + (d.btuHr || 0), 0);
    const pct = Math.round((occupied / this.rack.totalRu) * 100);

    this.metricsRu.textContent = `${occupied} / ${this.rack.totalRu} RU (${pct}%)`;
    this.metricsWatts.textContent = `${watts.toLocaleString()} W`;
    this.metricsBtu.textContent = `${btu.toLocaleString()} BTU/hr`;
  }

  renderTable() {
    this.tableBody.innerHTML = '';
    const filtered = this.rack.installed.filter(d => (d.face || 'front') === this.activeFace);
    // Sort descending by startRu (top of rack to bottom)
    filtered.sort((a, b) => (b.startRu || 0) - (a.startRu || 0));

    filtered.forEach((dev) => {
      const globalIdx = this.rack.installed.indexOf(dev);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-idx"><input type="number" class="cell-input text-center" data-idx="${globalIdx}" data-field="startRu" value="${dev.startRu}"></td>
        <td class="col-idx"><input type="number" class="cell-input text-center" data-idx="${globalIdx}" data-field="ru" value="${dev.ru}"></td>
        <td><input type="text" class="cell-input" data-idx="${globalIdx}" data-field="name" value="${dev.name}"></td>
        <td>
          <select class="cell-input" data-idx="${globalIdx}" data-field="category">
            <option value="Audio" ${dev.category === 'Audio' ? 'selected' : ''}>Audio</option>
            <option value="Network" ${dev.category === 'Network' ? 'selected' : ''}>Network</option>
            <option value="Power" ${dev.category === 'Power' ? 'selected' : ''}>Power</option>
            <option value="Compute" ${dev.category === 'Compute' ? 'selected' : ''}>Compute</option>
            <option value="Infrastructure" ${dev.category === 'Infrastructure' ? 'selected' : ''}>Infrastructure</option>
            <option value="Filler" ${dev.category === 'Filler' ? 'selected' : ''}>Filler</option>
          </select>
        </td>
        <td><input type="number" class="cell-input" data-idx="${globalIdx}" data-field="powerW" value="${dev.powerW || 0}"></td>
        <td><input type="number" class="cell-input" data-idx="${globalIdx}" data-field="btuHr" value="${dev.btuHr || 0}"></td>
        <td class="col-actions">
          <button class="btn-icon btn-del-dev" data-idx="${globalIdx}" title="Delete">🗑</button>
        </td>
      `;
      this.tableBody.appendChild(tr);
    });

    this.tableBody.querySelectorAll('.cell-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const i = parseInt(e.target.dataset.idx, 10);
        const f = e.target.dataset.field;
        let val = e.target.value;
        if (f === 'startRu' || f === 'ru' || f === 'powerW' || f === 'btuHr') {
          val = parseInt(val, 10) || 0;
        }
        this.rack.installed[i][f] = val;
        this.renderMetrics();
        this.renderPreviewOnly();
        this.bridge.notifyChanged();
      });
    });

    this.tableBody.querySelectorAll('.btn-del-dev').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = parseInt(e.target.dataset.idx, 10);
        this.rack.installed.splice(i, 1);
        this.render();
        this.bridge.notifyChanged();
      });
    });
  }

  renderPreviewOnly() {
    const svg = buildElevationSvg(this.rack, {
      face: this.activeFace,
      showFigure: this.showFigure,
    });
    this.previewStage.innerHTML = svg;
  }

  promptOpen() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const parsed = JSON.parse(re.target.result);
          this.handleBlockLoaded(parsed, { title: file.name });
        } catch (err) {
          alert('Invalid JSON rack block');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.elevationApp = new ElevationApp();
  });
}
