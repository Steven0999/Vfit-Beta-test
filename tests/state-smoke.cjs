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
  calculateReadinessScore,
  getShiftForDate,
  smartProgressionForExercise,
  weeklyReportFor,
  buildPushReminderSchedule,
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
  metricsHistory: [{ date: '2026-01-01', weight: 99 }],
  checkIns: [{ id: 'cloud-checkin', date: '2026-02-01', energy: 4 }],
  readinessLogs: { '2026-02-01': { score: 82 } }
};
const merged = app.mergeStateSnapshots(local, remote);
assert.equal(merged.goals.calories, 2400);
assert.deepEqual([...merged.workoutHistory.map(item => item.id)].sort(), ['cloud-workout', 'local-workout']);
assert.equal(merged.metricsHistory[0].weight, 99);
assert.equal(merged.metricsHistory[0].photos.front, 'data:image/jpeg;base64,AA==');
assert.equal(merged.checkIns[0].id, 'cloud-checkin');
assert.equal(merged.readinessLogs['2026-02-01'].score, 82);

// Readiness reacts in the right direction and remains a bounded score.
const highReadiness = app.calculateReadinessScore({ sleepHours: 8, sleepQuality: 5, energy: 5, fatigue: 1, soreness: 1, stress: 1 });
const lowReadiness = app.calculateReadinessScore({ sleepHours: 3, sleepQuality: 1, energy: 1, fatigue: 5, soreness: 5, stress: 5 });
assert.ok(highReadiness > lowReadiness);
assert.ok(highReadiness <= 100 && lowReadiness >= 0);

// A dated rota entry overrides the recurring shift pattern.
const rotaState = app.defaultState();
rotaState.shiftProfile.enabled = true;
rotaState.shiftProfile.rota['2026-09-03'] = { type: 'night', start: '20:00', end: '08:00' };
rotaState.notificationSettings.enabled = true;
rotaState.notificationSettings.workouts = true;
rotaState.notificationSettings.checkIns = false;
rotaState.notificationSettings.hydration = false;
rotaState.coachingTargets.workoutsPerWeek = 2;
app.setState(rotaState);
assert.equal(app.getShiftForDate('2026-09-03').type, 'night');
assert.equal(app.getShiftForDate('2026-09-03').source, 'rota');
const reminderSchedule = app.buildPushReminderSchedule(new Date('2026-09-03T12:00:00Z'), 14);
assert.equal(reminderSchedule.length, 4);
assert.equal(reminderSchedule[0].shiftType, 'night');
assert.equal(new Date(reminderSchedule[0].at).getHours(), 18);

// Smart progression uses reps/RIR, and weekly reports honour the configured target.
const today = new Date();
const todayKey = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const oldKey = days => {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const coachingState = app.defaultState();
coachingState.coachingTargets.workoutsPerWeek = 2;
coachingState.workoutHistory = [
  { id: 'w3', date: todayKey, exercises: [{ name: 'Test Curl', sets: [{ weight: 10, reps: 10, rir: 4 }] }] },
  { id: 'w2', date: oldKey(14), exercises: [{ name: 'Test Curl', sets: [{ weight: 10, reps: 9, rir: 3 }] }] },
  { id: 'w1', date: oldKey(21), exercises: [{ name: 'Test Curl', sets: [{ weight: 9, reps: 10, rir: 3 }] }] }
];
coachingState.dailyMeals = [{ id: 'meal-1', date: todayKey, calories: 2500, protein: 150 }];
const progression = app.smartProgressionForExercise('Test Curl', coachingState);
assert.equal(progression.action, 'progress');
assert.equal(progression.suggested, 11);
const report = app.weeklyReportFor(coachingState);
assert.equal(report.workouts, 1);
assert.equal(report.targetWorkouts, 2);
assert.equal(report.workoutAdherence, 50);
assert.equal(report.nutritionDays, 1);

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
