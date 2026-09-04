'use strict';

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const Stripe = require('stripe');

initializeApp();
const db = getFirestore();

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const STRIPE_BASIC_PRICE_ID = defineString('STRIPE_BASIC_PRICE_ID', { default: '' });
const STRIPE_PLATINUM_PRICE_ID = defineString('STRIPE_PLATINUM_PRICE_ID', { default: '' });
const STRIPE_COACHING_PRICE_ID = defineString('STRIPE_COACHING_PRICE_ID', { default: '' });
const VFIT_APP_URL = defineString('VFIT_APP_URL', { default: 'https://example.com/' });
const REGION = 'europe-west2';

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  return request.auth.uid;
}

function cleanText(value, maxLength) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function nowMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function planConfig(plan) {
  const plans = {
    basic: { priceId: STRIPE_BASIC_PRICE_ID.value(), label: 'Basic' },
    platinum: { priceId: STRIPE_PLATINUM_PRICE_ID.value(), label: 'Platinum' },
    coaching: { priceId: STRIPE_COACHING_PRICE_ID.value(), label: '1-to-1 Coaching' }
  };
  return plans[plan] || null;
}

exports.createCheckoutSession = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY], enforceAppCheck: true }, async request => {
  const uid = requireAuth(request);
  if (!request.auth.token.email_verified) throw new HttpsError('failed-precondition', 'Verify your email before starting a paid membership.');
  const plan = cleanText(request.data && request.data.plan, 30).toLowerCase();
  const selected = planConfig(plan);
  if (!selected || !selected.priceId) throw new HttpsError('failed-precondition', 'That membership plan is not configured.');

  const stripe = new Stripe(STRIPE_SECRET_KEY.value());
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.data() || {};
  if (user.membership && ['active', 'trialing'].includes(user.membership.status)) {
    throw new HttpsError('already-exists', 'An active membership already exists. Use the billing portal to manage it.');
  }
  let customerId = user.membership && user.membership.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: request.auth.token.email || undefined,
      name: user.name || undefined,
      metadata: { firebaseUid: uid }
    });
    customerId = customer.id;
    await userRef.set({ membership: { stripeCustomerId: customerId, tier: 'free', status: 'inactive' } }, { merge: true });
  }

  const appUrl = new URL(VFIT_APP_URL.value());
  const successUrl = new URL('?checkout=success', appUrl).toString();
  const cancelUrl = new URL('?checkout=cancelled', appUrl).toString();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: selected.priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: uid,
    metadata: { firebaseUid: uid, plan },
    subscription_data: { metadata: { firebaseUid: uid, plan } },
    allow_promotion_codes: true
  });
  return { url: session.url };
});

exports.createBillingPortalSession = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY], enforceAppCheck: true }, async request => {
  const uid = requireAuth(request);
  const snap = await db.collection('users').doc(uid).get();
  const customerId = snap.get('membership.stripeCustomerId');
  if (!customerId) throw new HttpsError('failed-precondition', 'No billing account exists yet.');
  const stripe = new Stripe(STRIPE_SECRET_KEY.value());
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: new URL(VFIT_APP_URL.value()).toString()
  });
  return { url: session.url };
});

function tierFromPriceId(priceId) {
  if (priceId === STRIPE_BASIC_PRICE_ID.value()) return 'basic';
  if (priceId === STRIPE_PLATINUM_PRICE_ID.value()) return 'platinum';
  if (priceId === STRIPE_COACHING_PRICE_ID.value()) return 'coaching';
  return 'free';
}

async function updateMembershipFromSubscription(stripe, subscription) {
  let uid = subscription.metadata && subscription.metadata.firebaseUid;
  if (!uid && subscription.customer) {
    const match = await db.collection('users').where('membership.stripeCustomerId', '==', subscription.customer).limit(1).get();
    if (!match.empty) uid = match.docs[0].id;
  }
  if (!uid) return;
  const priceId = subscription.items && subscription.items.data[0] && subscription.items.data[0].price.id;
  const active = ['active', 'trialing'].includes(subscription.status);
  await db.collection('users').doc(uid).set({
    membership: {
      stripeCustomerId: String(subscription.customer || ''),
      stripeSubscriptionId: subscription.id,
      tier: active ? tierFromPriceId(priceId) : 'free',
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end
        ? Timestamp.fromMillis(subscription.current_period_end * 1000)
        : null,
      updatedAt: FieldValue.serverTimestamp()
    }
  }, { merge: true });
}

exports.stripeWebhook = onRequest({ region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (request, response) => {
  const stripe = new Stripe(STRIPE_SECRET_KEY.value());
  let event;
  try {
    event = stripe.webhooks.constructEvent(request.rawBody, request.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET.value());
  } catch (error) {
    response.status(400).send('Invalid webhook signature');
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      await updateMembershipFromSubscription(stripe, subscription);
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    await updateMembershipFromSubscription(stripe, event.data.object);
  }
  response.status(200).send('ok');
});

async function relationshipAllows(senderUid, recipientUid) {
  if (!recipientUid || senderUid === recipientUid) return senderUid === recipientUid;
  const [senderSnap, recipientSnap] = await Promise.all([
    db.collection('users').doc(senderUid).get(),
    db.collection('users').doc(recipientUid).get()
  ]);
  if (!senderSnap.exists || !recipientSnap.exists) return false;
  const sender = senderSnap.data() || {};
  const recipient = recipientSnap.data() || {};
  return sender.coachUid === recipientUid || recipient.coachUid === senderUid;
}

function safePushUrl(value) {
  try {
    const url = new URL(String(value || VFIT_APP_URL.value()));
    return url.protocol === 'https:' ? url.toString() : new URL(VFIT_APP_URL.value()).toString();
  } catch (error) {
    return new URL(VFIT_APP_URL.value()).toString();
  }
}

async function sendToUser(recipientUid, title, body, url, kind) {
  const userRef = db.collection('users').doc(recipientUid);
  const userSnap = await userRef.get();
  const preferences = userSnap.get('pushPreferences') || {};
  if (!preferences.enabled) return { sent: 0, skipped: 'disabled' };
  const preferenceKey = ['workout', 'checkin', 'hydration', 'coachMessages'].includes(kind) ? kind : 'coachMessages';
  const storedKey = preferenceKey === 'checkin' ? 'checkIns' : preferenceKey;
  if (preferences[storedKey] === false) return { sent: 0, skipped: 'preference' };

  const devices = await userRef.collection('devices').where('active', '==', true).limit(20).get();
  const tokenDocs = devices.docs.filter(doc => {
    const token = doc.get('token');
    return typeof token === 'string' && token.length > 20;
  });
  const tokens = tokenDocs.map(doc => doc.get('token'));
  if (!tokens.length) return { sent: 0 };
  const targetUrl = safePushUrl(url);
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title: cleanText(title, 80), body: cleanText(body, 180), url: cleanText(targetUrl, 300) },
    webpush: { headers: { Urgency: 'normal', TTL: '86400' }, fcmOptions: { link: cleanText(targetUrl, 300) } }
  });
  const invalid = [];
  response.responses.forEach((item, index) => {
    if (!item.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(item.error && item.error.code)) {
      invalid.push(tokenDocs[index].ref.set({ active: false, disabledAt: FieldValue.serverTimestamp() }, { merge: true }));
    }
  });
  await Promise.allSettled(invalid);
  return { sent: response.successCount };
}

exports.sendUserPush = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  const senderUid = requireAuth(request);
  const recipientUid = cleanText(request.data && request.data.recipientUid, 128);
  if (!(await relationshipAllows(senderUid, recipientUid))) throw new HttpsError('permission-denied', 'That notification is not allowed.');
  const rateRef = db.collection('users').doc(senderUid).collection('serverMeta').doc('pushRate');
  await db.runTransaction(async transaction => {
    const rateSnap = await transaction.get(rateRef);
    const previous = rateSnap.exists ? rateSnap.get('lastSentAt') : null;
    if (previous && nowMillis(previous) > Date.now() - 10000) {
      throw new HttpsError('resource-exhausted', 'Wait a few seconds before sending another push.');
    }
    transaction.set(rateRef, { lastSentAt: Timestamp.now(), recipientUid }, { merge: true });
  });
  return sendToUser(recipientUid, request.data.title, request.data.body, request.data.url, 'coachMessages');
});

exports.sendDueReminders = onSchedule({ region: REGION, schedule: 'every 30 minutes', timeZone: 'Europe/London' }, async () => {
  const now = Timestamp.now();
  const due = await db.collection('users').where('pushPreferences.nextReminderAt', '<=', now).limit(200).get();
  await Promise.allSettled(due.docs.map(async doc => {
    const prefs = doc.get('pushPreferences') || {};
    if (!prefs.enabled) return;
    const kind = ['workout', 'checkin', 'hydration'].includes(prefs.nextReminderKind) ? prefs.nextReminderKind : 'workout';
    const copy = kind === 'checkin'
      ? { title: 'Your VFIT check-in is due', body: 'Share this week’s training, nutrition, recovery and support needs.' }
      : kind === 'hydration'
        ? { title: 'VFIT hydration reminder', body: 'Open VFIT and update today’s water intake.' }
        : { title: 'Your VFIT plan is ready', body: 'Open VFIT for today’s shift-aware training and nutrition plan.' };
    await sendToUser(doc.id, copy.title, copy.body, VFIT_APP_URL.value(), kind);
    const future = (Array.isArray(prefs.reminderSchedule) ? prefs.reminderSchedule : [])
      .filter(item => item && new Date(item.at).getTime() > now.toMillis() + 60000)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const next = future[0] || null;
    await doc.ref.set({ pushPreferences: Object.assign({}, prefs, {
      lastReminderAt: now,
      nextReminderAt: next ? Timestamp.fromDate(new Date(next.at)) : Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000),
      nextReminderKind: next ? next.kind : kind,
      reminderSchedule: future
    }) }, { merge: true });
  }));
});

exports.deleteMyAccount = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY], enforceAppCheck: true }, async request => {
  const uid = requireAuth(request);
  if (cleanText(request.data && request.data.confirmation, 20) !== 'DELETE') {
    throw new HttpsError('invalid-argument', 'Explicit confirmation is required.');
  }
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const customerId = userSnap.get('membership.stripeCustomerId');
  if (customerId) {
    try {
      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
      await stripe.customers.del(customerId);
    } catch (error) {
      if (error && error.code !== 'resource_missing') {
        throw new HttpsError('internal', 'The paid membership could not be cancelled, so the account was not deleted.');
      }
    }
  }
  const [asCoach, asMember, linkedMembers] = await Promise.all([
    db.collection('notes').where('coachUid', '==', uid).get(),
    db.collection('notes').where('memberUid', '==', uid).get(),
    db.collection('users').where('coachUid', '==', uid).get()
  ]);
  const noteDeletes = new Map();
  asCoach.docs.concat(asMember.docs).forEach(doc => noteDeletes.set(doc.ref.path, doc.ref));
  await Promise.all([
    ...[...noteDeletes.values()].map(ref => ref.delete()),
    ...linkedMembers.docs.map(doc => doc.ref.set({ coachUid: null, coachName: null }, { merge: true }))
  ]);
  await db.recursiveDelete(userRef);
  await db.collection('directory').doc(uid).delete();
  await getAuth().deleteUser(uid);
  return { deleted: true };
});
