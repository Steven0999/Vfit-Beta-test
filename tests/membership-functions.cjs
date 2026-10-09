'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const values = new Map([['users/member-1', { name: 'Member' }]]);
const merge = (previous, next) => {
  const result = { ...previous };
  for (const [key, value] of Object.entries(next)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value) && !('toMillis' in value)
      ? merge(previous[key] || {}, value) : value;
  }
  return result;
};
function snapshot(path) {
  const data = values.get(path);
  return {
    exists: !!data,
    data: () => data,
    get: field => field.split('.').reduce((current, key) => current && current[key], data)
  };
}
function ref(path) {
  return {
    path,
    get: async () => snapshot(path),
    set: async (data, options) => values.set(path, options && options.merge ? merge(values.get(path) || {}, data) : data),
    collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) })
  };
}
const db = {
  collection: name => ({ doc: id => ref(`${name}/${id}`) }),
  runTransaction: async callback => callback({
    get: async target => target.get(),
    set: (target, data, options) => target.set(data, options)
  })
};
const prices = {
  price_basic: { id: 'price_basic', active: true, currency: 'gbp', type: 'recurring', unit_amount: 499,
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } },
  price_platinum: { id: 'price_platinum', active: true, currency: 'gbp', type: 'recurring', unit_amount: 1899,
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } },
  price_coaching: { id: 'price_coaching', active: true, currency: 'gbp', type: 'recurring', unit_amount: 9799,
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } }
};
const sessions = new Map();
const subscriptions = new Map();
let sessionCount = 0;
let customerCount = 0;
const stripe = {
  prices: { retrieve: async id => prices[id] },
  customers: { create: async () => ({ id: `cus_${++customerCount}` }) },
  subscriptions: {
    list: async () => ({ data: [...subscriptions.values()], has_more: false }),
    retrieve: async id => subscriptions.get(id)
  },
  checkout: { sessions: {
    create: async params => {
      const session = { id: `cs_${++sessionCount}`, url: `https://checkout.stripe.com/${sessionCount}`,
        status: 'open', expires_at: params.expires_at };
      sessions.set(session.id, session);
      return session;
    },
    retrieve: async id => sessions.get(id),
    expire: async id => { sessions.get(id).status = 'expired'; }
  } },
  billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/test' }) } },
  webhooks: { constructEvent: (body, signature) => {
    if (signature !== 'valid') throw new Error('bad signature');
    return JSON.parse(body.toString());
  } }
};
const config = {
  STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake',
  STRIPE_BASIC_PRICE_ID: 'price_basic', STRIPE_PLATINUM_PRICE_ID: 'price_platinum',
  STRIPE_COACHING_PRICE_ID: 'price_coaching', VFIT_APP_URL: 'https://vfit.example.org/'
};
const backend = {};
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const mocks = {
  'firebase-functions/v2/https': { onCall: (options, fn) => fn, onRequest: (options, fn) => fn, HttpsError },
  'firebase-functions/v2/scheduler': { onSchedule: (options, fn) => fn },
  'firebase-functions/params': {
    defineSecret: name => ({ value: () => config[name] }),
    defineString: name => ({ value: () => config[name] })
  },
  'firebase-admin/app': { initializeApp() {} },
  'firebase-admin/auth': { getAuth() {} },
  'firebase-admin/firestore': {
    getFirestore: () => db,
    FieldValue: { serverTimestamp: () => 'server-time' },
    Timestamp: { fromMillis: ms => ({ toMillis: () => ms }) }
  },
  'firebase-admin/messaging': { getMessaging() {} },
  stripe: function Stripe() { return stripe; },
  './membership': require('../functions/membership'),
  './food-photo': require('../functions/food-photo')
};
const code = fs.readFileSync(new URL('../functions/index.js', `file://${__filename}`), 'utf8');
vm.runInNewContext(code, { exports: backend, require: name => mocks[name], URL, console }, { filename: 'functions/index.js' });
const request = { auth: { uid: 'member-1', token: { email_verified: true, email: 'member@example.org' } }, data: { plan: 'basic' } };
async function webhook(type, object, signature = 'valid') {
  const response = { code: null, body: null, status(code) { this.code = code; return this; }, send(body) { this.body = body; } };
  await backend.stripeWebhook({ rawBody: Buffer.from(JSON.stringify({ type, data: { object } })),
    headers: { 'stripe-signature': signature } }, response);
  return response;
}

(async () => {
  const catalog = await backend.getMembershipCatalog(request);
  assert.equal(catalog.plans[0].amount, 499);
  prices.price_basic.unit_amount = 500;
  await assert.rejects(backend.createCheckoutSession(request), error => error.code === 'failed-precondition');
  prices.price_basic.unit_amount = 499;
  await assert.rejects(backend.createCheckoutSession({ ...request, auth: { ...request.auth, token: { email_verified: false } } }),
    error => error.code === 'failed-precondition');

  const first = await backend.createCheckoutSession(request);
  const repeat = await backend.createCheckoutSession(request);
  assert.equal(first.url, repeat.url, 'repeat taps must reuse the same open Checkout Session');
  assert.equal(customerCount, 1);
  assert.equal(sessionCount, 1);
  assert.equal((await webhook('checkout.session.completed', { subscription: 'sub_1' }, 'bad')).code, 400);
  assert.equal(values.get('users/member-1').membership.status, undefined, 'bad signature must not grant a membership');

  const sub = { id: 'sub_1', customer: 'cus_1', created: 100, status: 'active',
    metadata: { firebaseUid: 'member-1' }, items: { data: [{ price: { id: 'price_basic' }, current_period_end: 1770000000 }] } };
  subscriptions.set(sub.id, sub);
  assert.equal((await webhook('checkout.session.completed', { subscription: sub.id })).code, 200);
  assert.equal(values.get('users/member-1').membership.tier, 'basic');
  assert.equal(values.get('users/member-1').membership.currentPeriodEnd.toMillis(), 1770000000000);
  await assert.rejects(backend.createCheckoutSession(request), error => error.code === 'already-exists');

  const newer = { ...sub, id: 'sub_2', created: 200, status: 'active',
    items: { data: [{ price: { id: 'price_platinum' }, current_period_end: 1780000000 }] } };
  subscriptions.set(newer.id, newer);
  await webhook('customer.subscription.created', newer);
  subscriptions.set(sub.id, { ...sub, status: 'canceled' });
  await webhook('customer.subscription.deleted', sub);
  assert.equal(values.get('users/member-1').membership.stripeSubscriptionId, 'sub_2', 'late old cancellation must not erase the new plan');
  assert.equal(values.get('users/member-1').membership.tier, 'platinum');
  subscriptions.set(newer.id, { ...newer, status: 'past_due' });
  await webhook('customer.subscription.updated', newer);
  assert.equal(values.get('users/member-1').membership.tier, 'free', 'failed renewal must remove paid tier');
  assert.equal(values.get('users/member-1').membership.status, 'past_due');

  console.log('VFIT payment function tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
