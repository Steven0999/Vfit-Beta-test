'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(inlineScripts.length, 1, 'expected one inline application script');

const values = new Map();
const localStorage = {
  getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
  setItem(key, value) { values.set(String(key), String(value)); },
  removeItem(key) { values.delete(String(key)); },
  clear() { values.clear(); }
};

function fakeElement() {
  const attributes = new Map();
  const classes = new Set();
  return {
    style: {}, dataset: {}, value: '', checked: false, disabled: false,
    innerHTML: '', innerText: '', textContent: '', id: '', labels: [],
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : !!force;
        if (on) classes.add(name); else classes.delete(name);
        return on;
      }
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) || null; },
    hasAttribute(name) { return attributes.has(name); },
    removeAttribute(name) { attributes.delete(name); },
    appendChild() {}, append() {}, remove() {}, click() {}, focus() {},
    addEventListener() {}, removeEventListener() {}, scrollIntoView() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getContext() {
      return {
        clearRect() {}, fillRect() {}, drawImage() {}, fillText() {},
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
        arc() {}, closePath() {}, measureText() { return { width: 0 }; }
      };
    },
    toDataURL() { return 'data:image/jpeg;base64,AA=='; }
  };
}

const elements = new Map();
const document = {
  body: fakeElement(), visibilityState: 'visible',
  getElementById(id) {
    if (!elements.has(id)) {
      const element = fakeElement();
      element.id = id;
      elements.set(id, element);
    }
    return elements.get(id);
  },
  querySelector() { return fakeElement(); },
  querySelectorAll() { return []; },
  createElement() { return fakeElement(); },
  addEventListener() {}, removeEventListener() {}
};

const authApi = {
  setPersistence() { return Promise.resolve(); },
  onAuthStateChanged() {},
  createUserWithEmailAndPassword() { return Promise.reject(new Error('not used')); },
  signInWithEmailAndPassword() { return Promise.reject(new Error('not used')); }
};
function auth() { return authApi; }
auth.Auth = { Persistence: { LOCAL: 'local' } };

function firestore() {
  return {
    collection() {
      return {
        doc() {
          return {
            get: async () => ({ exists: false, data: () => ({}) }),
            set: async () => {}, update: async () => {}
          };
        },
        where() { return this; }, limit() { return this; },
        get: async () => ({ empty: true, docs: [], forEach() {} })
      };
    }
  };
}
firestore.FieldValue = {
  serverTimestamp() { return new Date().toISOString(); },
  arrayUnion(value) { return value; }, arrayRemove(value) { return value; }
};

const sandbox = {
  console, document, localStorage,
  navigator: { onLine: true, standalone: false, storage: {} },
  location: { href: 'https://example.test/', hash: '', protocol: 'https:' },
  history: { pushState() {}, replaceState() {}, back() {} },
  firebase: { initializeApp() {}, auth, firestore },
  setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
  requestAnimationFrame(callback) { callback(); return 1; },
  requestIdleCallback(callback) { callback(); return 1; },
  addEventListener() {}, removeEventListener() {}, scrollTo() {},
  matchMedia() { return { matches: false, addEventListener() {} }; },
  MutationObserver: class { observe() {} disconnect() {} },
  URL, Blob, Map, Set, Date, Math, JSON, Object, Array, String, Number, RegExp,
  AbortController, Response, Request,
  Image: class {}, FileReader: class {},
  confirm() { return true; }, alert() {}, prompt() { return null; },
  isSecureContext: true
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const expose = `
;globalThis.__vfitTest = {
  normalizeState,
  mergeStateSnapshots,
  stateWithoutLocalImages,
  stateStorageKey,
  recoveryStorageKey,
  escapeJsString,
  safeJsonForInline,
  escapeHtml,
  saveState,
  loadState,
  getState: () => state,
  setState: value => { state = value; },
  setUser: value => { currentUser = value; },
  defaultState: () => deepClone(DEFAULT_STATE)
};`;

vm.createContext(sandbox);
vm.runInContext(inlineScripts[0][1] + expose, sandbox, { filename: 'index-inline.js' });
const app = sandbox.__vfitTest;

// User/imported strings are safe in HTML and inline-event contexts.
assert.equal(app.escapeHtml('<img src=x onerror=1>\'"&'), '&lt;img src=x onerror=1&gt;&#039;&quot;&amp;');
const inlineString = app.escapeJsString(`'"<>&\n`);
assert.ok(!inlineString.includes('<') && !inlineString.includes('>') && !inlineString.includes('"'));
const inlineJson = app.safeJsonForInline({ name: `'</div><script>bad()</script>` });
assert.ok(!/[<>&']/.test(inlineJson));

// Untrusted backups cannot introduce executable/prototype keys or unknown state.
const malicious = JSON.parse('{"goals":{"calories":2100,"__proto__":{"polluted":true}},"unknownTop":"drop-me"}');
const normalized = app.normalizeState(malicious);
assert.equal(normalized.goals.calories, 2100);
assert.equal(normalized.unknownTop, undefined);
assert.equal({}.polluted, undefined);

// Newer cloud preferences win while both histories survive and photos stay local.
const local = app.normalizeState({
  meta: { updatedAt: '2026-01-01T00:00:00.000Z' },
  goals: { calories: 2200 },
  workoutHistory: [{ id: 'local-workout', date: '2026-01-01' }],
  metricsHistory: [{ date: '2026-01-01', weight: 100, photos: { front: 'data:image/jpeg;base64,AA==' } }]
});
const remote = {
  meta: { updatedAt: '2026-02-01T00:00:00.000Z' },
  goals: { calories: 2400 },
  workoutHistory: [{ id: 'cloud-workout', date: '2026-02-01' }],
  metricsHistory: [{ date: '2026-01-01', weight: 99 }]
};
const merged = app.mergeStateSnapshots(local, remote);
assert.equal(merged.goals.calories, 2400);
assert.deepEqual([...merged.workoutHistory.map(item => item.id)].sort(), ['cloud-workout', 'local-workout']);
assert.equal(merged.metricsHistory[0].weight, 99);
assert.equal(merged.metricsHistory[0].photos.front, 'data:image/jpeg;base64,AA==');

// Recovery/cloud copies omit progress images; the primary account save keeps them.
const withoutImages = app.stateWithoutLocalImages(merged);
assert.equal(withoutImages.metricsHistory[0].photos, undefined);

// Device records are isolated by Firebase uid.
localStorage.clear();
app.setUser({ uid: 'user-a' });
app.setState(app.normalizeState({ workoutHistory: [{ id: 'a-only' }] }));
assert.equal(app.saveState({ skipCloud: true, forceBackup: true }), true);
app.setUser({ uid: 'user-b' });
app.loadState('user-b');
assert.equal(app.getState().workoutHistory.length, 0);
app.setUser({ uid: 'user-a' });
app.loadState('user-a');
assert.equal(app.getState().workoutHistory[0].id, 'a-only');

console.log('VFIT state smoke tests passed');
