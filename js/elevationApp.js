// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { buildElevationSvg } from './elevationSvg.js';
import { autoBlankFace } from './autoBlank.js';
import {
  BLOCK_TYPE, CATEGORIES, rackFromBlock, rackToBlock, rackMeta, nextFreeRu, installDiscovered,
} from './rackBlock.js';

const S = () => window.APKSoftapp;

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

    this.discovery = null;     // APKSoftapp.discovered() handle, once the bus answers
    this.liveById = new Map(); // identity -> live { state, why }

    S().describe({
      name: 'Elevation Builder',
      does: 'An EIA-310 19-inch rack elevation (front or rear): what is installed at which RU, with total RU used, power (W) and heat (BTU/hr).',
      inputs: [
        { name: 'Rack elevation block', from: 'the CAD (when opened from a drawing), or a .json file via Open', kind: 'file' },
        { name: 'Discovered devices', from: 'the bus: things scanners and agents found (kinds in config/discovery.json); each row shows its live state', kind: 'bus' },
      ],
      outputs: [
        { name: 'Rack elevation block', to: 'the CAD on Save & Return and on every edit; standalone Save downloads a .json', kind: 'file' },
        { name: 'Printed elevation', to: 'the printer or a PDF (Print / PDF)' },
      ],
      controls: [
        { name: 'Rack name / Total RU / Face', how: 'name the rack, set its height, show front or rear' },
        { name: 'Scale figure', how: 'show or hide the human figure for scale' },
        { name: '+ Install Device', how: 'adds a 1 RU device at the next free slot; edit start RU, height, label, category, W, BTU in the schedule' },
        { name: 'Auto-Blank Empty Slots / Clear Filler Blanks', how: 'fill every gap on this face with blanks, or remove them' },
        { name: 'Discovered', how: 'install what the bus found (1 RU each) that is not in this rack yet' },
        { name: 'Open / Save & Return / Close / Print', how: 'header and preview buttons' },
      ],
      problems: ['bad_json', 'bad_input', 'file_unreadable', 'not_in_cad', 'bus_missing'],
    });

    this.initElements();
    this.createTable();
    this.attachEvents();
    this.loadSampleRack();

    // The CAD (cad.like.audio/host@1): load replaces the sample; request asks for the block.
    S().inheritTheme();
    this.host = S().connectHost({
      editor: 'Elevation Builder',
      blockType: BLOCK_TYPE,
      onLoad: (block, meta) => this.handleBlockLoaded(block, meta),
      onRequest: () => ({ block: rackToBlock(this.rack), meta: rackMeta(this.rack) }),
    });
    this.startDiscovery();
  }

  /** The host is told of every edit; standalone there is nobody to tell. */
  changed() {
    this.host?.changed(rackToBlock(this.rack), rackMeta(this.rack));
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
    this.tableHost = document.getElementById('device-table');
    this.discoveryStatus = document.getElementById('discovery-status');
  }

  attachEvents() {
    this.btnOpen?.addEventListener('click', () => this.promptOpen());
    this.btnSave?.addEventListener('click', () => this.saveBlock());
    this.btnClose?.addEventListener('click', () => this.host.close());
    this.btnSyncDiscovered?.addEventListener('click', () => this.installFromDiscovered());

    this.inputRackName.addEventListener('input', (e) => {
      this.rack.name = e.target.value;
      this.renderPreviewOnly();
      this.changed();
    });

    this.inputTotalRu.addEventListener('change', (e) => {
      this.rack.totalRu = parseInt(e.target.value, 10) || 42;
      this.render();
      this.changed();
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
      this.changed();
    });

    this.btnClearFillers.addEventListener('click', () => {
      this.rack.installed = this.rack.installed.filter(d => !d.isFiller);
      this.render();
      this.changed();
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
      this.changed();
    });
  }

  findNextAvailableRu(desiredHeight = 1) {
    return nextFreeRu(this.rack, this.activeFace, desiredHeight) || 1;
  }

  /** What the bus knows, through APKSoftapp; the kinds offered are config/discovery.json's. */
  async startDiscovery() {
    let kinds = [];
    try {
      const res = await fetch('./config/discovery.json', { cache: 'no-store' });
      if (res.ok) kinds = (await res.json()).kinds || [];
    } catch (_) { /* no config: every kind */ }
    const d = await S().discovered({
      kinds,
      onChange: (things) => this.takeDiscovered(things),
    });
    this.discovery = d.ok ? d : null;
    this.discoveryProblem = d.ok ? null : d.problem;
    if (!d.ok) this.sayDiscovery(d.reason, 'dead');
    else this.takeDiscovered(d.things());
  }

  takeDiscovered(things) {
    this.liveById = new Map(things.map((t) => [t.mac || t.serial || t.agent, t.live]));
    this.sayDiscovery(`${things.length} discovered on the bus`, things.length ? 'good' : 'kinda');
    this.renderTable();
  }

  sayDiscovery(text, state) {
    if (!this.discoveryStatus) return;
    this.discoveryStatus.textContent = text;
    this.discoveryStatus.setAttribute('data-apk-state', state);
  }

  installFromDiscovered() {
    if (!this.discovery) {
      // the button did nothing before: say why, and Retry reads the bus again
      S().showProblem(this.discoveryProblem || 'bus_missing', {
        subject: 'Discovered devices',
        onRetry: () => this.startDiscovery().then(() => { if (this.discovery) this.installFromDiscovered(); }),
      });
      return;
    }
    const added = installDiscovered(this.rack, this.discovery.things(), this.activeFace);
    this.sayDiscovery(added.length
      ? `Installed ${added.length} discovered device(s) at 1 RU each: set their real height.`
      : 'Every discovered device is already in this rack (or the face is full).', 'kinda');
    if (!added.length) return;
    this.render();
    this.changed();
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
    this.rack = rackFromBlock(block, this.rack);
    const tag = document.getElementById('block-tag');
    if (tag) tag.textContent = meta.title || meta.blockName || meta.name || 'RACK ELEVATION BLOCK';
    this.render();
  }

  /** Save: into the drawing inside the CAD, a .json download standalone. */
  saveBlock() {
    this.host.save(rackToBlock(this.rack), rackMeta(this.rack));
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

  createTable() {
    const live = (identity) => {
      const span = document.createElement('span');
      const l = identity ? this.liveById.get(identity) : null;
      span.className = 'live-state';
      span.setAttribute('data-apk-state', l ? l.state : (identity ? 'dead' : ''));
      span.textContent = identity ? (l ? `${l.state} · ${l.why || ''}` : 'dead · not on the bus') : '';
      span.title = identity || '';
      return span;
    };
    this.table = window.APKTable.create(this.tableHost, {
      id: 'elevation-installed',
      columns: [
        { key: 'startRu', label: 'Start RU', type: 'number' },
        { key: 'ru', label: 'RU Ht', type: 'number' },
        { key: 'name', label: 'Device Label / Model' },
        { key: 'category', label: 'Category', type: 'select', options: CATEGORIES },
        { key: 'powerW', label: 'Power (Watts)', type: 'number' },
        { key: 'btuHr', label: 'Thermal (BTU/hr)', type: 'number' },
        { key: 'identity', label: 'Live', render: (v) => live(v) },
      ],
      rows: [],
      onEdit: () => {
        this.renderMetrics();
        this.renderPreviewOnly();
        this.changed();
      },
      onDelete: (i, row) => {
        const at = this.rack.installed.indexOf(row);
        if (at >= 0) this.rack.installed.splice(at, 1);
        this.render();
        this.changed();
      },
      empty: 'Nothing installed on this face.',
    });
  }

  /** The rows are the installed devices themselves (top of rack first): an edit lands on the rack. */
  renderTable() {
    if (!this.table) return;
    const rows = this.rack.installed
      .filter(d => (d.face || 'front') === this.activeFace)
      .sort((a, b) => (b.startRu || 0) - (a.startRu || 0));
    this.table.setRows(rows);
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
      reader.onerror = () => S().showProblem('file_unreadable', {
        subject: file.name, detail: reader.error && reader.error.message, onRetry: () => this.promptOpen(),
      });
      reader.onload = (re) => {
        try {
          const parsed = JSON.parse(re.target.result);
          if (!parsed || typeof parsed !== 'object') throw new TypeError('the file holds no rack object');
          this.handleBlockLoaded(parsed, { title: file.name });
        } catch (err) {
          S().showProblem(err instanceof SyntaxError ? 'bad_json' : 'bad_input', {
            subject: file.name,
            detail: err.message,
            fix: ['Open a rack elevation block .json (Save & Return outside the CAD downloads one).'],
            onRetry: () => this.promptOpen(),
          });
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
