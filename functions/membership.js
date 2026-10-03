'use strict';

// The advertised monthly prices are deliberate. Reject a misconfigured Stripe
// Price instead of silently charging a different amount or billing interval.
const PLANS = Object.freeze({
  basic: Object.freeze({ label: 'Basic', amount: 1000 }),
  platinum: Object.freeze({ label: 'Platinum', amount: 5000 }),
  coaching: Object.freeze({ label: '1-to-1 Coaching', amount: 25000 })
});

function validPrice(price, plan) {
  const expected = PLANS[plan];
  return Boolean(expected && price && price.id && price.active && price.type === 'recurring'
    && price.currency === 'gbp' && price.unit_amount === expected.amount
    && price.recurring && price.recurring.interval === 'month'
    && price.recurring.interval_count === 1 && price.recurring.usage_type === 'licensed');
}

function customerId(value) {
  return typeof value === 'string' ? value : (value && value.id) || '';
}

function subscriptionState(subscription, priceIds) {
  const item = subscription.items && subscription.items.data && subscription.items.data[0];
  const priceId = item && item.price && item.price.id;
  const tier = Object.keys(PLANS).find(plan => priceIds[plan] && priceIds[plan] === priceId) || 'free';
  const active = ['active', 'trialing'].includes(subscription.status);
  // Basil and later Stripe API versions put this field on each item.
  const periodEnd = (item && item.current_period_end) || subscription.current_period_end || 0;
  return {
    stripeCustomerId: customerId(subscription.customer),
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionCreated: subscription.created || 0,
    priceId: priceId || '',
    tier: active ? tier : 'free',
    status: subscription.status,
    priceMismatch: active && tier === 'free',
    cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
    currentPeriodEndSeconds: periodEnd
  };
}

function blocksNewCheckout(status) {
  return !['canceled', 'incomplete_expired'].includes(status);
}

module.exports = { PLANS, validPrice, customerId, subscriptionState, blocksNewCheckout };
