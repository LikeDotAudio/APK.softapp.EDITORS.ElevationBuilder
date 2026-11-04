// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The vendored vendor/apk-softapp/apk-softapp.js in a stub window (vm), the
// world()/fire() of WEB.Frontend-Assets/SRC/FrontEnd/shared/apk-softapp.test.js:
// framed → a parent records what it is posted; fire() plays a message at us.

import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../vendor/apk-softapp/apk-softapp.js', import.meta.url), 'utf8');
export const ORIGIN = 'http://bench:8080';

export function world({ framed = true } = {}) {
  const listeners = [];
  const toParent = [];
  const downloads = [];
  const body = { children: [], appendChild(n) { this.children.push(n); return n; } };
  const doc = {
    title: 'Test Editor',
    body,
    documentElement: { style: { setProperty() {} } },
    getElementById: (id) => body.children.find((n) => n.id === id) || null,
    createElement: (tag) => ({
      tag, style: {}, attrs: {}, textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      click() { downloads.push({ name: this.download, text: downloads.blob && downloads.blob.text }); },
      remove() {},
    }),
  };
  const win = {
    location: { origin: ORIGIN },
    document: doc,
    addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); },
    removeEventListener: (t, fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
    Blob: class { constructor(parts, o) { this.text = parts.join(''); this.type = o.type; } },
    URL: { createObjectURL: (b) => { downloads.blob = b; return 'blob:1'; }, revokeObjectURL() {} },
    setTimeout: (fn) => { fn(); return 1; },
    setInterval: () => 1, clearInterval() {},
    JSON, Date, Math, Promise, Object, Array, String, Number, isFinite, parseInt, RegExp,
  };
  win.window = win; win.globalThis = win;
  const parent = { postMessage: (m, o) => toParent.push({ m: JSON.parse(JSON.stringify(m)), o }) };
  win.parent = framed ? parent : win;
  vm.runInNewContext(SRC, win);
  const fire = (data, { source = parent, origin = ORIGIN } = {}) =>
    listeners.slice().forEach((fn) => fn({ data, source, origin }));
  return { win, S: win.APKSoftapp, toParent, downloads, fire, parent };
}
