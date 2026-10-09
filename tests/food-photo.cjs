'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { validatePhotoDataUrl, extractFoodEstimate } = require('../functions/food-photo');

const photo = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString('base64');
assert.equal(validatePhotoDataUrl(photo), photo);
assert.equal(validatePhotoDataUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
assert.equal(validatePhotoDataUrl('data:image/jpeg;base64,' + Buffer.from('not a jpeg').toString('base64')), null);
assert.equal(validatePhotoDataUrl(photo + 'garbage'), null);
assert.equal(validatePhotoDataUrl('data:image/jpeg;base64,' + 'A'.repeat(1500000)), null);

const apiResult = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text',
  text: JSON.stringify({ canEstimate: true, foodName: 'Chicken kebab', calories: 850, proteinGrams: 48,
    portionDescription: 'one large kebab', uncertainty: 'Sauce quantity is unknown.' }) }] }] };
assert.equal(extractFoodEstimate(apiResult).calories, 850);
assert.equal(extractFoodEstimate({ ...apiResult, status: 'incomplete' }), null);
assert.equal(extractFoodEstimate({ ...apiResult, output: [{ type: 'message', content: [{ type: 'refusal' }] }] }), null);

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const docs = new Map([['admins/owner-1', { active: true }]]);
const ref = path => ({
  get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
  collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) })
});
const db = {
  collection: name => ({ doc: id => ref(`${name}/${id}`) }),
  runTransaction: async work => work({ get: target => target.get(),
    set: (target, data) => docs.set(target.path, data) })
};
// Attach the path to the same reference shape used above.
db.collection = name => ({ doc: id => {
  const value = ref(`${name}/${id}`);
  value.path = `${name}/${id}`;
  value.collection = child => ({ doc: childId => {
    const nested = ref(`${name}/${id}/${child}/${childId}`);
    nested.path = `${name}/${id}/${child}/${childId}`;
    return nested;
  } });
  return value;
} });
let user = { disabled: false, emailVerified: true, email: 'steven.vaughanrr@hotmail.co.uk' };
let calls = 0;
const backend = {};
const mocks = {
  'firebase-functions/v2/https': { onCall: (options, fn) => fn, onRequest: (options, fn) => fn, HttpsError },
  'firebase-functions/v2/scheduler': { onSchedule: (options, fn) => fn },
  'firebase-functions/params': { defineSecret: name => ({ value: () => name === 'OPENAI_API_KEY' ? 'test-key' : '' }),
    defineString: () => ({ value: () => '' }) },
  'firebase-admin/app': { initializeApp() {} },
  'firebase-admin/auth': { getAuth: () => ({ getUser: async () => user }) },
  'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { serverTimestamp: () => 0 }, Timestamp: {} },
  'firebase-admin/messaging': { getMessaging() {} },
  stripe: function Stripe() {},
  './membership': require('../functions/membership'),
  './food-photo': require('../functions/food-photo')
};
const code = fs.readFileSync(new URL('../functions/index.js', `file://${__filename}`), 'utf8');
vm.runInNewContext(code, { exports: backend, require: name => mocks[name], URL, console, Date, AbortSignal,
  fetch: async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(JSON.parse(options.body).store, false);
    assert.equal(JSON.parse(options.body).input[0].content[1].image_url, photo);
    return { ok: true, json: async () => apiResult };
  } }, { filename: 'functions/index.js' });
const request = { auth: { uid: 'owner-1', token: {} }, data: { photo, context: 'Large kebab' } };

(async () => {
  await assert.rejects(backend.estimateFoodPhoto({ ...request, auth: null }), error => error.code === 'unauthenticated');
  user = { ...user, email: 'someone@example.org' };
  await assert.rejects(backend.estimateFoodPhoto(request), error => error.code === 'permission-denied');
  user = { ...user, email: 'steven.vaughanrr@hotmail.co.uk', emailVerified: false };
  await assert.rejects(backend.estimateFoodPhoto(request), error => error.code === 'permission-denied');
  user = { ...user, emailVerified: true };
  docs.set('admins/owner-1', { active: false });
  await assert.rejects(backend.estimateFoodPhoto(request), error => error.code === 'permission-denied');
  docs.set('admins/owner-1', { active: true });
  await assert.rejects(backend.estimateFoodPhoto({ ...request, data: { photo: 'oops' } }), error => error.code === 'invalid-argument');
  assert.equal(calls, 0);
  const estimate = await backend.estimateFoodPhoto(request);
  assert.equal(estimate.calories, 850);
  assert.equal(estimate.proteinGrams, 48);
  assert.equal(calls, 1);
  assert.equal(docs.get('admins/owner-1/foodPhotoUsage/' + new Date().toISOString().slice(0, 10)).count, 1);
  console.log('Owner photo estimate auth, validation and review draft passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
