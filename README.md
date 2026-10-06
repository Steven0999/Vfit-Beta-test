# VFIT Beta

VFIT is a mobile-first, shift-aware workout and nutrition app with coaching, offline storage and Firebase account sync. Version `2.1.0-beta.46` places the date-specific diary wake-time control in Nutrition → Shift. Meal windows still follow that wake time and can cross midnight for late and night shifts. Food copying preserves the original logged amount, serving size and saved per-100g values. Sports cardio logs include intensity, duration, estimated active calories and TDEE integration. Basic (£4.99/month), Platinum (£18.99/month), 1-to-1 Coaching (£97.99/month), and the existing payment setup remain available.


## What is included

- VFIT-owned UK food records with calories, protein, carbohydrates and fat, used by default for food and ingredient searches without a live food API.
- A searchable, paginated Food Database combining the included catalogue, owner-managed shared foods and the signed-in account’s saved barcode foods. Optional Online UK products search and the original camera scanner remain available.
- Daily carbohydrate and fat totals, accurate gram/millilitre portions, raw/cooked food distinctions, and a downloadable database export.
- Daily readiness scoring from sleep, energy, fatigue, soreness and stress, with safe train/adjust/recover guidance.
- Optional daily “How are you feeling?” questions controlled from Profile → Preferences & Goals → Tracking Options.
- A consistent VFIT wordmark and home-screen icon with a full-size V and one-third-size, baseline-aligned FIT in the existing orange branding.
- Android Health Connect read-only step access, local-midnight daily totals, resume/background refresh and a permission-based web motion fallback that clearly counts only while VFIT is open.
- Training Logs Step Progress chart with daily step bars, a per-day goal line, weekly saved-day totals and their combined goals.
- Cardio choices for treadmill, normal outdoor running, football/soccer, basketball, tennis, badminton, volleyball and boxing. Sports let the member select easy, moderate or hard effort and time played. Activity values come from the [2024 Adult Compendium of Physical Activities](https://pacompendium.com/sports/); extra calories are estimated with `(MET − 1) × body weight (kg) × duration (hours)` and contribute to logged TDEE. Outdoor running links to Google Maps for route planning, the latest GPS position and up to three distance-based reference points along the recorded route; saved runs also offer a Maps link. Opening a link sends selected points to Google. The Android run notification keeps precise GPS tracking active with the screen locked; the workout log saves distance, time, average speed and the measured GPS route with GPX export. Browser runs need the page kept open.
- Diary food copies retain the source date, logged amount, serving size and saved per-100g nutrition; entries with the same name but different amounts remain individually selectable. Nutrition → Shift holds the diary date and its wake-time control, even before setting up Shift Worker Mode. On a standard day the resulting breakfast, lunch and dinner windows end at 11:00, 17:00 and 23:00; late and night shifts move the windows across midnight and saved meal times appear in order. Historical entries without packet data can only reconstruct nutrition from their saved totals.
- Training years in About You tailor the Training and Training Basics screens. Members with 0–2 years (or no years set) can start a four-movement full-body session with two sets per exercise, log reps and weight, and keep cardio and workout history. Above 2 years, splits and weekly volume appear; at 4+ years specialist muscle focus and smart progression are also available. The home starter session uses no equipment and prefills 0 kg so bodyweight sets can be logged.
- A dedicated “Add Your Own Food” section for saving a food name, calories, protein and compressed phone photo to the VFIT Food Database.
- “Add Your Own Food” in Search (and the database view), with the Diary shortcut removed. Enter the food name, total calories and protein for the amount eaten, choose a meal, and add it directly to the private diary. Carbs, fat and food weight are optional. Logging works offline without database editor access; shared food database editing keeps its existing owner/editor protection.
- Estimated TDEE in Diary and Personal Details uses Mifflin-St Jeor BMR plus recent logged walking and exercise, with an RIR adjustment for lifting. When activity logs are unavailable, About You activity level provides a fallback. Logged running and walking distance is deducted from overlapping step distance. A goal at least 1,000 kcal below estimated maintenance starts an eight-week planned-deficit counter, then a seven-day maintenance goal and temporary lock. The target stays at maintenance after the week until the member chooses another goal. The estimated BMR is the app's minimum target, but neither BMR nor TDEE is a personalised safety threshold.
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
- A Payments & Billing screen in Profile and Coaching Hub, with Stripe Checkout, Billing Portal, verified monthly prices and signed-webhook membership updates for Basic, Platinum and 1-to-1 Coaching plans. Payments remain disabled until the owner finishes the Stripe and Firebase setup below.
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
- `nutrition/food-catalog.js` — owned food storage, local search, catalogue import and export.
- `nutrition/data/uk-foods-2021.json` — the bundled UK food database and source/license metadata.
- `nutrition/scanner.js` — camera/photo/manual barcode scanning and Open Food Facts lookup.
- `nutrition/meal-safety.js` — structured built-in recipe safety records.
- `nutrition/weekly-planner.js` — seven-day rota planner and embedded shopping scanner.
- `ui/navigation.js` — logs, metrics, charts, comparisons and UI flows.
- `metrics/photo-storage.js` — durable IndexedDB photo gallery, migration and backups.
- `metrics/step-tracking.js` — Health Connect bridge handling, daily step totals and the visible-web motion fallback.
- `coaching/coaching.js` — readiness, shift rota, check-ins and AI Coach flows.
- `coaching/plan-builder.js` — shared human-coach seven-day plans.
- `firebase/firebase-sync.js` — memberships, privacy, notifications and account actions.
- `feedback/beta-feedback.js` — beta reporting, owner inbox and readiness checks.
- `App.js` — the small startup entry point with the final auth observer and app wiring, loaded last.
- `vfit-config.js` — public runtime feature configuration.
- `sw.js` — offline shell and runtime caching.
- `android/` — Android 16 wrapper, Health Connect permission flow, background step sync and secure WebView bridge.

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
node tests/food-catalog.cjs
find core training nutrition ui metrics coaching firebase feedback -name '*.js' -print0 | xargs -0 -n1 node --check
node --check sw.js
node --check functions/index.js
git diff --check
```

The checks cover module order/compilation, unique IDs/functions, inline handlers, pinned browser libraries, PWA assets, network-only private APIs, account-isolated local data, cloud/device reconciliation, all 124 safety records, seven-day planning, embedded scanner placement, durable photo references, coaching calculations and security-rule guardrails.

## Owned food database

The catalogue ships inside the Android APK and the PWA shell. Its 2,853 records come from the official Public Health England CoFID 2021 workbook, with all four required macros present. The importer excludes 34 records without a calorie or carbohydrate value rather than inventing those values. CoFID’s duplicate code `13-669` is kept as two separate food identities; mineral rows are joined by code and name. Source trace values are treated as zero, optional missing nutrients are labelled “Not reported”, and alcoholic drinks retain their per-100ml basis. The source URL, workbook SHA-256, licence and excluded record list are in the bundled JSON.

On first use, VFIT imports this public catalogue into its own IndexedDB database in one transaction, including a version and count marker. Reopening uses those stored records. If device storage is unavailable, the bundled file still supports food search; the UI only claims “saved for offline search” after a successful database write. PWA offline use needs the initial app installation/cache; the APK includes the file. This dataset is a starting catalogue, not every food or every supermarket product worldwide. Current package labels should be used for reformulated branded foods.

Owner-managed foods continue to use the existing protected Firestore `foodDatabase` collection. Personal meal logs and previously scanned foods keep their existing account isolation and cloud-sync preferences; catalogue records are never copied into health snapshots. Existing foods are checked before an external barcode lookup. A first lookup of a new barcode or the optional online search still needs the internet. Included catalogue records remain immutable; approved editors can create their own copy of a gram-based food using its popup.

Rebuild the shipped dataset with `python3 tools/import-food-catalog.py /path/to/cofid-2021.xlsx` (requires `openpyxl`). Download the workbook from [GOV.UK](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid). Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

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

VFIT uses Stripe-hosted Checkout for monthly subscriptions; card details never pass through VFIT. Prices are Basic £4.99, Platinum £18.99 and 1-to-1 Coaching £97.99 per month. Existing beta features stay available during setup; this release does not introduce a feature paywall.

1. Complete the Stripe account's business verification, payout bank, customer support details and relevant tax settings. Create three **new active, flat-rate, licensed, GBP monthly** Prices at exactly £4.99, £18.99 and £97.99; Stripe Prices already used for the old amounts should be replaced with new Price IDs in the Functions configuration. The server refuses any different amount, currency or billing interval. Configure a [customer portal](https://docs.stripe.com/customer-management) for payment-method updates, invoices and cancellation. If plan switching is enabled in the portal, allow only these configured products/prices and review the proration settings. In Stripe Checkout settings, enable [one subscription per customer](https://docs.stripe.com/payments/checkout/limit-subscriptions).
2. Provide a real HTTPS return page, reachable in an ordinary phone browser, and add its origin to Firebase Authentication's authorized domains. Set `VFIT_APP_URL` to that page in `functions/.env.vfit-app-pro` (copy `functions/.env.example` first). The bundled Android app opens Stripe in the phone's browser; after checkout or portal, the member can reopen VFIT and see the webhook-confirmed status. `appassets.androidplatform.net` and placeholder URLs are deliberately rejected as return pages. Do not put Stripe secrets in the APK or a public config file.
3. Use a Stripe **test-mode** secret key and test-mode Price IDs first. Store the secret with Firebase Secret Manager:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
```

4. Create a Stripe webhook destination for the **same mode** at:

```text
https://europe-west2-vfit-app-pro.cloudfunctions.net/stripeWebhook
```

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Copy that endpoint's `whsec_...` signing secret into Firebase Secret Manager and deploy:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions,firestore:rules
```

5. Set up Firebase App Check on the actual VFIT client and put the **public** reCAPTCHA Enterprise site key in `vfit-config.js`. All billing callables require valid Firebase Auth and App Check; test an APK on a phone as well as any web origin before turning payments on. An App Check key for an unrelated web origin will not make the Android asset origin work. Review the [Firebase App Check setup](https://firebase.google.com/docs/app-check) for the deployed client.
6. Test a complete test-mode checkout, repeat taps, cancelled checkout, failed payment, card update, renewal, cancellation at period end and account deletion. Confirm that Firestore `users/{uid}.membership` follows Stripe webhooks and no paid state appears merely because of the return URL. Set `paymentsEnabled: true` in `vfit-config.js` only after those checks. For live charges, replace all three Prices and both secrets with their live-mode counterparts, retest, and publish the enabled build. Test and live webhook signing secrets are different.

The price displayed in the app comes from validated Stripe Prices when payments are enabled. A pending, failed or unrecognized subscription is not treated as an active paid tier. The billing portal handles card changes, invoices and cancellation; the app does not store card numbers. Return from Stripe is only an acknowledgement: signed webhooks update membership state, and the app listens for the change. Stripe events can arrive more than once or out of order; the server retrieves current subscription state and refuses to overwrite a newer subscription with an older one.

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
