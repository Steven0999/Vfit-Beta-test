'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
const moduleFiles = [
  'core/state.js',
  'training/training.js',
  'nutrition/food-catalog.js',
  'nutrition/meal-planner.js',
  'nutrition/scanner.js',
  'ui/navigation.js',
  'coaching/coaching.js',
  'firebase/firebase-sync.js',
  'nutrition/meal-safety.js',
  'nutrition/weekly-planner.js',
  'metrics/step-tracking.js',
  'metrics/run-tracking.js',
  'metrics/photo-storage.js',
  'feedback/beta-feedback.js',
  'coaching/plan-builder.js',
  'App.js'
];
const appSource = moduleFiles
  .map(file => fs.readFileSync(new URL('../' + file, `file://${__filename}`), 'utf8'))
  .join('\n');
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(inlineScripts.length, 0, 'application logic must live in external JavaScript modules');
moduleFiles.forEach(file => assert.ok(html.includes(`<script src="./${file}"></script>`), `index.html must load ${file}`));
assert.equal(moduleFiles[moduleFiles.length - 1], 'App.js', 'the App.js startup entry point must load last');

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
    checkValidity() {
      if (this.value === '') return true;
      const number = Number(this.value);
      if (this.type === 'number' || this.min != null || this.max != null) {
        if (!Number.isFinite(number)) return false;
        if (this.min != null && number < Number(this.min)) return false;
        if (this.max != null && number > Number(this.max)) return false;
      }
      return true;
    },
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
const stepTrackingAction = fakeElement();
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
  querySelectorAll(selector) {
    return selector === '[data-step-tracking-action]' ? [stepTrackingAction] : [];
  },
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

const nativeStepCommands = [];
const nativeStepListeners = new Map();

const sandbox = {
  console, document, localStorage,
  navigator: { onLine: true, standalone: false, storage: {}, userAgent: 'VFIT smoke test' },
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
sandbox.vfitHealthConnect = {
  postMessage(payload) {
    nativeStepCommands.push(JSON.parse(payload));
  },
  addEventListener(type, listener) { nativeStepListeners.set(type, listener); }
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
  foodNutrientsPer100g,
  foodNutrientsPerServing,
  mealScheduleForDate,
  mealSlotForTime,
  setDiaryWakeTime,
  databaseFoodWithServingWeight,
  copiedMealNutritionBases,
  copiedMealNutritionForAmount,
  getAllLoggedFoods,
  togglePreviousMeal,
  copySelectedMeals,
  isPlausibleFoodBarcode,
  hasValidGtinCheckDigit,
  barcodeLookupCandidates,
  isValidPhotoData,
  shiftMealIdeasFor,
  personalisedShiftMealIdeas,
  mealMatchesDietaryRequirements,
  shiftMealRecipeSteps,
  structuredMealSafety,
  curatedMealSafetyCoverage,
  dietaryProfile,
  inferDietaryRequirementsFromText,
  applyDietaryCoachAnswers,
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
  skipAICoachCheckInInput,
  sendAICoachCheckInMessage,
  getShiftForDate,
  smartProgressionForExercise,
  weeklyReportFor,
  buildPushReminderSchedule,
  activeMuscleGainVolumePlan,
  weeklySetTargetForMuscle,
  elapsedWorkoutSeconds,
  plannerWeekStart,
  plannerWeekDates,
  plannerShiftType,
  plannerMealCalorieLimit,
  plannerMealIsAppropriate,
  plannerMealIdeas,
  shoppingListPlannerMealIdeas,
  createdMealPlannerIdeas,
  diaryPlannerMealIdeas,
  plannerMealSelection,
  weeklyPlannerDayTotals,
  coachPlanDocumentId,
  coachPlanMealIdeas,
  progressPhotoReference,
  progressPhotoIdFromReference,
  buildDeloadPlan,
  isDeloadPlanActive,
  recordDailyStepTotal,
  finaliseStepDay,
  stepGoalForDate,
  stepHistoryEntries,
  stepProgressSeries,
  openStepProgressModal,
  setStepProgressView,
  closeStepProgressModal,
  acceptWebRunPosition,
  updateCardioMode,
  renderOutdoorRunUI,
  handleNativeRunMessage,
  retryOutdoorRun,
  completedOutdoorRun,
  finishOutdoorRun,
  runRouteSvg,
  runReferencePoints,
  googleMapsRunUrl,
  runPointDistanceMetres,
  compactSavedRoute,
  saveCardio,
  sportMetFor,
  sportNetCalories,
  viewWorkoutDetails,
  setOutdoorRunSession: value => { outdoorRunSession = value; },
  handleNativeStepMessage,
  initialiseStepTracking,
  requestStepTrackingPermission,
  teardownStepTracking,
  nativeStepDebug: () => ({
    syncPending: nativeStepSyncPending,
    accountReady: stepTrackingAccountReady,
    bufferedPayloads: pendingNativeStepPayloads.length,
    permissionOpening: nativeStepPermissionOpening,
    permissionPending: stepPermissionRequestPending
  }),
  saveState,
  loadState,
  openManualDiaryFood,
  closeManualDiaryFood,
  saveManualDiaryFood,
  editLoggedFood,
  getRecentFoods,
  openFoodPopupCustom,
  setAmountType,
  canManageFoodDatabase,
  updateFoodDatabasePermissionUI,
  editPreviousMealItem,
  setEditAmountType,
  saveEditedMeal,
  calculateEnergyExpenditure,
  calculateMaintenanceCalories,
  getBMR,
  setTrackedCalorieGoal,
  reconcileDietSafety,
  getDailyCalorieTarget,
  updateCalorieGoal,
  updateMaintenanceCalories,
  setDietGoal,
  getExperienceLevel,
  setGoalFocus,
  openGoalSetting,
  saveGoal,
  goalProgressSpec,
  goalProgressEntries,
  openGoalProgress,
  closeGoalProgress,
  saveGoalProgressEntry,
  editGoalProgressEntry,
  deleteGoalProgressEntry,
  trainingExperienceTier,
  applyTrainingExperienceMode,
  basicExerciseNames,
  addSetToExercise,
  renderVolumeTracker,
  getState: () => state,
  setState: value => { state = value; },
  setUser: value => { currentUser = value; },
  setBarcodeScannerEmbedded: value => { barcodeScannerEmbedded = !!value; },
  setBarcodeScanMode: value => { barcodeScanMode = value; },
  defaultState: () => deepClone(DEFAULT_STATE)
};`;

vm.createContext(sandbox);
vm.runInContext(appSource + expose, sandbox, { filename: 'VFIT modules' });
const app = sandbox.__vfitTest;

// Every focus can be opened as a dated goal journal. A cumulative weight-loss
// measure uses the latest check-in by date and preserves edits and deletions.
const journalState = app.defaultState();
app.setState(journalState);
app.setUser({ uid: 'goal-journal-test' });
app.openGoalSetting();
app.setGoalFocus('weight_loss');
document.getElementById('wl-kg').value = '20';
document.getElementById('goal-description').value = 'Lose 20 kg';
app.saveGoal();
assert.equal(journalState.userGoals.length, 1);
const weightGoal = journalState.userGoals[0];
assert.equal(app.goalProgressSpec(weightGoal).target, 20);
assert.equal(document.getElementById('goal-progress-modal').style.display, 'flex');
const beforeDate = app.offsetLocalDateKey(app.localDateKey(), -7);
const afterDate = app.offsetLocalDateKey(app.localDateKey(), -2);
const dateInput = document.getElementById('goal-progress-date');
const valueInput = document.getElementById('goal-progress-value');
const noteInput = document.getElementById('goal-progress-note');
dateInput.value = afterDate;
valueInput.value = '8';
noteInput.value = 'Training felt steady';
app.saveGoalProgressEntry();
dateInput.value = beforeDate;
valueInput.value = '5';
noteInput.value = '<img src=x onerror=alert(1)>';
app.saveGoalProgressEntry();
assert.equal(app.goalProgressEntries(weightGoal)[0].value, 5);
assert.equal(app.goalProgressEntries(weightGoal)[1].value, 8);
assert.ok(document.getElementById('goal-progress-summary').innerHTML.includes('8 kg / 20 kg'));
assert.ok(document.getElementById('goal-progress-timeline').innerHTML.includes('40% of target'));
assert.ok(document.getElementById('goal-progress-timeline').innerHTML.includes('&lt;img'));
assert.ok(!document.getElementById('goal-progress-timeline').innerHTML.includes('<img'));
const firstEntryId = app.goalProgressEntries(weightGoal)[0].id;
app.editGoalProgressEntry(firstEntryId);
assert.equal(valueInput.value, 5);
valueInput.value = '6';
app.saveGoalProgressEntry();
assert.equal(app.goalProgressEntries(weightGoal).length, 2);
assert.equal(app.goalProgressEntries(weightGoal)[0].value, 6);
app.deleteGoalProgressEntry(firstEntryId);
assert.equal(weightGoal.progressEntries.length, 1);
assert.ok(weightGoal.deletedProgressEntryIds.includes(String(firstEntryId)));
dateInput.value = app.offsetLocalDateKey(app.localDateKey(), 1);
valueInput.value = '10';
app.saveGoalProgressEntry();
assert.equal(weightGoal.progressEntries.length, 1, 'future check-ins cannot be saved');
assert.equal(JSON.parse(localStorage.getItem(app.stateStorageKey('goal-journal-test'))).userGoals[0].progressEntries.length, 1,
  'journal entries persist in the member snapshot');
app.closeGoalProgress();
app.openGoalSetting();
app.setGoalFocus('activity');
document.getElementById('activity-unit').value = 'min/week';
document.getElementById('activity-target').value = '150';
document.getElementById('goal-description').value = 'Move more each week';
app.saveGoal();
assert.equal(journalState.userGoals[0].focus, 'activity');
assert.equal(journalState.userGoals[0].details.unit, 'min/week');
assert.equal(journalState.userGoals[0].details.targetValue, 150);
app.closeGoalProgress();

for (const [focus, details, expectedUnit] of [
  ['muscle_gain', { targetKg: 2 }, 'kg'],
  ['strength', { targetKg: 100, exercise: 'Squat' }, 'kg'],
  ['healthy_eating', { targetDays: 5 }, 'days/week'],
  ['activity', { targetValue: 150, unit: 'min/week' }, 'min/week']
]) {
  const goal = { id: focus, focus, details, description: focus, progressEntries: [] };
  journalState.userGoals.push(goal);
  app.openGoalProgress(goal.id);
  assert.equal(app.goalProgressSpec(goal).unit, expectedUnit);
  dateInput.value = beforeDate;
  valueInput.value = focus === 'activity' ? '90' : '1';
  noteInput.value = 'A useful check-in';
  app.saveGoalProgressEntry();
  assert.equal(goal.progressEntries.length, 1, `${focus} journal saves`);
  assert.ok(document.getElementById('goal-progress-timeline').innerHTML.includes('A useful check-in'));
  app.closeGoalProgress();
}
const healthGoal = { id: 'health', focus: 'health', details: {}, description: 'Feel better' };
journalState.userGoals.push(healthGoal);
app.openGoalProgress('health');
assert.equal(document.getElementById('goal-progress-value-wrap').classList.contains('hidden'), true);
noteInput.value = 'Slept better this week';
app.saveGoalProgressEntry();
assert.equal(healthGoal.progressEntries[0].value, null);
app.closeGoalProgress();

const mergedJournal = app.mergeStateSnapshots(
  app.normalizeState({ meta: { updatedAt: '2026-09-20T00:00:00Z' }, userGoals: [{
    id: 'same', focus: 'weight_loss', progressEntries: [{ id: 'offline', date: '2026-09-19', value: 2 }]
  }] }),
  { meta: { updatedAt: '2026-09-21T00:00:00Z' }, userGoals: [{
    id: 'same', focus: 'weight_loss', progressEntries: [{ id: 'cloud', date: '2026-09-20', value: 3 }]
  }] }
);
assert.deepEqual([...mergedJournal.userGoals[0].progressEntries.map(item => item.id)].sort(), ['cloud', 'offline']);
const deletedJournal = app.mergeStateSnapshots(mergedJournal, {
  meta: { updatedAt: '2026-09-22T00:00:00Z' }, userGoals: [{
    id: 'same', focus: 'weight_loss', progressEntries: [], deletedProgressEntryIds: ['offline']
  }]
});
assert.deepEqual([...deletedJournal.userGoals[0].progressEntries.map(item => item.id)], ['cloud']);

assert.equal(app.defaultState().dailyReadinessEnabled, true);
assert.equal(app.normalizeState({ dailyReadinessEnabled: false }).dailyReadinessEnabled, false);
assert.equal(app.normalizeState({ dailyReadinessEnabled: 'false' }).dailyReadinessEnabled, true);

// Manual diary logging must work without database editor access, including
// offline, while leaving shared foods and other accounts untouched.
const manualFoodState = app.defaultState();
manualFoodState.customFoods = [{ id: 'shared-food', name: 'Shared food', calories: 80, protein: 2 }];
app.setState(manualFoodState);
app.setUser({ uid: 'manual-food-user' });
sandbox.navigator.onLine = false;
assert.equal(app.canManageFoodDatabase(), false);
app.updateFoodDatabasePermissionUI();
assert.equal(document.getElementById('food-database-add-button').classList.contains('hidden'), true);
assert.ok(html.includes('id="search-add-own-food"'), 'search must retain manual entry');
assert.ok(!html.includes('id="diary-add-own-food"'), 'diary shortcut is removed');
app.openManualDiaryFood();
assert.equal(document.getElementById('manual-diary-food-modal').style.display, 'flex');
document.getElementById('diary-food-name').value = 'My muffin';
document.getElementById('diary-food-calories').value = '450.5';
document.getElementById('diary-food-protein').value = '';
app.saveManualDiaryFood();
assert.equal(app.getState().dailyMeals.length, 0, 'protein cannot be omitted');
for (const invalid of ['-1', 'NaN', 'Infinity', '1000001']) {
  document.getElementById('diary-food-protein').value = invalid;
  app.saveManualDiaryFood();
  assert.equal(app.getState().dailyMeals.length, 0, 'invalid nutrition must not be logged');
}
document.getElementById('diary-food-protein').value = '12.5';
document.getElementById('diary-food-meal-type').value = 'snack';
app.saveManualDiaryFood();
assert.equal(app.getState().dailyMeals.length, 1);
const manualFood = app.getState().dailyMeals[0];
assert.equal(manualFood.calories, 450.5);
assert.equal(manualFood.protein, 12.5);
assert.equal(manualFood.carbs, 0);
assert.equal(manualFood.fat, 0);
assert.equal(manualFood.mealType, 'snack');
assert.equal(manualFood.servingGrams, 0, 'an unknown food weight must not be invented');
assert.equal(manualFood.manualEntry, true);
assert.equal(app.getState().customFoods.length, 1, 'personal logging must not add shared database foods');
const savedManualState = JSON.parse(localStorage.getItem(app.stateStorageKey('manual-food-user')));
assert.equal(savedManualState.dailyMeals[0].protein, 12.5, 'manual food must persist offline');
assert.equal(app.getState().nutritionHistory.find(day => day.date === manualFood.date).meals[0].calories, 450.5);
app.saveManualDiaryFood();
assert.equal(app.getState().dailyMeals.length, 1, 'resubmitting a closed form must not duplicate food');

app.editLoggedFood(manualFood.id);
document.getElementById('diary-food-protein').value = '0';
document.getElementById('diary-food-carbs').value = '55';
app.saveManualDiaryFood();
assert.equal(app.getState().dailyMeals.length, 1, 'editing must update the existing diary row');
assert.equal(app.getState().dailyMeals[0].id, manualFood.id);
assert.equal(app.getState().dailyMeals[0].protein, 0, 'zero protein is valid');
assert.equal(app.getState().dailyMeals[0].carbs, 55);

const manualRecent = app.getRecentFoods(10)[0];
assert.equal(manualRecent.manualEntry, true);
assert.equal(manualRecent.servingGrams, 0);
app.openFoodPopupCustom(manualRecent);
assert.equal(document.getElementById('amount-type-grams').disabled, true, 'unknown weights cannot be used for gram conversions');
app.setAmountType('grams');
assert.equal(document.getElementById('popup-custom-weight-field').classList.contains('hidden'), true);

app.editPreviousMealItem(0, manualFood.date);
assert.equal(document.getElementById('edit-amount-type-grams').disabled, true);
app.setEditAmountType('grams');
document.getElementById('edit-meal-amount').value = '2';
app.saveEditedMeal();
assert.equal(app.getState().dailyMeals[1].calories, 901);
assert.equal(app.getState().dailyMeals[1].servingGrams, 0, 'copying a manual food must retain its unknown weight');

app.openManualDiaryFood();
document.getElementById('diary-food-name').value = 'Weighed food';
document.getElementById('diary-food-calories').value = '200';
document.getElementById('diary-food-protein').value = '10';
document.getElementById('diary-food-weight').value = '80';
document.getElementById('diary-food-fat').value = '5';
app.saveManualDiaryFood();
assert.equal(app.getState().dailyMeals[2].servingGrams, 80);
app.openFoodPopupCustom(app.getRecentFoods(10).find(food => food.name === 'Weighed food'));
assert.equal(document.getElementById('amount-type-grams').disabled, false, 'known weights must retain normal conversion support');

app.openManualDiaryFood();
app.setUser({ uid: 'different-account' });
document.getElementById('diary-food-name').value = 'Do not leak';
document.getElementById('diary-food-calories').value = '100';
document.getElementById('diary-food-protein').value = '10';
app.saveManualDiaryFood();
assert.equal(app.getState().dailyMeals.length, 3, 'a stale form cannot write after an account change');
app.closeManualDiaryFood();
app.setUser({ uid: 'manual-food-user' });
app.openManualDiaryFood();
app.getState().viewDate = app.offsetLocalDateKey(app.getState().viewDate, -1);
app.saveManualDiaryFood();
assert.equal(app.getState().dailyMeals.length, 3, 'a form cannot silently log to a changed diary date');
app.closeManualDiaryFood();
app.setUser(null);
app.setState(app.defaultState());
sandbox.navigator.onLine = true;

// Activity estimates use completed days, avoid counting logged running steps
// twice, and adjust the lifting component modestly from recorded RIR.
const energyState = app.defaultState();
energyState.userProfile = { gender: 'male', age: 30, heightCm: 180, activityLevel: 'moderate' };
energyState.metricsHistory = [{ date: '2026-10-01', weight: 100 }];
app.setState(energyState);
app.setUser({ uid: 'energy-test-user' });
document.getElementById('cardio-type').value = 'sport-soccer';
document.getElementById('cardio-sport-intensity').value = 'moderate';
document.getElementById('cardio-duration').value = '60';
document.getElementById('cardio-distance').value = '';
document.getElementById('filter-cardio').checked = true;
app.updateCardioMode();
assert.equal(document.getElementById('cardio-calories').value, '600');
app.saveCardio();
assert.equal(energyState.cardioLogs[0].intensity, 'moderate');
assert.equal(energyState.cardioLogs[0].met, 7);
assert.equal(energyState.cardioLogs[0].calories, 600);
assert.match(elements.get('training-logs-list').innerHTML, /Soccer/);
app.viewWorkoutDetails(energyState.cardioLogs[0].id);
assert.match(elements.get('cardio-details-content').innerHTML, /Estimated extra calories/);
energyState.cardioLogs = [];
const energyToday = app.localDateKey();
const energyYesterday = app.offsetLocalDateKey(energyToday, -1);
const fallbackTdee = app.calculateMaintenanceCalories();
energyState.stepsLogs[energyYesterday] = 22000;
energyState.workoutHistory = [{ date: energyYesterday, category: 'weights', durationSeconds: 3600,
  exercises: [{ name: 'Squat', sets: [{ reps: '8', weight: '80', rir: '1' }] }] }];
energyState.cardioLogs = [{ date: energyYesterday, type: 'outdoor-running', duration: 30, distance: 5 }];
const activeTdee = app.calculateEnergyExpenditure(energyToday);
assert.equal(activeTdee.source, 'logged');
assert.equal(activeTdee.stepDays, 1);
assert.equal(activeTdee.averageSteps, 22000);
assert.equal(activeTdee.averageRir, 1);
assert.ok(activeTdee.walking > 0 && activeTdee.strength > 0 && activeTdee.cardio > 0);
assert.ok(activeTdee.maintenance !== fallbackTdee);
energyState.cardioLogs.push({ date: energyYesterday, type: 'sport-soccer', intensity: 'moderate', duration: 60, distance: 0 });
assert.ok(app.calculateEnergyExpenditure(energyToday).cardio > activeTdee.cardio,
  'sport MET and duration must contribute to TDEE');
energyState.cardioLogs.pop();
energyState.workoutHistory[0].exercises[0].sets[0].rir = '8';
assert.ok(app.calculateEnergyExpenditure(energyToday).strength < activeTdee.strength);
energyState.workoutHistory[0].exercises[0].sets[0].rir = '1';
energyState.cardioLogs = [];
assert.ok(app.calculateEnergyExpenditure(energyToday).walking > activeTdee.walking,
  'recorded cardio distance must be removed from overlapping step distance');
energyState.workoutHistory.push({ date: energyYesterday, category: 'cardio', durationSeconds: 1800 });
assert.ok(app.calculateEnergyExpenditure(energyToday).cardio > 0,
  'cardio recorded only as a workout is still counted');
energyState.workoutHistory.pop();
energyState.cardioLogs = [{ date: energyYesterday, type: 'outdoor-running', duration: 30, distance: 5 }];
assert.equal(app.calculateMaintenanceCalories(), activeTdee.maintenance);
const defaultHighActivity = app.defaultState();
defaultHighActivity.userProfile = energyState.userProfile;
defaultHighActivity.metricsHistory = energyState.metricsHistory;
defaultHighActivity.stepsLogs[energyYesterday] = 40000;
app.setState(defaultHighActivity);
assert.ok(app.calculateMaintenanceCalories() - defaultHighActivity.goals.calories >= 1000);
assert.equal(app.reconcileDietSafety(energyToday).phase, 'regular',
  'the untouched default calorie goal must not silently start an aggressive diet');
assert.equal(defaultHighActivity.dietSafety.targetChosen, false);
defaultHighActivity.userProfile = { ...defaultHighActivity.userProfile, age: 16 };
assert.equal(app.calculateEnergyExpenditure(energyToday), null, 'adult energy targets are not calculated for minors');
assert.equal(app.setTrackedCalorieGoal(1000, 'manual'), false);
assert.equal(defaultHighActivity.goals.calories, 2500);
app.setState(energyState);

// Manual and planned goals share one BMR floor. A continuous 56-day planned
// deficit of at least 1,000 kcal triggers seven local dates at maintenance.
const bmrFloor = app.getBMR();
assert.equal(app.setTrackedCalorieGoal(200, 'manual'), true);
assert.equal(energyState.goals.calories, bmrFloor);
assert.ok(energyState.goals.calories >= bmrFloor);
const aggressiveTarget = activeTdee.maintenance - 1000;
assert.ok(aggressiveTarget >= bmrFloor, 'the fixture supports a 1000 kcal deficit above BMR');
app.updateCalorieGoal(String(aggressiveTarget));
assert.equal(energyState.goals.calories, aggressiveTarget);
assert.equal(app.reconcileDietSafety(energyToday).phase, 'aggressive');
energyState.dietSafety.aggressiveSince = app.offsetLocalDateKey(energyToday, -55);
assert.equal(app.reconcileDietSafety(energyToday).phase, 'aggressive');
energyState.dietSafety.aggressiveSince = app.offsetLocalDateKey(energyToday, -56);
const maintenanceWeek = app.reconcileDietSafety(energyToday);
assert.equal(maintenanceWeek.phase, 'maintenance');
assert.equal(maintenanceWeek.daysLeft, 7);
assert.equal(energyState.goals.calories, activeTdee.maintenance);
assert.equal(app.getDailyCalorieTarget(energyToday), activeTdee.maintenance);
energyState.dailyReadiness[energyToday] = { status: 'completed', recommendedCalories: 200 };
assert.equal(app.getDailyCalorieTarget(energyToday), activeTdee.maintenance,
  'readiness cannot override the enforced maintenance week');
const savedProfile = energyState.userProfile;
energyState.userProfile = {};
assert.equal(app.getDailyCalorieTarget(energyToday), activeTdee.maintenance,
  'the break remains enforced if profile information is temporarily unavailable');
energyState.userProfile = savedProfile;
app.updateCalorieGoal(String(aggressiveTarget));
assert.equal(energyState.goals.calories, activeTdee.maintenance);
app.updateMaintenanceCalories(String(aggressiveTarget));
assert.equal(energyState.goals.calories, activeTdee.maintenance);
app.setDietGoal('lose');
assert.equal(energyState.dietGoal.mode, 'maintain');
assert.equal(app.normalizeState(energyState).dietSafety.maintenanceUntil, maintenanceWeek.until);
app.setState(app.defaultState());
app.loadState('energy-test-user');
assert.equal(app.reconcileDietSafety(energyToday).phase, 'maintenance', 'maintenance week survives reload');
assert.equal(app.reconcileDietSafety(app.offsetLocalDateKey(energyToday, 6)).phase, 'maintenance');
assert.equal(app.reconcileDietSafety(app.offsetLocalDateKey(energyToday, 7)).phase, 'regular');
assert.equal(app.getState().goals.calories, activeTdee.maintenance, 'maintenance stays selected after the lock');
assert.equal(app.setTrackedCalorieGoal(aggressiveTarget, 'manual'), true, 'a new aggressive goal is permitted after the week');
assert.equal(app.getState().dietSafety.aggressiveSince, energyToday);
app.getState().dailyReadiness[energyToday] = { status: 'completed', recommendedCalories: 200 };
assert.equal(app.getDailyCalorieTarget(energyToday), bmrFloor, 'readiness never sets an intake target below BMR');
assert.equal(app.setTrackedCalorieGoal(activeTdee.maintenance - 500, 'manual'), true);
assert.equal(app.getState().dietSafety.aggressiveSince, null, 'a smaller planned deficit resets the eight-week counter');
app.setUser(null);
app.setState(app.defaultState());

// Experience changes the controls, but never rewrites a member's workout history.
const trainingState = app.defaultState();
trainingState.workoutHistory = [{ id: 'existing-workout', exercises: [{ name: 'Squat', sets: [{ reps: '8', weight: '20', rir: '2' }] }] }];
trainingState.userGoals = [{ focus: 'muscle_gain', details: { scope: 'specific', muscles: ['Chest'] }, completed: false }];
app.setState(trainingState);
const focusSelect = document.getElementById('workout-focus');
focusSelect.options = ['Full Body', 'Upper', 'Lower', 'Push', 'Pull', 'Legs', 'Specific Muscle']
  .map(value => ({ value, textContent: value, disabled: false, hidden: false }));
for (const [years, level, tier] of [
  [null, null, 'beginner'], [0, 'Beginner', 'beginner'], [2, 'Beginner', 'beginner'],
  [2.5, 'Intermediate', 'intermediate'], [3.5, 'Intermediate', 'intermediate'],
  [4, 'Advanced', 'advanced'], [9, 'Advanced', 'advanced'], [-1, null, 'beginner']
]) {
  trainingState.userProfile.yearsTraining = years;
  focusSelect.value = 'Specific Muscle';
  app.applyTrainingExperienceMode();
  assert.equal(app.getExperienceLevel(), level);
  assert.equal(app.trainingExperienceTier(), tier);
  assert.equal(document.body.dataset.trainingTier, tier);
  assert.equal(focusSelect.options.at(-1).disabled, tier !== 'advanced');
  assert.equal(focusSelect.options[1].disabled, tier === 'beginner');
  assert.equal(focusSelect.value, tier === 'advanced' ? 'Specific Muscle' : 'Full Body');
  app.renderVolumeTracker();
  assert.equal(document.getElementById('volume-tracker-card').classList.contains('hidden'), tier === 'beginner');
  assert.equal(trainingState.workoutHistory[0].exercises[0].sets[0].rir, '2');
}
assert.equal(app.basicExerciseNames('gym').length, 4);
assert.equal(app.basicExerciseNames('home').length, 4);
assert.equal(app.basicExerciseNames('home')[2], 'Superman', 'the starter Home session must not require a band');
trainingState.disabledExercises.home = ['Bodyweight Squat'];
assert.equal(app.basicExerciseNames('home')[0], 'Resistance Bands Squats');
assert.ok(!app.basicExerciseNames('home').includes('Bodyweight Squat'));
trainingState.userProfile.yearsTraining = 1;
trainingState.workoutEnv = 'home';
app.addSetToExercise('bodyweight-smoke', null, 'Push Ups');
const bodyweightRow = document.getElementById('sets-bodyweight-smoke').children[0];
assert.equal(bodyweightRow.children[1].children[0].value, '0', 'home bodyweight sets must save a 0 kg load');

// Step history keeps the final daily total and the goal that applied that day.
const migratedSteps = app.normalizeState({
  goals: { calories: 2500, water: 2500, steps: 8000 },
  stepsLogs: { '2026-09-26': 7200 }
});
assert.equal(migratedSteps.stepGoalHistory['2026-09-26'], 8000);
assert.equal(migratedSteps.stepsGoalCompletions['2026-09-26'], false);

const stepState = app.defaultState();
stepState.goals.steps = 8000;
app.setState(stepState);
app.recordDailyStepTotal('2026-09-27', 8400, 'health-connect', '2026-09-27T21:00:00.000Z');
assert.equal(app.finaliseStepDay('2026-09-27', '2026-09-28T00:00:00.000Z'), true);
assert.equal(app.getState().stepGoalHistory['2026-09-27'], 8000);
assert.equal(app.getState().stepsGoalCompletions['2026-09-27'], true);
app.getState().goals.steps = 12000;
app.recordDailyStepTotal('2026-09-28', 3000, 'health-connect', '2026-09-28T09:00:00.000Z');
assert.equal(app.stepGoalForDate('2026-09-27'), 8000);
assert.equal(app.stepGoalForDate('2026-09-28'), 12000);
const savedStepDay = app.stepHistoryEntries().find(entry => entry.date === '2026-09-27');
assert.equal(savedStepDay.steps, 8400);
assert.equal(savedStepDay.percent, 105);
assert.equal(savedStepDay.reached, true);

// Outdoor GPS points become a saved cardio workout with a route and speed.
// A physically impossible location jump cannot inflate the measured distance.
app.setState(app.defaultState());
app.setUser({ uid: 'running-test-user' });
const runStart = Date.now() - 30000;
app.setOutdoorRunSession({
  id: 'run-smoke-1', ownerUid: 'running-test-user', startedAt: runStart,
  status: 'recording', distanceMeters: 0, maxSpeedKmh: 0, points: []
});
document.getElementById('cardio-type').value = 'outdoor-running';
const fix = (lat, t) => ({ coords: { latitude: lat, longitude: -0.1, accuracy: 5 }, timestamp: t });
app.acceptWebRunPosition(fix(51.5, runStart + 1000));
app.acceptWebRunPosition(fix(51.5001, runStart + 7000));
app.acceptWebRunPosition(fix(52.5, runStart + 8000));
assert.ok(app.runPointDistanceMetres({ lat: 51.5, lon: -0.1 }, { lat: 51.5001, lon: -0.1 }) > 10);
app.finishOutdoorRun();
const finishedRun = app.completedOutdoorRun();
assert.equal(finishedRun.route.length, 2);
assert.ok(finishedRun.distance > 0 && finishedRun.distance < 0.1);
assert.ok(finishedRun.avgSpeedKmh > 0);
assert.ok(app.runRouteSvg(finishedRun.route).includes('<svg'));
app.updateCardioMode();
assert.match(document.getElementById('outdoor-run-current-map').href, /google\.com\/maps\/search\/\?api=1&query=51\.500100%2C-0\.100000/);
assert.equal(document.getElementById('outdoor-run-current-map').classList.contains('hidden'), false);
assert.match(document.getElementById('outdoor-run-reference-map').href, /google\.com\/maps\/dir\/\?api=1/);
assert.equal(document.getElementById('outdoor-run-reference-map').classList.contains('hidden'), false);
assert.equal(document.getElementById('outdoor-run-plan-map').target, '_blank');
assert.equal(app.googleMapsRunUrl([], false), '');
assert.equal(app.googleMapsRunUrl([{ lat: 91, lon: 0 }], true), '');
assert.match(app.googleMapsRunUrl([{ lat: 51.5, lon: -0.1 }], false), /search\/\?api=1/);
const longRoute = Array.from({ length: 1000 }, (_, i) => ({ lat: 51.5 + i / 100000, lon: -0.1, t: runStart + i * 1000, breakBefore: i === 500 }));
const referencePoints = Array.from(app.runReferencePoints(longRoute));
assert.equal(referencePoints.length, 3);
assert.ok(referencePoints.every((p, i) => p.index > 0 && p.index < 999 && (i === 0 || p.index > referencePoints[i - 1].index)));
assert.ok(referencePoints.every(p => !longRoute[p.index].breakBefore));
const mapsRouteUrl = app.googleMapsRunUrl(longRoute, false);
const parsedMapsRoute = new URL(mapsRouteUrl);
assert.equal(parsedMapsRoute.searchParams.get('travelmode'), 'walking');
assert.equal(parsedMapsRoute.searchParams.get('origin'), '51.500000,-0.100000');
assert.equal(parsedMapsRoute.searchParams.get('destination'), '51.509990,-0.100000');
assert.equal(parsedMapsRoute.searchParams.get('waypoints').split('|').length, 3);
assert.ok(mapsRouteUrl.length < 2048);
assert.match(app.runRouteSvg(longRoute), /references 1:/);
const compactRoute = app.compactSavedRoute(longRoute);
assert.ok(compactRoute.length <= 301);
assert.equal(compactRoute[0].t, longRoute[0].t);
assert.equal(compactRoute.at(-1).t, longRoute.at(-1).t);
assert.ok(compactRoute.some(p => p.breakBefore));
document.getElementById('cardio-calories').value = '120';
document.getElementById('cardio-notes').value = 'Park loop';
app.saveCardio();
const savedRun = app.getState().cardioLogs[0];
assert.equal(savedRun.type, 'outdoor-running');
assert.equal(savedRun.runId, 'run-smoke-1');
assert.equal(savedRun.route.length, 2);
assert.ok(savedRun.avgSpeedKmh > 0);
app.viewWorkoutDetails(savedRun.id);
assert.equal(elements.get('cardio-details-modal').style.display, 'flex');
assert.ok(elements.get('cardio-details-content').innerHTML.includes('GPS route'));
assert.match(elements.get('cardio-details-content').innerHTML, /View references in Google Maps/);
document.getElementById('cardio-type').value = 'treadmill';
document.getElementById('cardio-duration').value = '30';
document.getElementById('cardio-distance').value = '5';
app.saveCardio();
assert.equal(app.getState().cardioLogs[0].type, 'treadmill');
assert.equal(app.getState().cardioLogs[0].avgSpeedKmh, 10);

// If GPS never got a usable route, an entered distance is retained across UI
// refreshes and the saved log makes the calculated speed/source explicit.
app.setState(app.defaultState());
const manualStart = Date.now() - 600000;
app.setOutdoorRunSession({
  id: 'run-manual-1', ownerUid: 'running-test-user', startedAt: manualStart,
  endedAt: manualStart + 600000, status: 'completed', distanceMeters: 0, points: []
});
document.getElementById('cardio-type').value = 'outdoor-running';
app.updateCardioMode();
assert.equal(document.getElementById('cardio-distance').readOnly, false);
assert.equal(document.getElementById('save-cardio-button').disabled, true);
assert.match(document.getElementById('outdoor-run-status').textContent, /No usable GPS route/);
assert.equal(document.getElementById('outdoor-run-current-map').classList.contains('hidden'), true);
assert.equal(document.getElementById('outdoor-run-reference-map').classList.contains('hidden'), true);
document.getElementById('cardio-distance').value = '2.5';
app.renderOutdoorRunUI();
app.renderOutdoorRunUI();
assert.equal(document.getElementById('cardio-distance').value, '2.5');
assert.equal(document.getElementById('save-cardio-button').disabled, false);
app.saveCardio();
const manualRun = app.getState().cardioLogs[0];
assert.equal(manualRun.trackingSource, 'manual-distance');
assert.equal(manualRun.distance, 2.5);
assert.equal(manualRun.avgSpeedKmh, 15);
assert.equal(manualRun.route.length, 0);
app.viewWorkoutDetails(manualRun.id);
assert.match(document.getElementById('cardio-details-content').innerHTML, /Distance entered manually/);
assert.doesNotMatch(document.getElementById('cardio-details-content').innerHTML, /View references in Google Maps/);

// Native status explains weak GPS and exposes recovery when its service stops.
const nativeRunCommands = [];
sandbox.vfitRunTracker = { postMessage: payload => nativeRunCommands.push(JSON.parse(payload)) };
app.handleNativeRunMessage({ data: JSON.stringify({
  type: 'vfit-run-status', serviceRunning: true, locationEnabled: true,
  preciseLocationGranted: true, session: {
    id: 'run-weak-gps', ownerUid: 'running-test-user', startedAt: Date.now() - 30000,
    status: 'recording', points: [], distanceMeters: 0, lastLocationAccuracy: 87
  }
}) });
assert.match(document.getElementById('outdoor-run-status').textContent, /87 m/);
assert.equal(document.getElementById('outdoor-run-plan-map').target, '_self');
app.handleNativeRunMessage({ data: JSON.stringify({
  type: 'vfit-run-status', serviceRunning: false, locationEnabled: true,
  preciseLocationGranted: true, session: {
    id: 'run-weak-gps', ownerUid: 'running-test-user', startedAt: Date.now() - 30000,
    status: 'recording', points: [], distanceMeters: 0
  }
}) });
assert.match(document.getElementById('outdoor-run-status').textContent, /GPS tracker stopped/);
app.retryOutdoorRun();
assert.equal(nativeRunCommands.at(-1).command, 'resume');
delete sandbox.vfitRunTracker;
app.setUser(null);
app.setState(stepState);

// The chart compares each saved total to that day's goal, even after a goal
// change. Weekly targets sum those same saved-day goals across Monday weeks.
const chartDays = [
  { date: '2026-09-29', steps: 6000, goal: 12000 },
  { date: '2026-09-27', steps: 8400, goal: 8000 },
  { date: '2026-09-28', steps: 3000, goal: 12000 }
];
const dailyStepsChart = app.stepProgressSeries('daily', chartDays);
assert.deepEqual(Array.from(dailyStepsChart.values), [8400, 3000, 6000]);
assert.deepEqual(Array.from(dailyStepsChart.targets), [8000, 12000, 12000]);
const weeklyStepsChart = app.stepProgressSeries('weekly', chartDays);
assert.deepEqual(Array.from(weeklyStepsChart.values), [8400, 9000]);
assert.deepEqual(Array.from(weeklyStepsChart.targets), [8000, 24000]);
assert.equal(weeklyStepsChart.weeks[0].days, 1);
assert.equal(weeklyStepsChart.weeks[1].days, 2);

const stepCharts = [];
sandbox.Chart = class {
  constructor(canvas, config) { this.config = config; stepCharts.push(this); }
  destroy() { this.destroyed = true; }
};
app.openStepProgressModal();
assert.equal(elements.get('step-progress-modal').style.display, 'flex');
assert.equal(stepCharts.at(-1).config.type, 'bar');
assert.equal(stepCharts.at(-1).config.data.datasets[1].type, 'line');
assert.equal(stepCharts.at(-1).config.data.datasets[1].data[0], 8000);
app.setStepProgressView('weekly');
assert.equal(stepCharts.at(-2).destroyed, true);
assert.equal(stepCharts.at(-1).config.data.datasets[1].data[0], 8000);
app.closeStepProgressModal();
assert.equal(stepCharts.at(-1).destroyed, true);
assert.equal(elements.get('step-progress-modal').style.display, 'none');

// A Health Connect result that arrives before Firebase/account hydration must
// wait, then apply to the signed-in state. An older cache must not regress it.
const stepTodayKey = app.localDateKey();
app.setState(app.defaultState());
app.setUser(null);
app.handleNativeStepMessage({
  type: 'vfit-health-connect-history',
  entries: [{ date: stepTodayKey, steps: 4321, capturedAt: '2026-09-29T05:00:00.000Z' }],
  capturedAt: '2026-09-29T05:00:00.000Z'
});
assert.equal(app.getState().stepsLogs[stepTodayKey], undefined);
assert.equal(app.nativeStepDebug().bufferedPayloads, 1);

app.setUser({ uid: 'step-smoke-user', email: 'steps@example.test' });
nativeStepCommands.length = 0;
app.initialiseStepTracking();
assert.equal(app.getState().stepsLogs[stepTodayKey], 4321);
assert.equal(app.nativeStepDebug().bufferedPayloads, 0);
assert.ok(nativeStepCommands.some(command => command.command === 'status'));
assert.ok(!nativeStepCommands.some(command => command.command === 'sync'));
assert.equal(app.nativeStepDebug().syncPending, false);
assert.equal(stepTrackingAction.textContent, 'Allow');
assert.equal(stepTrackingAction.disabled, false);
assert.equal(stepTrackingAction.classList.contains('opacity-60'), false);

let permissionResultTimeout;
sandbox.setTimeout = (callback, delay) => {
  if (delay === 12000) permissionResultTimeout = callback;
  return 1;
};
app.requestStepTrackingPermission();
assert.equal(nativeStepCommands.at(-1).command, 'request_permission');
assert.equal(stepTrackingAction.textContent, 'Checking…');
assert.equal(stepTrackingAction.disabled, false);

nativeStepListeners.get('message')({ data: JSON.stringify({
  type: 'vfit-health-connect-ack', command: 'request_permission'
}) });
assert.equal(app.nativeStepDebug().permissionOpening, true);
assert.equal(app.nativeStepDebug().permissionPending, true);
assert.equal(typeof permissionResultTimeout, 'function');
permissionResultTimeout();
assert.equal(app.nativeStepDebug().permissionOpening, false);
assert.equal(app.nativeStepDebug().permissionPending, false);
assert.equal(stepTrackingAction.textContent, 'Retry');
app.requestStepTrackingPermission();
assert.equal(nativeStepCommands.at(-1).command, 'request_permission');
nativeStepListeners.get('message')({ data: JSON.stringify({
  type: 'vfit-health-connect-ack', command: 'request_permission'
}) });
app.handleNativeStepMessage({ type: 'vfit-health-connect-request-opening' });
assert.equal(stepTrackingAction.textContent, 'Checking…');
assert.equal(typeof nativeStepListeners.get('message'), 'function');
nativeStepListeners.get('message')({ data: JSON.stringify({
  type: 'vfit-health-connect-status',
  availability: 'available',
  permission: 'denied',
  backgroundPermission: false
}) });
assert.equal(stepTrackingAction.textContent, 'Open access');
app.requestStepTrackingPermission();
assert.equal(nativeStepCommands.at(-1).command, 'open_settings');
assert.equal(stepTrackingAction.disabled, false);

assert.equal(typeof sandbox.__vfitReceiveNativeStepPayload, 'function');
sandbox.__vfitReceiveNativeStepPayload(JSON.stringify({
  type: 'vfit-health-connect-status',
  availability: 'available',
  permission: 'granted',
  backgroundPermission: true
}));
assert.ok(nativeStepCommands.some(command => command.command === 'sync'));
assert.equal(app.nativeStepDebug().syncPending, true);
assert.equal(stepTrackingAction.textContent, 'Updating…');
assert.equal(stepTrackingAction.disabled, true);

app.handleNativeStepMessage({
  type: 'vfit-health-connect-steps',
  date: stepTodayKey,
  steps: 4000,
  capturedAt: '2026-09-29T04:45:00.000Z',
  cached: true
});
assert.equal(app.getState().stepsLogs[stepTodayKey], 4321);
assert.equal(app.nativeStepDebug().syncPending, true);

app.handleNativeStepMessage({
  type: 'vfit-health-connect-history',
  entries: [{ date: stepTodayKey, steps: 4500, capturedAt: '2026-09-29T05:01:00.000Z' }],
  capturedAt: '2026-09-29T05:01:00.000Z',
  cached: false
});
assert.equal(app.getState().stepsLogs[stepTodayKey], 4500);
assert.equal(app.nativeStepDebug().syncPending, false);
assert.equal(stepTrackingAction.textContent, 'Sync now');
assert.equal(stepTrackingAction.disabled, false);

// A fresh step result must complete the request even if a separate status
// message never arrives from the Android wrapper.
app.handleNativeStepMessage({ type: 'vfit-health-connect-status', availability: 'available', permission: 'prompt' });
app.requestStepTrackingPermission();
nativeStepListeners.get('message')({ data: JSON.stringify({ type: 'vfit-health-connect-ack', command: 'request_permission' }) });
app.handleNativeStepMessage({ type: 'vfit-health-connect-steps', date: stepTodayKey, steps: 4600, capturedAt: new Date().toISOString(), cached: false });
assert.equal(app.nativeStepDebug().permissionOpening, false);
assert.equal(app.nativeStepDebug().permissionPending, false);
assert.equal(stepTrackingAction.textContent, 'Sync now');
app.teardownStepTracking();
assert.equal(app.nativeStepDebug().accountReady, false);
app.setState(app.defaultState());

// Saved serving sizes and custom gram weights must use the same nutrition basis.
const savedServingFood = {
  isCustom: true,
  databaseItem: true,
  serving: '1 bar',
  servingGrams: 40,
  calories: 200,
  protein: 10,
  per100g: { calories: 500, protein: 25 }
};
assert.equal(app.foodNutrientsPerServing(savedServingFood).calories, 200);
assert.equal(app.foodNutrientsPer100g(savedServingFood).calories, 500);

const resizedServingFood = app.databaseFoodWithServingWeight(savedServingFood, 50, 12345);
assert.equal(resizedServingFood.servingGrams, 50);
assert.equal(resizedServingFood.calories, 200);
assert.equal(resizedServingFood.protein, 10);
assert.equal(resizedServingFood.per100g.calories, 400);
assert.equal(resizedServingFood.per100g.protein, 20);
assert.equal(resizedServingFood.updatedAt, 12345);

const scannedServingFood = {
  isCustom: false,
  serving: '1 scoop',
  servingGrams: 30,
  calories: 400,
  protein: 20
};
assert.equal(app.foodNutrientsPerServing(scannedServingFood).calories, 120);
assert.equal(app.foodNutrientsPerServing(scannedServingFood).protein, 6);

const loggedServingMeal = {
  amount: 2,
  amountType: 'portion',
  servingGrams: 40,
  calories: 400,
  protein: 20,
  base: { calories: 200, protein: 10, isCustom: true, serving: '1 bar' }
};
const servingAsSixtyGrams = app.copiedMealNutritionForAmount(loggedServingMeal, 'grams', 60);
assert.equal(servingAsSixtyGrams.totals.calories, 300);
assert.equal(servingAsSixtyGrams.totals.protein, 15);

const loggedWeightMeal = {
  amount: 80,
  amountType: 'grams',
  servingGrams: 40,
  calories: 400,
  protein: 20,
  base: { calories: 500, protein: 25, isCustom: false, serving: '100g' }
};
const weightAsOneAndHalfServings = app.copiedMealNutritionForAmount(loggedWeightMeal, 'portion', 1.5);
assert.equal(weightAsOneAndHalfServings.totals.calories, 300);
assert.equal(weightAsOneAndHalfServings.totals.protein, 15);

// Packet values survive copying even when the food database or serving basis
// has changed since the original day; identical names retain separate entries.
const packetDay = '2026-10-01';
const packetMeal = { id: 901, date: packetDay, name: 'Protein bar', mealType: 'lunch',
  amount: 2, amountType: 'portion', servingGrams: 40, servingLabel: '1 bar',
  calories: 400, protein: 20, base: { calories: 999, protein: 999, isCustom: true },
  per100g: { calories: 500, protein: 25 } };
assert.equal(app.copiedMealNutritionForAmount(packetMeal, 'portion', 2).totals.calories, 400);
assert.equal(app.copiedMealNutritionForAmount(packetMeal, 'grams', 60).totals.calories, 300);
const copyState = app.defaultState();
copyState.viewDate = '2026-10-05';
copyState.nutritionHistory = [{ date: packetDay, meals: [packetMeal] }];
copyState.dailyMeals = [{ ...packetMeal, id: 902, date: '2026-10-02', amount: 1 }];
app.setState(copyState);
assert.equal(app.getAllLoggedFoods().filter(food => food.name === 'Protein bar').length, 2);
app.togglePreviousMeal({ checked: true }, 0, packetDay);
app.copySelectedMeals();
const copiedPacketMeal = copyState.dailyMeals.at(-1);
assert.equal(copiedPacketMeal.date, copyState.viewDate);
assert.equal(copiedPacketMeal.copiedFromDate, packetDay);
assert.equal(copiedPacketMeal.amount, 2);
assert.equal(copiedPacketMeal.servingGrams, 40);
assert.equal(copiedPacketMeal.per100g.calories, 500);

const daySchedule = app.mealScheduleForDate('2026-10-05');
assert.deepEqual(Array.from(daySchedule.breakfast), [420, 660]);
assert.deepEqual(Array.from(daySchedule.lunch), [660, 1020]);
assert.deepEqual(Array.from(daySchedule.dinner), [1020, 1380]);
app.setDiaryWakeTime('09:00');
assert.deepEqual(Array.from(app.mealScheduleForDate('2026-10-05').breakfast), [540, 660]);
copyState.shiftProfile.rota['2026-10-06'] = { type: 'day', start: '16:00', end: '02:00' };
assert.deepEqual(Array.from(app.mealScheduleForDate('2026-10-06').dinner), [1440, 1800]);
assert.equal(app.mealSlotForTime('01:00', true, '2026-10-06'), 'dinner');
copyState.shiftProfile.rota['2026-10-07'] = { type: 'night', start: '20:00', end: '08:00' };
assert.deepEqual(Array.from(app.mealScheduleForDate('2026-10-07').lunch), [1320, 1680]);
assert.equal(app.sportMetFor('sport-soccer', 'hard'), 9.5);
assert.equal(app.sportNetCalories('sport-soccer', 'moderate', 60, 80), 480);
assert.equal(app.sportNetCalories('sport-tennis', 'easy', 30, 80), 160);
assert.equal(app.sportNetCalories('sport-tennis', 'easy', 30, 0), null);

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

// The original shift rotations remain intact, while the planner adds a fifth
// compatible option and swaps to five dedicated recipes for a saved diet.
const balancedMealState = app.defaultState();
app.setState(balancedMealState);
for (const type of ['night', 'early', 'day', 'off']) {
  for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack']) {
    const ideas = Array.from(app.shiftMealIdeasFor(type, mealType));
    assert.equal(ideas.length, 5, `${type} ${mealType} needs five visible choices`);
    assert.equal(new Set(ideas.map(item => item.id)).size, 5, `${type} ${mealType} ids must be unique`);
    assert.ok(ideas.slice(0, 4).every(item => item.id.startsWith(`${type}-`)), `${type} base rotation must stay shift-specific`);
    assert.ok(ideas.every(item => item.calories > 0 && item.protein > 0));
  }
}

const veganMealState = app.defaultState();
veganMealState.dietaryProfile.completed = true;
veganMealState.dietaryProfile.pattern = 'vegan';
app.setState(veganMealState);
const standardVeganBreakfasts = Array.from(app.shiftMealIdeasFor('night', 'breakfast'));
assert.equal(standardVeganBreakfasts.length, 5);
assert.ok(standardVeganBreakfasts.every(item => item.id.startsWith('vegan-')));
assert.ok(standardVeganBreakfasts.every(item => Array.isArray(item.ingredients) && item.ingredients.length >= 4));
assert.ok(app.shiftMealRecipeSteps(standardVeganBreakfasts[0]).length >= 3);

veganMealState.dietaryProfile.approaches = ['calorie_deficit'];
app.setState(veganMealState);
const deficitBreakfasts = Array.from(app.shiftMealIdeasFor('night', 'breakfast'));
assert.ok(deficitBreakfasts.every(item => item.portionAdjusted));
assert.ok(deficitBreakfasts.every(item => {
  const standard = standardVeganBreakfasts.find(base => base.id === item.id);
  return standard && item.calories < standard.calories;
}));
assert.equal(app.mealMatchesDietaryRequirements(
  { name: 'Greek yogurt bowl', allergens: ['dairy'] },
  { requirements: ['dairy_free'] }
), false);

// Every built-in recipe has a structured safety record rather than relying on
// runtime name matching. Records also provide substitutions where relevant.
const safetyCoverage = app.curatedMealSafetyCoverage();
assert.equal(safetyCoverage.recipes, 124);
assert.equal(safetyCoverage.records, 124);
assert.deepEqual([...safetyCoverage.missing], []);
const safetyRecord = app.structuredMealSafety(standardVeganBreakfasts[0]);
assert.equal(safetyRecord.source, 'curated-built-in-recipe-record');
assert.ok(Array.isArray(safetyRecord.allergens));

// Seven-day planning starts on Monday, follows rota overrides and only uses
// saved shopping-list ingredients, Create Meal entries or previous diary meals.
assert.equal(app.plannerWeekStart('2026-09-03'), '2026-08-31');
assert.equal(app.plannerWeekDates('2026-09-03').length, 7);
const plannerState = app.defaultState();
plannerState.dietaryProfile = {
  completed: true, pattern: 'vegan', approaches: ['calorie_deficit'], requirements: ['nut_free'], notes: ''
};
plannerState.shiftProfile.enabled = true;
plannerState.shiftProfile.rota['2026-09-03'] = { type: 'night', start: '20:00', end: '08:00' };
plannerState.createdMeals = [{
  id: 'created-breakfast',
  name: 'Saved tofu breakfast',
  calories: 430,
  protein: 32,
  carbs: 44,
  fat: 15,
  fiber: 9,
  defaultMealType: 'breakfast',
  ingredients: [{ name: 'Firm tofu', grams: 180 }, { name: 'Wholegrain wrap', grams: 70 }],
  createdAt: '2026-09-02T12:00:00.000Z'
}];
plannerState.createdMeals.push(
  { id: 'excluded-chinese', name: 'Chinese takeaway', calories: 600, protein: 30, defaultMealType: 'breakfast', ingredients: ['Chicken'] },
  { id: 'excluded-fish-chips', name: 'Fish & Chips', calories: 700, protein: 28, defaultMealType: 'breakfast', ingredients: ['Fish'] },
  { id: 'excluded-oversized', name: 'Oversized buffet plate', calories: 1800, protein: 70, defaultMealType: 'breakfast', ingredients: ['Mixed food'] }
);
plannerState.nutritionHistory = [{
  date: '2026-09-01',
  meals: [{
    id: 'diary-breakfast',
    name: 'Logged soy yogurt bowl',
    mealType: 'breakfast',
    calories: 390,
    protein: 29,
    carbs: 42,
    fat: 12,
    fiber: 8,
    ingredients: ['Soy yogurt', 'Berries']
  }]
}];
plannerState.shoppingItems = standardVeganBreakfasts[0].ingredients.map((name, index) => ({
  id: 'shopping-' + index,
  name,
  quantity: '1'
}));
app.setState(plannerState);
assert.equal(app.plannerShiftType('2026-09-03'), 'night');
const allowedBreakfasts = Array.from(app.plannerMealIdeas('2026-09-03', 'breakfast'));
assert.ok(allowedBreakfasts.some(idea => idea.createdMealSource));
assert.ok(allowedBreakfasts.some(idea => idea.diarySource));
assert.ok(allowedBreakfasts.some(idea => idea.shoppingListSource));
assert.ok(allowedBreakfasts.every(idea => idea.createdMealSource || idea.diarySource || idea.shoppingListSource));
assert.equal(app.plannerMealCalorieLimit('2026-09-03', 'breakfast'), 875);
assert.ok(allowedBreakfasts.every(idea => app.plannerMealIsAppropriate('2026-09-03', 'breakfast', idea)));
assert.ok(!allowedBreakfasts.some(idea => ['Chinese takeaway', 'Fish & Chips', 'Oversized buffet plate'].includes(idea.name)));
assert.equal(app.plannerMealIsAppropriate('2026-09-03', 'breakfast', { name: 'Chinese takeaway', calories: 600 }), false);
assert.equal(app.plannerMealIsAppropriate('2026-09-03', 'breakfast', { name: 'Fish & Chips', calories: 700 }), false);
assert.equal(app.plannerMealIsAppropriate('2026-09-03', 'breakfast', { name: 'Oversized buffet plate', calories: 1800 }), false);
assert.equal(app.plannerMealIsAppropriate('2026-09-03', 'breakfast', { name: 'Balanced breakfast', calories: 500 }), true);
const plannedMeal = app.plannerMealSelection('2026-09-03', 'breakfast');
assert.ok(plannedMeal.idea.createdMealSource || plannedMeal.idea.diarySource || plannedMeal.idea.shoppingListSource);
assert.equal(app.getState().weeklyMealPlan['2026-09-03'].meals.breakfast.recipeId, plannedMeal.idea.id);
const plannedDayTotals = app.weeklyPlannerDayTotals('2026-09-03');
const selectedDayIdeas = ['breakfast', 'lunch', 'dinner', 'snack']
  .map(mealType => app.plannerMealSelection('2026-09-03', mealType).idea)
  .filter(Boolean);
assert.equal(plannedDayTotals.calories, selectedDayIdeas.reduce((sum, idea) => sum + (Number(idea.calories) || 0), 0));
assert.equal(plannedDayTotals.protein, selectedDayIdeas.reduce((sum, idea) => sum + (Number(idea.protein) || 0), 0));

const emptyPlannerState = app.defaultState();
emptyPlannerState.dietaryProfile = plannerState.dietaryProfile;
emptyPlannerState.shiftProfile = plannerState.shiftProfile;
app.setState(emptyPlannerState);
assert.equal(app.plannerMealIdeas('2026-09-03', 'breakfast').length, 0);
assert.equal(app.plannerMealSelection('2026-09-03', 'breakfast').idea, null);

app.setState(plannerState);

const clientSnapshot = { dietaryProfile: plannerState.dietaryProfile, shiftProfile: plannerState.shiftProfile };
const coachIdeas = Array.from(app.coachPlanMealIdeas(clientSnapshot, '2026-09-03', 'breakfast'));
assert.equal(coachIdeas.length, 5);
assert.ok(coachIdeas.every(idea => idea.id.startsWith('vegan-') && idea.portionAdjusted));
assert.equal(app.coachPlanDocumentId('coach-1', 'member-2', '2026-09-03'), 'coach-1_member-2_2026-08-31');

// Photos use small IndexedDB references in account state; cloud/recovery copies
// can strip them without touching the private device gallery.
const photoReference = app.progressPhotoReference('2026-09-03', 'front', 'user-a');
assert.ok(photoReference.startsWith('vfit-photo:'));
assert.equal(app.progressPhotoIdFromReference(photoReference), 'user-a|2026-09-03|front');
assert.equal(app.isValidPhotoData(photoReference), true);
app.setState(app.defaultState());

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
const shoppingScannerSlot = document.getElementById('weekly-shopping-barcode-slot');
app.setBarcodeScanMode('shopping');
app.setBarcodeScannerEmbedded(true);
assert.equal(app.mountBarcodeScannerSurface(), true);
assert.equal(scannerCard.parentElement, shoppingScannerSlot);
assert.equal(shoppingScannerSlot.classList.contains('hidden'), false);
app.restoreBarcodeScannerSurface();
assert.equal(scannerCard.parentElement, scannerModal);
app.showMealBarcodeResult({ name: 'Test product', scannedBarcode: '5000112637922' });
assert.equal(document.getElementById('meal-barcode-product').textContent, 'Test product');
assert.equal(document.getElementById('meal-barcode-number').textContent, '5000112637922');
assert.equal(document.getElementById('meal-barcode-result').classList.contains('hidden'), false);

// Untrusted backups cannot introduce executable/prototype keys or unknown state.
const malicious = JSON.parse('{"goals":{"calories":2100,"__proto__":{"polluted":true}},"dietaryProfile":{"pattern":"unsupported","approaches":["calorie_deficit","unsafe"],"requirements":"bad-shape","notes":42},"unknownTop":"drop-me"}');
const normalized = app.normalizeState(malicious);
assert.equal(normalized.goals.calories, 2100);
assert.equal(normalized.unknownTop, undefined);
assert.equal({}.polluted, undefined);
assert.equal(normalized.dietaryProfile.pattern, 'balanced');
assert.deepEqual([...normalized.dietaryProfile.approaches], ['calorie_deficit']);
assert.deepEqual([...normalized.dietaryProfile.requirements], []);
assert.equal(normalized.dietaryProfile.notes, '42');

// Newer cloud preferences win while both histories survive and photos stay local.
const local = app.normalizeState({
  meta: { updatedAt: '2026-01-01T00:00:00.000Z' },
  goals: { calories: 2200 },
  dietaryProfile: { completed: true, pattern: 'balanced', approaches: [], requirements: [], notes: '' },
  workoutHistory: [{ id: 'local-workout', date: '2026-01-01' }],
  coachConversations: [{ id: 'local-coach-chat', date: '2026-01-01' }],
  metricsHistory: [{ date: '2026-01-01', weight: 100, photos: { front: 'data:image/jpeg;base64,AA==' } }]
});
const remote = {
  meta: { updatedAt: '2026-02-01T00:00:00.000Z' },
  goals: { calories: 2400 },
  dietaryProfile: { completed: true, pattern: 'vegan', approaches: ['calorie_deficit'], requirements: ['nut_free'], notes: 'No peanuts' },
  workoutHistory: [{ id: 'cloud-workout', date: '2026-02-01' }],
  metricsHistory: [{ date: '2026-01-01', weight: 99 }],
  checkIns: [{ id: 'cloud-checkin', date: '2026-02-01', energy: 4 }],
  coachConversations: [{ id: 'cloud-coach-chat', date: '2026-02-01' }],
  readinessLogs: { '2026-02-01': { score: 82 } }
};
const merged = app.mergeStateSnapshots(local, remote);
assert.equal(merged.goals.calories, 2400);
assert.equal(merged.dietaryProfile.pattern, 'vegan');
assert.deepEqual([...merged.dietaryProfile.approaches], ['calorie_deficit']);
assert.ok(merged.dietaryProfile.requirements.includes('nut_free'));
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

// The conversational coach keeps the daily readiness flow concise and prepends
// dietary-plan questions only until that saved profile has been completed.
const dailyQuestionState = app.defaultState();
dailyQuestionState.dietaryProfile.completed = true;
app.setState(dailyQuestionState);
const coachQuestions = app.aiCoachQuestionnaireSteps({ __dietarySetup: false });
assert.equal(coachQuestions.length, 7);
assert.equal(new Set(coachQuestions.map(step => step.id)).size, 7);
assert.ok(coachQuestions.every(step => step.question && step.options.length >= 3));
assert.ok(!coachQuestions.some(step => step.id === 'deloadWeek'));
const severeFatigueQuestions = app.aiCoachQuestionnaireSteps({ __dietarySetup: false, fatigue: '5' });
assert.equal(severeFatigueQuestions.length, 8);
const deloadQuestion = severeFatigueQuestions.find(step => step.id === 'deloadWeek');
assert.ok(deloadQuestion);
assert.equal(deloadQuestion.options.length, 2);

const firstDietaryQuestions = app.aiCoachQuestionnaireSteps({ __dietarySetup: true });
assert.ok(firstDietaryQuestions.some(step => step.id === 'dietRequirementOverview'));
assert.ok(firstDietaryQuestions.some(step => step.id === 'dietPattern'));
assert.ok(firstDietaryQuestions.some(step => step.id === 'dietApproach'));
assert.ok(!firstDietaryQuestions.some(step => step.id === 'dietRequirementDetails'));
const detailedDietaryQuestions = app.aiCoachQuestionnaireSteps({ __dietarySetup: true, dietRequirementOverview: 'allergy' });
const dietaryDetailQuestion = detailedDietaryQuestions.find(step => step.id === 'dietRequirementDetails');
assert.equal(dietaryDetailQuestion.inputType, 'text');

const capturedDietState = app.defaultState();
app.setState(capturedDietState);
assert.equal(app.applyDietaryCoachAnswers({
  dietRequirementOverview: 'allergy',
  dietRequirementDetails: 'Severe peanut allergy',
  dietPattern: 'vegan',
  dietApproach: 'fasting_deficit'
}), true);
assert.equal(app.getState().dietaryProfile.pattern, 'vegan');
assert.deepEqual([...app.getState().dietaryProfile.approaches], ['intermittent_fasting', 'calorie_deficit']);
assert.equal(app.getState().dietaryProfile.notes, 'Severe peanut allergy');
assert.ok(app.getState().dietaryProfile.requirements.includes('nut_free'));
assert.equal(app.getState().dietaryProfile.completed, true);

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
chatState.dietaryProfile.completed = true;
chatState.shiftProfile.enabled = true;
chatState.shiftProfile.shiftType = 'nights';
chatState.shiftProfile.workDays = [new Date().getDay()];
app.setUser(null);
app.setState(chatState);
app.openAICoachCheckIn();
for (const step of app.aiCoachQuestionnaireSteps({ __dietarySetup: false })) {
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
severeChatState.dietaryProfile.completed = true;
app.setState(severeChatState);
app.openAICoachCheckIn();
const severeAnswers = {
  mood: 'drained', sleepHours: '4.5', energy: '1', fatigue: '5', deloadWeek: 'yes',
  soreness: '3', stress: '5', wellbeing: 'well'
};
for (const step of app.aiCoachQuestionnaireSteps({ __dietarySetup: false, fatigue: '5' })) {
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
