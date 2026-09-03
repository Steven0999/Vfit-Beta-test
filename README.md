# VFIT Beta

VFIT is a mobile-first workout, nutrition, habits, and progress tracker. The app remains a static site, with its existing features kept in `index.html` and additional offline/security files alongside it.

## Run locally

Serve the folder over HTTP so the service worker and camera checks behave like a deployed site:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Camera access on an Android phone requires an HTTPS deployment, such as GitHub Pages.

## Validation

```bash
node tests/static-audit.cjs
node tests/state-smoke.cjs
node --check sw.js
git diff --check
```

The checks cover JavaScript compilation, duplicate IDs/functions, inline-handler targets, pinned browser dependencies, install assets, private network cache exclusions, per-account device storage, backup sanitization, cloud/device merging, and local-only progress photos.

## Publish Firestore rules

`firestore.rules` is deny-by-default and protects account, coach/client, directory, assigned-workout, and notes data. The file does not take effect until it is published to the Firebase project used by the app (`vfit-app-pro`).

Before deployment, use the Firebase Console or Admin SDK to create
`admins/{OWNER_UID}` with the field `active: true`, replacing `OWNER_UID` with
the Firebase Authentication UID for the app owner. Do not create this record
from the browser app. Then select the correct Firebase project:

```bash
firebase use vfit-app-pro
firebase deploy --only firestore:rules
```

The Firebase Console can also publish the same file. Do this before treating the coach/member access controls as enforced on the server.

## Android beta checklist

- Register, sign out, and sign back in; confirm each account sees only its own device data.
- Start a workout, background Chrome briefly, return, and confirm the workout is restored without counting background time.
- Scan a barcode with the rear camera, then test the manual barcode fallback.
- Install from Chrome's menu and reopen from the home screen.
- Load once online, switch offline, reopen the app, and confirm saved workouts and foods remain available.
- Export a backup, add a test entry, restore the backup, and confirm both histories remain.
- Verify a member must approve a coach before that coach can read the member's data.
