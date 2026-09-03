'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert.equal(inlineScripts.length, 1, 'expected one inline application script');
inlineScripts.forEach(script => new Function(script));

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  values.forEach(value => seen.has(value) ? repeated.add(value) : seen.add(value));
  return [...repeated];
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(duplicates(ids), [], 'HTML ids must be unique');

const functions = [...html.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]);
assert.deepEqual(duplicates(functions), [], 'named functions must be unique');

const defined = new Set(functions);
const allowedCalls = new Set([
  'if', 'confirm', 'parseFloat', 'parseInt', 'Number', 'String',
  'getElementById', 'click', 'preventDefault', 'stopPropagation'
]);
for (const handler of html.matchAll(/\b(?:onclick|onchange|oninput|onkeydown|onsubmit)="([^"]*)"/g)) {
  for (const call of handler[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    assert.ok(defined.has(call[1]) || allowedCalls.has(call[1]), `unknown inline handler function: ${call[1]}`);
  }
}

assert.ok(!/lucide@latest/.test(html), 'Lucide must be version-pinned');
assert.ok(html.includes('html5-qrcode@2.3.8/html5-qrcode.min.js'), 'html5-qrcode must be version-pinned');
assert.ok(!html.includes('html5-qrcode@latest'), 'html5-qrcode must not use latest');
assert.ok(!/localStorage\.setItem\(['"]fittrack_state/.test(html), 'legacy shared state must never be overwritten');
assert.ok(!/\beval\s*\(/.test(inlineScripts[0]), 'eval is not permitted');
assert.ok(!/\bnew\s+Function\s*\(/.test(inlineScripts[0]), 'dynamic Function is not permitted');
assert.ok(html.includes("{ skipInitialSet: true }"), 'restored workouts must not receive duplicate blank sets');
assert.ok(html.includes('escapeJsString(e.date)'), 'state-derived dates must be escaped in inline handlers');

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
for (const host of ['googleapis.com', 'firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'world.openfoodfacts.org']) {
  assert.ok(serviceWorker.includes(host), `service worker must keep ${host} network-only`);
}
assert.ok(serviceWorker.includes('cloudfunctions.net'), 'service worker must keep Cloud Functions network-only');

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
assert.equal(firebaseConfig.firestore.rules, 'firestore.rules', 'firebase.json must publish the hardened rules file');
assert.equal(firebaseConfig.functions.source, 'functions', 'firebase.json must publish the Cloud Functions backend');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
assert.ok(!html.includes('OWNER_EMAIL'), 'owner access must not depend on an embedded email address');
for (const guard of [
  'match /admins/{uid}',
  'documents/admins/$(request.auth.uid)',
  'function approvedCoach()',
  'match /directory/{uid}',
  'match /users/{uid}',
  'match /devices/{deviceId}',
  'match /notes/{threadId}',
  'match /{document=**}',
  'allow read, write: if false;'
]) {
  assert.ok(firestoreRules.includes(guard), `Firestore rules are missing: ${guard}`);
}
assert.ok(firestoreRules.includes('allow list, create, update, delete: if false;'), 'admin records must not be client-writable');
assert.ok(firestoreRules.includes("hasAny(['membership'])"), 'membership must be blocked during client account creation');
assert.ok(firestoreRules.includes("'pushPreferences', 'privacy'"), 'self-update allowlist must include only explicit notification/privacy fields');
assert.ok(!/allow\s+(?:read|write|read,\s*write)\s*:\s*if\s+true/.test(firestoreRules), 'Firestore rules must not allow unconditional access');

for (const feature of [
  'function calculateReadinessScore(',
  'function saveWeeklyCheckIn(',
  'function smartProgressionForExercise(',
  'function weeklyReportFor(',
  'function enablePushNotifications(',
  'function startMembershipCheckout(',
  'function deleteVfitAccount('
]) {
  assert.ok(html.includes(feature), `VFIT feature is missing: ${feature}`);
}

const runtimeConfig = fs.readFileSync(path.join(root, 'vfit-config.js'), 'utf8');
assert.ok(runtimeConfig.includes('paymentsEnabled: false'), 'payments must default off until Stripe is configured');
assert.ok(runtimeConfig.includes('pushEnabled: false'), 'push must default off until FCM is configured');
assert.ok(!/sk_(?:live|test)_[A-Za-z0-9]+/.test(runtimeConfig), 'Stripe secret keys must never be shipped to the browser');

const functionsSource = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
for (const backend of ['createCheckoutSession', 'stripeWebhook', 'sendUserPush', 'sendDueReminders', 'deleteMyAccount']) {
  assert.ok(functionsSource.includes(`exports.${backend}`), `Cloud Function is missing: ${backend}`);
}

assert.ok((manifest.shortcuts || []).some(item => item.url === './#coaching'), 'manifest needs a Coaching Hub shortcut');

console.log(`VFIT static audit passed (${ids.length} ids, ${functions.length} functions)`);
