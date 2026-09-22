'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'Styles.css'), 'utf8');
const moduleFiles = [
  'core/state.js',
  'training/training.js',
  'nutrition/meal-planner.js',
  'nutrition/scanner.js',
  'ui/navigation.js',
  'coaching/coaching.js',
  'firebase/firebase-sync.js',
  'nutrition/meal-safety.js',
  'nutrition/weekly-planner.js',
  'metrics/photo-storage.js',
  'feedback/beta-feedback.js',
  'coaching/plan-builder.js',
  'App.js'
];
const moduleSources = new Map(moduleFiles.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const appSource = moduleFiles.map(file => moduleSources.get(file)).join('\n');
const source = html + '\n' + appSource;
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert.equal(inlineScripts.length, 0, 'application logic must live in external JavaScript modules');
assert.ok(!/<style\b/i.test(html), 'application styles must live in Styles.css');
assert.ok(html.includes('<link rel="stylesheet" href="./Styles.css">'), 'index.html must load Styles.css');
moduleFiles.forEach(file => assert.ok(html.includes(`<script src="./${file}"></script>`), `index.html must load ${file}`));
const localScripts = [...html.matchAll(/<script[^>]+src="\.\/([^"]+\.js)"[^>]*><\/script>/gi)].map(match => match[1]);
assert.deepEqual(localScripts.slice(-moduleFiles.length), moduleFiles, 'application modules must load in dependency order');
assert.ok(fs.existsSync(path.join(root, 'App.js')), 'App.js must remain the easy-to-find startup entry point');
assert.equal((moduleSources.get('App.js').match(/AUTH STATE OBSERVER/g) || []).length, 1, 'auth startup must run only after all feature modules load');
assert.ok(styles.trim().length > 1000, 'Styles.css must contain the extracted application styles');
moduleSources.forEach((contents, file) => assert.doesNotThrow(() => new Function(contents), `${file} must parse`));
new Function(appSource);

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  values.forEach(value => seen.has(value) ? repeated.add(value) : seen.add(value));
  return [...repeated];
}

const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(duplicates(ids), [], 'HTML ids must be unique');

const functions = [...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]);
assert.deepEqual(duplicates(functions), [], 'named functions must be unique');

const defined = new Set(functions);
const allowedCalls = new Set([
  'if', 'confirm', 'parseFloat', 'parseInt', 'Number', 'String',
  'getElementById', 'click', 'preventDefault', 'stopPropagation'
]);
for (const handler of source.matchAll(/\b(?:onclick|onchange|oninput|onkeydown|onsubmit)="([^"]*)"/g)) {
  for (const call of handler[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    assert.ok(defined.has(call[1]) || allowedCalls.has(call[1]), `unknown inline handler function: ${call[1]}`);
  }
}

assert.ok(!/lucide@latest/.test(source), 'Lucide must be version-pinned');
assert.ok(source.includes('html5-qrcode@2.3.8/html5-qrcode.min.js'), 'html5-qrcode must be version-pinned');
assert.ok(!source.includes('html5-qrcode@latest'), 'html5-qrcode must not use latest');
assert.ok(source.includes("new Html5Qrcode('barcode-reader')"), 'the original barcode scanner must be used');
assert.ok(source.includes('fps: 10'), 'the original barcode scanner frame rate must be preserved');
assert.ok(source.includes('aspectRatio: 1.6'), 'the original barcode scanner aspect ratio must be preserved');
assert.ok(source.includes('maxlength="64" placeholder="Or enter barcode manually..."'), 'the original manual barcode entry must be preserved');
assert.ok(!source.includes('barcode-torch-button'), 'the replacement torch control must not remain');
assert.ok(!source.includes('scanBarcodePhoto('), 'the replacement photo-scanning path must not remain');
assert.ok(source.includes('onclick="openBarcodeImagePicker()"'), 'photo barcode capture must release the live Android camera first');
assert.ok(source.includes('oncancel="cancelBarcodeImagePicker()"'), 'cancelling a barcode photo must restart the live scanner');
assert.ok(source.includes('const scannerIsVisible = barcodeScannerEmbedded ||') && source.includes('scannerIsVisible && !barcodeImagePickerOpen'), 'Android photo capture must survive the page-hidden transition');
assert.ok(source.includes('id="meal-barcode-inline-slot"') && source.includes('embeddedSlot.appendChild(card)'), 'the Create Meal scanner must stay embedded in the meal planner');
assert.ok(source.includes('id="weekly-shopping-barcode-slot"') && source.includes("barcodeScanMode = 'shopping'"), 'the scanner must also stay embedded in the weekly shopping list');
assert.ok(source.includes('id="meal-barcode-number"') && source.includes('showMealBarcodeResult(food)'), 'the full scanned barcode must appear in the meal planner');
assert.ok(source.includes('ing.barcode') && source.includes('escapeHtml(ing.barcode)'), 'scanned ingredient rows must retain and display their barcode');
assert.ok(!/localStorage\.setItem\(['"]fittrack_state/.test(source), 'legacy shared state must never be overwritten');
assert.ok(!/\beval\s*\(/.test(appSource), 'eval is not permitted');
assert.ok(!/\bnew\s+Function\s*\(/.test(appSource), 'dynamic Function is not permitted');
assert.ok(source.includes("{ skipInitialSet: true }"), 'restored workouts must not receive duplicate blank sets');
assert.ok(source.includes('escapeJsString(e.date)'), 'state-derived dates must be escaped in inline handlers');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
assert.ok(manifest.name && manifest.short_name && manifest.start_url && manifest.display, 'manifest is missing install fields');
const sizes = new Set((manifest.icons || []).map(icon => icon.sizes));
assert.ok(sizes.has('192x192') && sizes.has('512x512'), 'manifest needs 192px and 512px icons');

function pngDimensions(filename) {
  const data = fs.readFileSync(path.join(root, filename));
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG', `${filename} is not a PNG`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}
assert.deepEqual(pngDimensions('icon-192.png'), [192, 192]);
assert.deepEqual(pngDimensions('icon-512.png'), [512, 512]);

const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
new Function(serviceWorker);
const appVersion = source.match(/const VFIT_APP_VERSION = '([^']+)'/);
assert.ok(appVersion, 'app version must be declared');
assert.ok(serviceWorker.includes(`const CACHE_VERSION = 'vfit-${appVersion[1]}'`), 'service worker cache must match app version');
assert.ok(serviceWorker.includes("'./Styles.css'"), 'service worker must cache Styles.css');
moduleFiles.forEach(file => assert.ok(serviceWorker.includes(`'./${file}'`), `service worker must cache ${file}`));
assert.ok(serviceWorker.includes("'./App.js'"), 'service worker must cache the App.js startup entry point');
for (const host of ['googleapis.com', 'firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'world.openfoodfacts.org']) {
  assert.ok(serviceWorker.includes(host), `service worker must keep ${host} network-only`);
}
assert.ok(serviceWorker.includes('cloudfunctions.net'), 'service worker must keep Cloud Functions network-only');

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
assert.equal(firebaseConfig.firestore.rules, 'firestore.rules', 'firebase.json must publish the hardened rules file');
assert.equal(firebaseConfig.functions.source, 'functions', 'firebase.json must publish the Cloud Functions backend');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
assert.ok(!source.includes('OWNER_EMAIL'), 'owner access must not depend on an embedded email address');
for (const guard of [
  'match /admins/{uid}',
  'documents/admins/$(request.auth.uid)',
  'function approvedCoach()',
  'match /directory/{uid}',
  'match /users/{uid}',
  'match /devices/{deviceId}',
  'match /notes/{threadId}',
  'match /feedback/{feedbackId}',
  'match /coachPlans/{planId}',
  'function memberChangedOnlyCompletions()',
  'match /{document=**}',
  'allow read, write: if false;'
]) {
  assert.ok(firestoreRules.includes(guard), `Firestore rules are missing: ${guard}`);
}
assert.ok(firestoreRules.includes('allow list, create, update, delete: if false;'), 'admin records must not be client-writable');
assert.ok(firestoreRules.includes("hasAny(['membership'])"), 'membership must be blocked during client account creation');
assert.ok(firestoreRules.includes("'pushPreferences', 'privacy'"), 'self-update allowlist must include only explicit notification/privacy fields');
assert.ok(firestoreRules.includes("hasOnly(['completed'])"), 'members may only change coach-plan completion fields');
assert.ok(firestoreRules.includes("request.resource.data.status == 'new'"), 'new feedback must enter the owner workflow safely');
assert.ok(firestoreRules.includes('allow read: if owner();'), 'feedback reports and private owner notes must be owner-readable only');
assert.ok(!/allow\s+(?:read|write|read,\s*write)\s*:\s*if\s+true/.test(firestoreRules), 'Firestore rules must not allow unconditional access');

for (const feature of [
  'function calculateReadinessScore(',
  'function aiCoachQuestionnaireSteps(',
  'function dietaryProfile(',
  'function saveDietaryProfile(',
  'function applyDietaryCoachAnswers(',
  'function personalisedShiftMealIdeas(',
  'function openShiftMealDetail(',
  'function renderShiftMealDetail(',
  'function shiftMealRecipeSteps(',
  'function buildAICoachCheckInResult(',
  'function openAICoachCheckIn(',
  'function renderAICoachCheckInSummary(',
  'function buildDeloadPlan(',
  'function isDeloadPlanActive(',
  'function activeMuscleGainVolumePlan(',
  'function weeklySetTargetForMuscle(',
  'function elapsedWorkoutSeconds(',
  'function mountCoachingHubInSettings(',
  'function saveWeeklyCheckIn(',
  'function smartProgressionForExercise(',
  'function weeklyReportFor(',
  'function enablePushNotifications(',
  'function startMembershipCheckout(',
  'function deleteVfitAccount('
]) {
  assert.ok(source.includes(feature), `VFIT feature is missing: ${feature}`);
}

const dashboardStart = html.indexOf('<section id="dashboard"');
const coachingStart = html.indexOf('<section id="coaching"');
const profileStart = html.indexOf('<section id="profile"');
const settingsStart = html.indexOf('<section id="settings"');
assert.ok(dashboardStart >= 0 && coachingStart > dashboardStart && profileStart > coachingStart && settingsStart > profileStart, 'main sections must be present in order');
const dashboardMarkup = html.slice(dashboardStart, coachingStart);
const coachingMarkup = html.slice(coachingStart, profileStart);
assert.ok(!dashboardMarkup.includes('id="ai-coach-bubble"'), 'AI Coach insights must not remain split across the Dashboard');
for (const coachingId of ['ai-coach-checkin-summary', 'ai-coach-bubble', 'member-coach-section', 'readiness-summary', 'checkin-summary', 'dietary-profile-summary', 'dietary-shift-summary']) {
  assert.ok(coachingMarkup.includes(`id="${coachingId}"`), `${coachingId} must live in the Coaching Hub`);
}
assert.ok(source.includes('id="coaching-settings-slot"'), 'Settings must provide the Coaching Hub mount point');
assert.ok(source.includes("slot.appendChild(hub)"), 'the Coaching Hub must mount inside Settings');
assert.ok(source.includes("tabId === 'coaching' ? 'settings' : tabId"), 'legacy Coaching Hub links must open Settings');
assert.ok(source.includes('onclick="openCoachingHub(); toggleSidebar();"'), 'the Coaching Hub menu item must route into Settings');
assert.ok(source.includes('id="ai-coach-checkin-modal"'), 'conversational AI Coach modal must be present');
assert.ok(source.includes('role="log" aria-live="polite"'), 'AI Coach conversation must announce new messages accessibly');
assert.ok(source.includes('id="dietary-profile-modal"') && source.includes('Build Your Dietary Plan'), 'Coaching must contain the dietary questionnaire');
for (const dietaryChoice of ['Vegan', 'Vegetarian', 'Ketogenic', 'Intermittent fasting', 'Calorie deficit']) {
  assert.ok(source.includes(dietaryChoice), `dietary questionnaire is missing: ${dietaryChoice}`);
}
assert.ok(source.includes("id: 'dietRequirementOverview'") && source.includes("id: 'dietRequirementDetails'"), 'AI Coach must collect dietary requirements');
assert.ok(source.includes('id="shift-meal-detail-modal"'), 'the larger shift-meal recipe popup must be present');
assert.ok(source.includes('More meals you can make'), 'recipe popup must show the compatible meal library');
assert.ok(source.includes('Ingredients') && source.includes('Instructions'), 'recipe popup must show ingredients and instructions');
assert.ok((source.match(/dietaryMeal\('/g) || []).length >= 60, 'specific diets need at least 60 meal definitions');
assert.ok(source.includes('Meal filtering is a planning aid and cannot guarantee allergen-free preparation'), 'dietary questionnaire needs an allergen safety boundary');
assert.ok(source.includes('id="mg-scope-general"') && source.includes('id="mg-scope-specific"'), 'muscle goals must distinguish full-body and specific-area focus');
assert.ok(source.includes('12–16 sets per muscle/week') && source.includes('12–20 sets per priority/week'), 'goal-specific weekly set ranges must be visible');
assert.ok(source.includes('function shiftMealIdeasFor('), 'shift-specific meal rotations must be present');
assert.ok(source.includes('data-shift-meal-options="${optionCount}"'), 'shift meal categories must expose their real option count');
assert.ok(source.includes('function dietaryShiftCoachAdvice(') && source.includes('function dietaryShiftFocusHTML('), 'shift focus must use the saved dietary plan');
assert.ok(source.includes('View Recipe &amp; More Meals'), 'meal cards must open the larger recipe popup');
assert.ok(source.includes('function curatedMealSafetyCoverage(') && source.includes('CURATED_MEAL_SAFETY'), 'built-in recipes need structured safety records');
assert.equal((moduleSources.get('nutrition/meal-safety.js').match(/^\s*'[^']+': \[/gm) || []).length, 64, 'all 64 original shift meals need explicit allergen records');
assert.ok(source.includes('function openWeeklyMealPlanner(') && source.includes('Combined shopping list'), 'seven-day meal planning and shopping must be available');
assert.ok(source.includes('function plannerMealCalorieLimit(') && source.includes('function plannerMealIsAppropriate('), 'weekly planner must filter unsuitable high-calorie meals');
assert.ok(source.includes('WEEKLY_MEAL_EXCLUDED_NAME') && source.includes('Chinese or fish and chips'), 'weekly planner must exclude requested takeaway-style choices without deleting them');
assert.ok(source.includes('function selectWeeklyMeal(') && source.includes('onchange="selectWeeklyMeal('), 'every planned meal needs a suitable-meal dropdown');
assert.ok(source.includes('Choose a suitable meal'), 'weekly meal dropdown needs a clear label');
assert.ok(source.includes('Scan a product in Shopping List') && source.includes('function addShoppingProductFromBarcode('), 'barcode results must return to the planner shopping list');
assert.ok(source.includes('function submitBetaFeedback(') && source.includes('Safe diagnostics included'), 'in-app beta feedback must include privacy-safe diagnostics');
assert.ok(source.includes('function openCoachPlanBuilder(') && source.includes('function acceptMemberCoachPlan('), 'coach/member seven-day plan workflow must be present');
assert.ok(source.includes("const VFIT_PHOTO_DB_NAME = 'vfit-progress-photos'") && source.includes('window.indexedDB.open'), 'progress photos must use expanded IndexedDB storage');
assert.ok(source.includes('progressPhotos: records.map') && source.includes('Backup and progress photos restored'), 'photo backup and restore must be included');
assert.ok(html.includes('id="photo-storage-status"') && html.includes('No fixed VFIT photo limit'), 'the progress-photo modal must explain expanded capacity');
assert.ok(source.includes("id: 'deloadWeek'"), 'severe fatigue must reveal a deload-week question');
assert.ok(source.includes('startedAt: workoutStartTime'), 'active workouts must persist the absolute start timestamp');
assert.ok(source.includes('return elapsedWorkoutSeconds(workoutStartTime, workoutAccumulatedSeconds, Date.now())'), 'workout duration must derive from wall-clock time');
assert.ok(!source.includes('workoutAccumulatedSeconds += Math.floor'), 'backgrounding must not freeze and bank the workout timer');

const foodDatabaseStart = html.indexOf('<div id="food-database-modal"');
const foodDatabaseEnd = html.indexOf('<!-- GOAL SETTING MODAL -->', foodDatabaseStart);
const foodDatabaseMarkup = html.slice(foodDatabaseStart, foodDatabaseEnd);
assert.ok(foodDatabaseMarkup.includes('id="food-database-add-button"') && foodDatabaseMarkup.includes('Manually Add Food'), 'authorized database editors need a clear manual food action');
assert.ok(foodDatabaseMarkup.includes('Enter portion weight, calories and protein'), 'manual food action must explain its core nutrition fields');
for (const requiredFoodField of ['manual-food-name', 'manual-food-calories', 'manual-food-protein', 'manual-food-serving-grams']) {
  assert.match(html, new RegExp(`id="${requiredFoodField}"[^>]*required[^>]*aria-required="true"`), `${requiredFoodField} must be required`);
}
assert.ok(source.includes("addButton.classList.toggle('hidden', !canManage)"), 'manual database entry must stay restricted to the owner and approved editors');
assert.ok(source.includes('const requiredNutritionInputs = [') && source.includes("showToast('Please enter calories and protein')"), 'manual database saves must require calories and protein');

const runtimeConfig = fs.readFileSync(path.join(root, 'vfit-config.js'), 'utf8');
assert.ok(runtimeConfig.includes('paymentsEnabled: false'), 'payments must default off until Stripe is configured');
assert.ok(runtimeConfig.includes('pushEnabled: false'), 'push must default off until FCM is configured');
assert.ok(!/sk_(?:live|test)_[A-Za-z0-9]+/.test(runtimeConfig), 'Stripe secret keys must never be shipped to the browser');

const functionsSource = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
for (const backend of ['createCheckoutSession', 'stripeWebhook', 'sendUserPush', 'sendDueReminders', 'deleteMyAccount']) {
  assert.ok(functionsSource.includes(`exports.${backend}`), `Cloud Function is missing: ${backend}`);
}
for (const deletionTarget of ["collection('coachPlans').where('coachUid'", "collection('coachPlans').where('memberUid'", "collection('feedback').where('uid'"]) {
  assert.ok(functionsSource.includes(deletionTarget), `account deletion must include ${deletionTarget}`);
}

assert.ok((manifest.shortcuts || []).some(item => item.url === './#coaching'), 'manifest needs a Coaching Hub shortcut');

console.log(`VFIT static audit passed (${ids.length} ids, ${functions.length} functions)`);