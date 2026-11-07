// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { buildElevationSvg } from './elevationSvg.js';
import { autoBlankFace } from './autoBlank.js';
import {
  BLOCK_TYPE, CATEGORIES, rackFromBlock, rackToBlock, rackMeta, nextFreeRu, installDiscovered, installFromLibrary, notRackable, LIBRARY_FILTER,
} from './rackBlock.js';
import { libraryButton, acceptLibraryDrops } from './bimLibrary.js';
import { rackRollup, metricText } from './rackRollup.js';
import { rackToIfc } from './ifc/rackToIfc.js';
import { ifcToRack } from './ifc/ifcToRack.js';
import { loadPartTypes } from './ifc/partTypes.js';

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
    this.partTypes = new Map(); // part id -> its .ifc text (null: the library did not answer), for Save Model
    this.liveById = new Map(); // identity -> live { state, why }

    S().describe({
      name: 'Elevation Builder',
      does: 'An EIA-310 19-inch rack elevation (front or rear): what is installed at which RU, with total RU used, power (W) and heat (BTU/hr).',
      inputs: [
        { name: 'Rack elevation block', from: 'the CAD (when opened from a drawing), or via Open: the block .json or its .ifc twin (APKSoftapp.openModel)', kind: 'file' },
        { name: 'Device part types', from: 'GET /api/bim/parts/<maker>/<model>.ifc: the IFC type of each installed BIM part, embedded on Save Model', kind: 'http' },
        { name: 'Discovered devices', from: 'the bus: things scanners and agents found (kinds in config/discovery.json); each row shows its live state', kind: 'bus' },
      ],
      outputs: [
        { name: 'Rack elevation block', to: 'the CAD on Save & Return and on every edit; standalone Save downloads a .json', kind: 'file' },
        { name: 'Model + .ifc twin', to: '🏗 Save Model: <rack>.json and <rack>.ifc (IFC4X3_ADD2: an EquipmentRack assembly, its IfcFurniture frame, every device at its RU typed by its BIM part, the load / heat / weight roll-ups)', kind: 'file' },
        { name: 'Printed elevation', to: 'the printer or a PDF (Print / PDF)' },
      ],
      controls: [
        { name: 'Rack name / Total RU / Face', how: 'name the rack, set its height, show front or rear' },
        { name: 'Empty Frame Weight / Static Load Rating (kg)', how: 'the frame counts in the rack\'s weight, not its payload; the payload is checked against the rating (rack_overload)' },
        { name: 'Scale figure', how: 'show or hide the human figure for scale' },
        { name: '📚 Library', how: 'install a device from the BIM library (Ctrl+Shift+L, or drag a part onto the rack) at the next free slot that fits its rack units; it keeps its bimId and bimRef; edit start RU, label, W, BTU in the schedule' },
        { name: 'Auto-Blank Empty Slots / Clear Filler Blanks', how: 'fill every gap on this face with blanks, or remove them' },
        { name: 'Discovered', how: 'install what the bus found (1 RU each) that is not in this rack yet' },
        { name: 'Open / Save Model / Save & Return / Close / Print', how: 'header and preview buttons; Open takes the .json or the .ifc, Save Model writes both' },
      ],
      problems: ['bad_json', 'bad_input', 'file_unreadable', 'not_in_cad', 'bus_missing', 'save_failed'],
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
    this.btnSaveModel = document.getElementById('btn-save-model');
    this.inputFrameKg = document.getElementById('input-frame-kg');
    this.inputLoadRating = document.getElementById('input-load-rating');
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
    this.metricsKg = document.getElementById('metrics-kg');

    this.previewStage = document.getElementById('preview-stage');
    this.tableHost = document.getElementById('device-table');
    this.discoveryStatus = document.getElementById('discovery-status');
  }

  attachEvents() {
    this.btnOpen?.addEventListener('click', () => this.promptOpen());
    this.btnSave?.addEventListener('click', () => this.saveBlock());
    this.btnSaveModel?.addEventListener('click', () => this.saveModel());
    // the frame: its own weight and its static load rating (js/rackRollup.js; empty = unknown)
    for (const [input, key] of [[this.inputFrameKg, 'frameWeightKg'], [this.inputLoadRating, 'loadRatingKg']]) {
      input?.addEventListener('change', (e) => {
        const n = Number(e.target.value);
        if (e.target.value === '' || !Number.isFinite(n) || n < 0) delete this.rack[key];
        else this.rack[key] = n;
        this.renderMetrics();
        this.changed();
      });
    }
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

    // 📚 Library (ROAD-3572): every installed device is a BIM part, with its BIM reference
    this.btnAddDevice?.replaceWith(libraryButton((items) => this.installParts(items), {
      className: 'btn btn-primary btn-sm', title: 'Install a device from the BIM library', multiple: true,
      filter: LIBRARY_FILTER }));   // ROAD-3604: physical parts only — no Concepts offered
    if (this.previewStage) acceptLibraryDrops(this.previewStage, (item) => this.installParts([item]));
  }

  /** Install parts picked from the library, each at the next free RU that fits it. */
  async installParts(items) {
    let added = 0;
    const refused = [];
    for (const item of items) {
      const full = await this.fullPart(item);
      const why = notRackable(Object.assign({}, item && item.bim, full || {}));
      if (why) { refused.push(why); continue; }   // ROAD-3601: a Concept is refused, never racked as Audio
      if (installFromLibrary(this.rack, item, this.activeFace, full)) added += 1;
    }
    const noRoom = items.length - added - refused.length;
    const say = [...refused, ...(noRoom > 0 ? [`No room on the ${this.activeFace} face for ${noRoom} part(s).`] : [])];
    if (say.length) this.sayDiscovery(say.join(' '), refused.length ? 'dead' : 'kinda');
    if (!added) return;
    this.render();
    this.changed();
  }

  /** The full part (rack units, power) the pick's ref resolves to on the live library; null elsewhere. */
  async fullPart(item) {
    const url = item && item.ref && item.ref.url;
    if (!url || !/\/api\/bim\/parts\//.test(url) || item.bim.ru) return null;
    try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch (_) { return null; }
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
    this.discoveryStatus.title = text;   // the line is narrow: the whole message on hover
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

  /** An empty rack: every device comes from the BIM library, Discovered, or an opened block (ROAD-3572). */
  loadSampleRack() {
    this.rack = { id: 'rck_mdf_01', name: 'RACK-01 (MDF Core)', room: 'MDF', totalRu: 42, installed: [] };
    this.render();
  }

  handleBlockLoaded(block, meta = {}) {
    if (!block) return;
    this.rack = rackFromBlock(block, this.rack);
    const tag = document.getElementById('block-tag');
    if (tag) tag.textContent = meta.title || meta.blockName || meta.name || 'RACK ELEVATION BLOCK';
    this.render();
  }

  /** Save Model: the rack's block .json AND its .ifc twin, both or neither (APKSoftapp.saveModel). */
  async saveModel() {
    const r = await S().saveModel(this.rack, {
      name: rackMeta(this.rack).filename,
      toJson: (rack) => rackToBlock(rack),
      toIfc: async (rack) => rackToIfc(rack, { types: (await loadPartTypes(rack, this.partTypes)).types }),
    });
    if (!r.ok && !r.cancelled && r.problem) S().showProblem(r.problem);
  }

  /** Save: into the drawing inside the CAD, a .json download standalone. */
  saveBlock() {
    this.host.save(rackToBlock(this.rack), rackMeta(this.rack));
  }

  render() {
    this.inputRackName.value = this.rack.name;
    this.inputTotalRu.value = this.rack.totalRu;
    if (this.inputFrameKg) this.inputFrameKg.value = this.rack.frameWeightKg ?? '';
    if (this.inputLoadRating) this.inputLoadRating.value = this.rack.loadRatingKg ?? '';
    this.renderMetrics();
    this.renderTable();
    this.renderPreviewOnly();
  }

  renderMetrics() {
    const occupied = this.rack.installed
      .filter(d => (d.face || 'front') === this.activeFace)
      .reduce((sum, d) => sum + (d.ru || 1), 0);
    const pct = Math.round((occupied / this.rack.totalRu) * 100);
    // load, heat and weight of the whole rack (both faces) by the one shared roll-up (js/rackRollup.js)
    const r = rackRollup(this.rack);
    const text = metricText(r);

    this.metricsRu.textContent = `${occupied} / ${this.rack.totalRu} RU (${pct}%)`;
    this.metricsWatts.textContent = text.watts;
    this.metricsBtu.textContent = text.heat;
    if (this.metricsKg) {
      this.metricsKg.textContent = text.weight;
      this.metricsKg.setAttribute('data-apk-state', r.overload === true ? 'dead' : r.overload === false ? 'good' : '');
    }
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
        { key: 'weightKg', label: 'Weight (kg)', type: 'number' },
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

  /** Open: the block .json or its .ifc twin (APKSoftapp.openModel), into this editor. */
  async promptOpen() {
    const o = await S().openModel({
      fromIfc: (text) => rackToBlock(ifcToRack(text).rack),
      fromJson: (data) => {
        if (!data || typeof data !== 'object') throw new TypeError('the file holds no rack object');
        return data;
      },
    });
    if (!o.ok) {
      if (!o.cancelled && o.problem) {
        S().showProblem(o.problem, {
          fix: ['Open a rack elevation block .json, or its .ifc twin (Save Model writes both).'],
          onRetry: () => this.promptOpen(),
        });
      }
      return;
    }
    this.handleBlockLoaded(o.model, { title: o.name });
    this.changed();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.elevationApp = new ElevationApp();
  });
}
