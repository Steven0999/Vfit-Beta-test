# VFIT Beta

VFIT is a mobile-first, shift-aware workout and nutrition PWA with coaching, offline storage and Firebase account sync. Version `2.1.0-beta.1` adds a Coaching Hub without removing the existing tracker.

## What is included

- Daily readiness scoring from sleep, energy, fatigue, soreness and stress, with safe train/adjust/recover guidance.
- Weekly client check-ins with adherence, wins, challenges and automatic coach-review flags.
- Shift rota overrides that feed readiness and notification timing.
- Smart load progression using recent reps, RIR, estimated 1RM, plateaus and low-readiness deloads.
- Downloadable weekly member and coach reports covering training, nutrition, steps, habits, weight and readiness.
- Firebase Cloud Messaging registration for Android/web push and shift-aware reminder schedules.
- Stripe Checkout, Billing Portal and signed-webhook membership updates for Basic, Platinum and 1-to-1 Coaching plans.
- Email verification, consent records, cloud-sync choice, full data export and confirmed account deletion.
- Firebase App Check support, UID-provisioned administrators, server-owned memberships and owner-only device tokens.

Push, payments, App Check and server-side deletion are deliberately disabled in `vfit-config.js` until their Firebase and Stripe values are configured. Existing beta features remain available while setup is pending.

## Run locally

Serve the folder over HTTP so the service worker works:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Camera, push and App Check should be tested on the final HTTPS origin.

## Validate

```bash
node tests/static-audit.cjs
node tests/state-smoke.cjs
node --check sw.js
node --check functions/index.js
git diff --check
```

The checks cover JavaScript compilation, unique IDs/functions, inline handlers, pinned browser libraries, PWA assets, network-only private APIs, account-isolated local data, cloud/device reconciliation, new coaching calculations and security-rule guardrails.

## Firebase setup

The app uses project `vfit-app-pro`. Confirm the selected project before deploying:

```bash
firebase use vfit-app-pro
npm --prefix functions install
firebase deploy --only firestore:rules
```

Deploying Cloud Functions and the scheduled reminder job requires a Firebase project with billing enabled.

`firestore.rules` is deny-by-default. It prevents browser clients from granting themselves paid membership, isolates push tokens under `users/{uid}/devices`, and limits self-updates to approved profile/sync fields.

Provision the app owner with the Firebase Console or Admin SDK by creating `admins/{OWNER_UID}` with `active: true`. Never create admin records from the browser. Approved coach email addresses remain in `config/coachEmails`.

### App Check and push

1. In Firebase App Check, register the production web app with reCAPTCHA Enterprise and copy its public site key.
2. In Firebase Project settings → Cloud Messaging → Web Push certificates, create or copy the public VAPID key.
3. Add both public values to `vfit-config.js`, then set `pushEnabled: true`.
4. Test registration and foreground/background notifications on the production HTTPS origin.
5. After successful testing, enable App Check enforcement for the Firebase products used by VFIT.

Do not put service-account JSON, Stripe secrets or any other private credential in `vfit-config.js`.
The Firebase web configuration in `index.html` is a public client identifier; restrict its API key to the production HTTPS origins and required Firebase APIs in Google Cloud Console, then rely on Auth, App Check and Firestore Rules for data access.

## Stripe memberships

Create three recurring Stripe Prices and copy `functions/.env.example` to `functions/.env.vfit-app-pro`, filling in the Price IDs and final HTTPS app URL. Price IDs are identifiers, not secret keys.

Store the Stripe API secret with Firebase Secret Manager:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
```

Create a Stripe webhook pointing to:

```text
https://europe-west2-vfit-app-pro.cloudfunctions.net/stripeWebhook
```

Subscribe it to `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`. Copy its signing secret into Firebase Secret Manager, then deploy:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions
```

Once checkout, portal return, webhook updates and account cancellation have all been tested, set `paymentsEnabled: true` in `vfit-config.js`.

Membership state is written only by Cloud Functions. Account deletion cancels/deletes the Stripe customer before deleting Firebase data, so a billing failure stops deletion rather than leaving an unseen subscription active.

## Android beta checklist

- Register, verify the email, sign out and sign back in; confirm accounts remain isolated.
- Add rota days, log high and low readiness entries, and confirm the recommendation changes.
- Complete a weekly check-in; confirm the linked coach sees its flags and can reply in Notes.
- Complete workouts with weights, reps and RIR; confirm Smart Progression appears in the Coaching Hub and workout fields.
- Download both the member report and a report from the coach client view.
- Enable notifications, background Chrome, and verify a test message and scheduled reminder arrive.
- Complete Stripe test checkout, open Billing Portal, cancel, and confirm webhook membership state changes.
- Install from Chrome, test offline reopening, then export and restore a backup.
- Type `DELETE` in a disposable account and confirm Auth, Firestore, device registrations, notes and any Stripe test customer are removed.
