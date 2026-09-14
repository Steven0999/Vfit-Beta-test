# VFIT Beta

VFIT is a mobile-first, shift-aware workout and nutrition PWA with coaching, offline storage and Firebase account sync. Version `2.1.0-beta.9` expands progress-photo capacity, adds seven-day meal and coach planning, strengthens recipe safety, and splits the application into focused JavaScript files that still run as one connected app.

## What is included

- Daily readiness scoring from sleep, energy, fatigue, soreness and stress, with safe train/adjust/recover guidance.
- A one-question-at-a-time “How are you feeling?” AI Coach conversation with quick replies, optional notes, follow-up questions, shift-specific advice and a conditional deload-week offer for severe fatigue.
- First-session dietary questions covering requirements, exact food notes, vegan, vegetarian, ketogenic, intermittent-fasting and calorie-deficit choices; answers are saved to the member plan and can be edited in their own Coaching Hub section.
- Personalised shift-meal focus and compatible recipe filtering, with five choices for every breakfast, lunch, dinner and snack under each specific diet.
- One Coaching Hub inside Settings for AI insights, the connected human coach, readiness, weekly check-ins, progression, rota and reports.
- Goal-specific muscle building: 12–16 weekly working sets per muscle for full-body development, or 12–20 for selected priority areas.
- A workout timer based on the saved session start time, so elapsed duration includes time while the screen is locked, the app is backgrounded or the phone is switched off.
- Weekly client check-ins with adherence, wins, challenges and automatic coach-review flags.
- Shift rota overrides that feed readiness and notification timing.
- Smart load progression using recent reps, RIR, estimated 1RM, plateaus and low-readiness deloads.
- Downloadable weekly member and coach reports covering training, nutrition, steps, habits, weight and readiness.
- Firebase Cloud Messaging registration for Android/web push and shift-aware reminder schedules.
- Stripe Checkout, Billing Portal and signed-webhook membership updates for Basic, Platinum and 1-to-1 Coaching plans.
- Email verification, consent records, cloud-sync choice, full data export and confirmed account deletion.
- Firebase App Check support, UID-provisioned administrators, server-owned memberships and owner-only device tokens.
- A larger shift-meal recipe popup that shows every compatible choice together, estimated nutrition, ingredients, preparation steps and an add-to-diary action.
- The original rear-camera food barcode scanner and manual barcode lookup through Open Food Facts, embedded inside Create Meal so scan results stay in the Meal Planner.
- A seven-day meal planner that follows each rota day, supports recipe swaps, serving counts and completion ticks, and builds one combined shopping list.
- The same barcode scanner embedded directly in the planner’s Shopping List tab, where the product name and complete barcode return after lookup.
- Structured safety records for all 124 built-in recipes, with saved-exclusion conflicts, substitutions, cross-contamination guidance and halal/kosher verification reminders.
- Shared seven-day coach plans containing training and four meals per day; members can accept, complete or request changes to them.
- In-app bug/improvement reports with an optional compressed screenshot and privacy-safe app/device diagnostics, plus an owner-only feedback inbox.
- An expanded device-only progress-photo gallery backed by IndexedDB instead of the small `localStorage` quota, including automatic migration, visible storage use and photo-inclusive export/restore.

Push, payments and App Check are deliberately disabled in `vfit-config.js` until their Firebase and Stripe values are configured. Server-side deletion code is included but is available in the app only after Functions is deployed and App Check is active. Existing beta features remain available while setup is pending.

The conversational coach uses structured logic on the device and the member’s existing VFIT logs. It does not call a third-party generative-AI service or diagnose health conditions. When cloud health-data sync is enabled, its saved check-ins follow the same account and approved-coach access controls as other VFIT data.

## Project layout

- `index.html` — document skeleton, screens, forms and modal markup.
- `Styles.css` — all VFIT-specific visual styles.
- `core/state.js` — configuration, sign-in helpers, shared state, settings and common utilities.
- `training/training.js` — exercise catalogue, workouts, volume and progression.
- `nutrition/meal-planner.js` — nutrition diary, shift meals and recipe details.
- `nutrition/scanner.js` — camera/photo/manual barcode scanning and Open Food Facts lookup.
- `nutrition/meal-safety.js` — structured built-in recipe safety records.
- `nutrition/weekly-planner.js` — seven-day rota planner and embedded shopping scanner.
- `ui/navigation.js` — logs, metrics, charts, comparisons and UI flows.
- `metrics/photo-storage.js` — durable IndexedDB photo gallery, migration and backups.
- `coaching/coaching.js` — readiness, shift rota, check-ins and AI Coach flows.
- `coaching/plan-builder.js` — shared human-coach seven-day plans.
- `firebase/firebase-sync.js` — memberships, privacy, notifications and account actions.
- `feedback/beta-feedback.js` — beta reporting, owner inbox and readiness checks.
- `App.js` — the small startup entry point with the final auth observer and app wiring, loaded last.
- `vfit-config.js` — public runtime feature configuration.
- `sw.js` — offline shell and runtime caching.

`index.html` loads the stylesheet in its head and the JavaScript files in dependency order at the end of its body. They are classic scripts, so existing inline controls and shared state continue to work while each responsibility remains easy to inspect.

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
node tests/photo-storage.cjs
find core training nutrition ui metrics coaching firebase feedback -name '*.js' -print0 | xargs -0 -n1 node --check
node --check sw.js
node --check functions/index.js
git diff --check
```

The checks cover module order/compilation, unique IDs/functions, inline handlers, pinned browser libraries, PWA assets, network-only private APIs, account-isolated local data, cloud/device reconciliation, all 124 safety records, seven-day planning, embedded scanner placement, durable photo references, coaching calculations and security-rule guardrails.

## Firebase setup

The app uses project `vfit-app-pro`. Confirm the selected project before deploying:

```bash
firebase use vfit-app-pro
npm --prefix functions install
firebase deploy --only firestore:rules
```

Deploying Cloud Functions and the scheduled reminder job requires a Firebase project with billing enabled.

`firestore.rules` is deny-by-default. It prevents browser clients from granting themselves paid membership, isolates push tokens under `users/{uid}/devices`, limits self-updates to approved profile/sync fields, keeps feedback owner-scoped, and restricts coach plans to the linked coach/member pair. Members may change only plan status, their request message and day-completion flags.

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

Membership state is written only by Cloud Functions. Account deletion cancels/deletes the Stripe customer before deleting Firebase data, so a billing failure stops deletion rather than leaving an unseen subscription active. It also deletes related notes, coach plans and the account’s beta feedback; the browser removes that account’s local progress-photo records only after the server confirms deletion.

## Progress-photo storage and backups

Progress photos remain private to the device and are not added to the Firestore health snapshot. Beta.9 automatically migrates older inline photos into IndexedDB, leaving the old image untouched if any migration write fails. Closing VFIT, restarting Android or signing out does not remove the gallery.

There is no fixed VFIT photo-count cap; the practical limit is the storage quota available to the installed site on the device. The photo modal displays the saved count and current storage use and asks the browser for persistent storage. Android/browser settings can still erase site data, and uninstalling the PWA may erase it too. Export a VFIT backup regularly: beta.9 backups include the gallery and restore it alongside the normal state, so the JSON file is sensitive and should be kept private.

## Android beta checklist

- Register, verify the email, sign out and sign back in; confirm accounts remain isolated.
- Add rota days, log high and low readiness entries, and confirm the recommendation changes.
- Open Settings → Coaching Hub with no check-in for today; confirm the AI Coach asks one question at a time and changes its advice for night, early, day and off-day rota entries.
- Choose full-body muscle gain and confirm the weekly target is 12–16 sets per muscle; choose specific areas and confirm only those priorities use the 12–20 range.
- Start a workout, lock or switch off the phone for several minutes, reopen VFIT and confirm the session timer includes the time away.
- Select heavy fatigue in the AI Coach check-in; confirm it asks whether to start a seven-day deload and applies the easier-week guidance only after Yes is selected.
- Complete the AI Coach check-in, ask a follow-up, close and reopen the hub, and confirm the result is saved with Today’s Readiness.
- Complete a weekly check-in; confirm the linked coach sees its flags and can reply in Notes.
- Complete workouts with weights, reps and RIR; confirm Smart Progression appears in the Coaching Hub and workout fields.
- Download both the member report and a report from the coach client view.
- Enable notifications, background Chrome, and verify a test message and scheduled reminder arrive.
- Complete Stripe test checkout, open Billing Portal, cancel, and confirm webhook membership state changes.
- Install from Chrome, test offline reopening, then export and restore a backup.
- Open the original barcode scanner, scan a known product, and confirm its number appears in the manual field and is looked up; also test manual entry.
- Save front/side/back photos on several dates, fully close and reopen the PWA, sign out/in, and confirm all photos and comparisons still load. Confirm the storage meter increases and an exported backup restores the photos on a disposable account/device.
- Open the seven-day planner from Shift Plan & Advice, swap meals, change servings and tick completions. Confirm rota changes alter that day’s shift focus and saved dietary exclusions alter its recipe choices.
- Open the planner’s Shopping List, scan a product without leaving that tab, and confirm the product name plus full barcode are added there. Tick items and clear only the purchased ones.
- As a coach, publish a seven-day training/meal plan; as the linked member, accept it, open meal instructions, complete a day and request a change.
- Send bug and improvement feedback with/without screenshots; confirm diagnostics contain no workout, meal, health-answer or progress-photo content and the owner inbox can update status.
- Test a recipe conflict for every saved exclusion and check substitution/cross-contamination copy. Verify halal/kosher products independently.
- Type `DELETE` in a disposable account and confirm Auth, Firestore, device registrations, notes, coach plans, feedback, local photos and any Stripe test customer are removed.
