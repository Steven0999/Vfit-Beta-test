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
    parentElement: null, children: [],
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
    appendChild(child) {
      if (!child) return child;
      if (child.parentElement && Array.isArray(child.parentElement.children)) {
        child.parentElement.children = child.parentElement.children.filter(item => item !== child);
      }
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    append(...children) { children.forEach(child => this.appendChild(child)); },
    remove() {
      if (this.parentElement && Array.isArray(this.parentElement.children)) {
        this.parentElement.children = this.parentElement.children.filter(item => item !== this);
      }
      this.parentElement = null;
    },
    click() {}, focus() {},
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
  localDateKey,
  offsetLocalDateKey,
  resetActiveDatesToToday,
  normaliseBarcode,
  isPlausibleFoodBarcode,
  hasValidGtinCheckDigit,
  barcodeLookupCandidates,
  shiftMealIdeasFor,
  mountBarcodeScannerSurface,
  restoreBarcodeScannerSurface,
  showMealBarcodeResult,
  calculateReadinessScore,
  aiCoachQuestionnaireSteps,
  buildAICoachCheckInResult,
  aiCoachFollowUpResponse,
  openAICoachCheckIn,
  answerAICoachCheckIn,
  skipAICoachCheckInNote,
  sendAICoachCheckInMessage,
  getShiftForDate,
  smartProgressionForExercise,
  weeklyReportFor,
  buildPushReminderSchedule,
  activeMuscleGainVolumePlan,
  weeklySetTargetForMuscle,
  elapsedWorkoutSeconds,
  buildDeloadPlan,
  isDeloadPlanActive,
  saveState,
  loadState,
  getState: () => state,
  setState: value => { state = value; },
  setUser: value => { currentUser = value; },
  setBarcodeScannerEmbedded: value => { barcodeScannerEmbedded = !!value; },
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

// Barcode handling preserves the complete printed number and builds safe lookup
// variants without converting it to a JavaScript number.
assert.equal(app.normaliseBarcode(' 5 000-1126 37922 '), '5000112637922');
assert.equal(app.isPlausibleFoodBarcode('5000112637922'), true);
assert.equal(app.isPlausibleFoodBarcode('112233'), false);
assert.equal(app.hasValidGtinCheckDigit('5000112637922'), true);
assert.equal(app.hasValidGtinCheckDigit('5000112637923'), false);
const lookupVariants = Array.from(app.barcodeLookupCandidates('5000112637922'));
assert.ok(lookupVariants.includes('5000112637922'));
assert.ok(lookupVariants.includes('05000112637922'));

// Every early, day, night and off-day meal category owns four distinct choices;
// rotations must never borrow a meal from another shift type.
for (const type of ['night', 'early', 'day', 'off']) {
  for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack']) {
    const ideas = Array.from(app.shiftMealIdeasFor(type, mealType));
    assert.equal(ideas.length, 4, `${type} ${mealType} needs four choices`);
    assert.equal(new Set(ideas.map(item => item.id)).size, 4, `${type} ${mealType} ids must be unique`);
    assert.ok(ideas.every(item => item.id.startsWith(`${type}-`)), `${type} ${mealType} must stay shift-specific`);
    assert.ok(ideas.every(item => item.calories > 0 && item.protein > 0));
  }
}

// Active pages return to the local current day, while an unfinished workout
// remains attached to the day on which it actually started.
const datedState = app.defaultState();
datedState.viewDate = '2026-01-10';
datedState.metricsDate = '2026-01-10';
datedState.activeWorkout = { workoutDate: '2026-01-09' };
datedState.currentPhotos = { front: 'draft', side: null, back: null };
app.setState(datedState);
const localToday = app.localDateKey();
app.resetActiveDatesToToday({ preserveActiveWorkout: true });
assert.equal(app.getState().viewDate, localToday);
assert.equal(app.getState().metricsDate, localToday);
assert.equal(document.getElementById('workout-date-picker').value, '2026-01-09');
assert.equal(app.getState().currentPhotos.front, null);
assert.equal(app.offsetLocalDateKey('2026-03-28', 1), '2026-03-29');

// The same scanner surface moves into Create Meal and returns to its normal
// overlay afterwards, so duplicate camera elements are never created.
const scannerModal = document.getElementById('barcode-scanner-modal');
const scannerCard = document.getElementById('barcode-scanner-card');
const mealScannerSlot = document.getElementById('meal-barcode-inline-slot');
scannerModal.appendChild(scannerCard);
app.setBarcodeScannerEmbedded(true);
assert.equal(app.mountBarcodeScannerSurface(), true);
assert.equal(scannerCard.parentElement, mealScannerSlot);
assert.equal(mealScannerSlot.classList.contains('hidden'), false);
assert.equal(scannerModal.style.display, 'none');
app.restoreBarcodeScannerSurface();
assert.equal(scannerCard.parentElement, scannerModal);
assert.equal(mealScannerSlot.classList.contains('hidden'), true);
app.showMealBarcodeResult({ name: 'Test product', scannedBarcode: '5000112637922' });
assert.equal(document.getElementById('meal-barcode-product').textContent, 'Test product');
assert.equal(document.getElementById('meal-barcode-number').textContent, '5000112637922');
assert.equal(document.getElementById('meal-barcode-result').classList.contains('hidden'), false);

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
  coachConversations: [{ id: 'local-coach-chat', date: '2026-01-01' }],
  metricsHistory: [{ date: '2026-01-01', weight: 100, photos: { front: 'data:image/jpeg;base64,AA==' } }]
});
const remote = {
  meta: { updatedAt: '2026-02-01T00:00:00.000Z' },
  goals: { calories: 2400 },
  workoutHistory: [{ id: 'cloud-workout', date: '2026-02-01' }],
  metricsHistory: [{ date: '2026-01-01', weight: 99 }],
  checkIns: [{ id: 'cloud-checkin', date: '2026-02-01', energy: 4 }],
  coachConversations: [{ id: 'cloud-coach-chat', date: '2026-02-01' }],
  readinessLogs: { '2026-02-01': { score: 82 } }
};
const merged = app.mergeStateSnapshots(local, remote);
assert.equal(merged.goals.calories, 2400);
assert.deepEqual([...merged.workoutHistory.map(item => item.id)].sort(), ['cloud-workout', 'local-workout']);
assert.equal(merged.metricsHistory[0].weight, 99);
assert.equal(merged.metricsHistory[0].photos.front, 'data:image/jpeg;base64,AA==');
assert.equal(merged.checkIns[0].id, 'cloud-checkin');
assert.deepEqual([...merged.coachConversations.map(item => item.id)].sort(), ['cloud-coach-chat', 'local-coach-chat']);
assert.equal(merged.readinessLogs['2026-02-01'].score, 82);

// Readiness reacts in the right direction and remains a bounded score.
const highReadiness = app.calculateReadinessScore({ sleepHours: 8, sleepQuality: 5, energy: 5, fatigue: 1, soreness: 1, stress: 1 });
const lowReadiness = app.calculateReadinessScore({ sleepHours: 3, sleepQuality: 1, energy: 1, fatigue: 5, soreness: 5, stress: 5 });
assert.ok(highReadiness > lowReadiness);
assert.ok(highReadiness <= 100 && lowReadiness >= 0);

// Goal scope controls the weekly working-set range used by coaching.
const generalGoalState = app.defaultState();
generalGoalState.userGoals = [{ id: 'general-goal', focus: 'muscle_gain', completed: false, details: { scope: 'general', muscles: [] } }];
const generalPlan = app.activeMuscleGainVolumePlan(generalGoalState);
assert.equal(generalPlan.scope, 'general');
assert.equal(generalPlan.min, 12);
assert.equal(generalPlan.max, 16);
assert.equal(app.weeklySetTargetForMuscle('Chest', generalGoalState).max, 16);

const specificGoalState = app.defaultState();
specificGoalState.userGoals = [{ id: 'specific-goal', focus: 'muscle_gain', completed: false, details: { scope: 'specific', muscles: ['Glutes', 'Shoulders'] } }];
const specificPlan = app.activeMuscleGainVolumePlan(specificGoalState);
assert.deepEqual([...specificPlan.muscles], ['Glutes', 'Shoulders']);
assert.equal(specificPlan.max, 20);
assert.equal(app.weeklySetTargetForMuscle('Glutes', specificGoalState).max, 20);
assert.equal(app.weeklySetTargetForMuscle('Chest', specificGoalState), null);

// Session duration is calculated from the original start timestamp, including time away.
assert.equal(app.elapsedWorkoutSeconds(1_000, 0, 3_661_000), 3660);
assert.equal(app.elapsedWorkoutSeconds(null, 75, 3_661_000), 75);

const deloadPlan = app.buildDeloadPlan('2026-09-04', 'test');
assert.equal(deloadPlan.endDate, '2026-09-10');
assert.equal(app.isDeloadPlanActive({ deloadPlan }, '2026-09-07'), true);
assert.equal(app.isDeloadPlanActive({ deloadPlan }, '2026-09-11'), false);

// The conversational coach is one-question-at-a-time, shift-aware and safety bounded.
const coachQuestions = app.aiCoachQuestionnaireSteps({});
assert.equal(coachQuestions.length, 7);
assert.equal(new Set(coachQuestions.map(step => step.id)).size, 7);
assert.ok(coachQuestions.every(step => step.question && step.options.length >= 3));
assert.ok(!coachQuestions.some(step => step.id === 'deloadWeek'));
const severeFatigueQuestions = app.aiCoachQuestionnaireSteps({ fatigue: '5' });
assert.equal(severeFatigueQuestions.length, 8);
assert.equal(severeFatigueQuestions[4].id, 'deloadWeek');
assert.equal(severeFatigueQuestions[4].options.length, 2);

const readyOffDay = app.buildAICoachCheckInResult({
  mood: 'great', sleepHours: '8.5', energy: '5', fatigue: '1', soreness: '1', stress: '1', wellbeing: 'well'
}, { type: 'off' }, 'Feeling good');
assert.equal(readyOffDay.label, 'Ready');
assert.ok(readyOffDay.score >= 75 && readyOffDay.score <= 100);
assert.match(readyOffDay.shiftAdvice, /off day/i);

const tiredNightShift = app.buildAICoachCheckInResult({
  mood: 'drained', sleepHours: '4.5', energy: '1', fatigue: '5', deloadWeek: 'yes', soreness: '3', stress: '5', wellbeing: 'well'
}, { type: 'night', start: '19:00', end: '07:00' }, 'Long shift');
assert.equal(tiredNightShift.label, 'Recover');
assert.match(tiredNightShift.shiftAdvice, /after waking|main sleep/i);
assert.equal(tiredNightShift.severeFatigue, true);
assert.equal(tiredNightShift.deloadAccepted, true);
assert.match(tiredNightShift.action, /seven days|40–50%/i);

const unwellCheckIn = app.buildAICoachCheckInResult({
  mood: 'great', sleepHours: '8.5', energy: '5', fatigue: '1', soreness: '1', stress: '1', wellbeing: 'unwell'
}, { type: 'day' }, 'I feel dizzy and have unusual pain');
assert.ok(unwellCheckIn.score <= 25);
assert.equal(unwellCheckIn.safetyLevel, 'concern');
assert.match(unwellCheckIn.safetyNotice, /cannot diagnose|professional care/i);
assert.match(app.aiCoachFollowUpResponse('I have chest pain', readyOffDay), /emergency services/i);

// A complete chat flow persists both the conversation and its linked readiness score.
const chatState = app.defaultState();
chatState.shiftProfile.enabled = true;
chatState.shiftProfile.shiftType = 'nights';
chatState.shiftProfile.workDays = [new Date().getDay()];
app.setUser(null);
app.setState(chatState);
app.openAICoachCheckIn();
for (const step of app.aiCoachQuestionnaireSteps()) {
  const answer = step.id === 'sleepHours' ? step.options.at(-1) : step.options[0];
  app.answerAICoachCheckIn(step.id, answer.value, answer.label);
}
app.skipAICoachCheckInNote();
const completedChatState = app.getState();
const chatDateKey = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
assert.equal(completedChatState.coachConversations.length, 1);
assert.equal(completedChatState.readinessLogs[chatDateKey].source, 'ai-coach');
assert.equal(completedChatState.coachConversations[0].result.label, 'Ready');
document.getElementById('ai-coach-checkin-input').value = 'Why this score?';
app.sendAICoachCheckInMessage();
assert.match(completedChatState.coachConversations[0].messages.at(-1).text, /main factors/i);

// Severe fatigue inserts a deload choice and activates the seven-day plan only after Yes.
const severeChatState = app.defaultState();
app.setState(severeChatState);
app.openAICoachCheckIn();
const severeAnswers = {
  mood: 'drained', sleepHours: '4.5', energy: '1', fatigue: '5', deloadWeek: 'yes',
  soreness: '3', stress: '5', wellbeing: 'well'
};
for (const step of app.aiCoachQuestionnaireSteps({ fatigue: '5' })) {
  const option = step.options.find(item => String(item.value) === severeAnswers[step.id]);
  assert.ok(option, `missing severe-fatigue answer for ${step.id}`);
  app.answerAICoachCheckIn(step.id, option.value, option.label);
}
app.skipAICoachCheckInNote();
const severeCompletedState = app.getState();
assert.equal(severeCompletedState.deloadPlan.active, true);
assert.equal(severeCompletedState.coachConversations[0].result.deloadActivated, true);
assert.equal(severeCompletedState.readinessLogs[chatDateKey].deloadAccepted, true);

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
