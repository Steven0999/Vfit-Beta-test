'use strict';

const assert = require('node:assert/strict');
const { PLANS, validPrice, subscriptionState, blocksNewCheckout } = require('../functions/membership');

for (const [plan, details] of Object.entries(PLANS)) {
  const price = {
    id: `price_${plan}`, active: true, type: 'recurring', currency: 'gbp', unit_amount: details.amount,
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }
  };
  assert.equal(validPrice(price, plan), true);
  assert.equal(validPrice({ ...price, unit_amount: details.amount + 1 }, plan), false, 'wrong amount must not charge');
  assert.equal(validPrice({ ...price, currency: 'usd' }, plan), false, 'wrong currency must not charge');
  assert.equal(validPrice({ ...price, recurring: { ...price.recurring, interval: 'year' } }, plan), false);
  assert.equal(validPrice({ ...price, active: false }, plan), false);
}
assert.equal(validPrice(null, 'basic'), false);
assert.equal(validPrice({ id: 'price_unknown' }, 'invalid'), false);

const priceIds = { basic: 'price_basic', platinum: 'price_platinum', coaching: 'price_coaching' };
const subscription = {
  id: 'sub_123', created: 12345, customer: 'cus_123', status: 'active', cancel_at_period_end: false,
  items: { data: [{ price: { id: 'price_basic' }, current_period_end: 1770000000 }] }
};
assert.deepEqual(subscriptionState(subscription, priceIds), {
  stripeCustomerId: 'cus_123', stripeSubscriptionId: 'sub_123', stripeSubscriptionCreated: 12345,
  priceId: 'price_basic', tier: 'basic', status: 'active', priceMismatch: false,
  cancelAtPeriodEnd: false, currentPeriodEndSeconds: 1770000000
});
assert.equal(subscriptionState({ ...subscription, status: 'past_due' }, priceIds).tier, 'free');
assert.equal(subscriptionState({ ...subscription, status: 'trialing' }, priceIds).tier, 'basic');
assert.equal(subscriptionState({ ...subscription, cancel_at_period_end: true }, priceIds).cancelAtPeriodEnd, true);
assert.equal(subscriptionState({ ...subscription, items: { data: [{ price: { id: 'price_other' } }] } }, priceIds).priceMismatch, true);
assert.equal(subscriptionState({ ...subscription, items: { data: [{ price: { id: 'price_other' } }] } }, priceIds).tier, 'free');
assert.equal(subscriptionState({ ...subscription, items: { data: [{ price: { id: 'price_basic' } }] }, current_period_end: 77 }, priceIds).currentPeriodEndSeconds, 77);
for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) {
  assert.equal(blocksNewCheckout(status), true, `${status} must block duplicate checkout`);
}
for (const status of ['canceled', 'incomplete_expired']) assert.equal(blocksNewCheckout(status), false);

console.log('VFIT membership tests passed');
