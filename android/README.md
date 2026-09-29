# VFIT Android Health Connect build

This Android wrapper packages the existing VFIT web application inside a locked-down local WebView and exposes one origin-restricted bridge for Health Connect step totals.

## Step behaviour

- VFIT first requests read-only `READ_STEPS` access. It never writes to or deletes Health Connect records. If the access screen no longer opens after repeated denial, the step action opens Health Connect settings where access can be granted manually.
- Today is aggregated from `00:00` in the phone's current time zone to the current instant, so the displayed total automatically starts a new local day at midnight.
- Every launch and foreground resume requests a fresh total, including steps recorded while VFIT was closed.
- When the date has changed, VFIT re-reads every completed day since its last foreground history sync (up to Health Connect's recent 30-day window) before showing the Exercise Logs. Those daily totals and their original goals then remain in VFIT history.
- Where Health Connect supports it, the optional **Enable background refresh** action in Settings requests `READ_HEALTH_DATA_IN_BACKGROUND` for periodic cached updates while VFIT is closed. A fresh total is still read whenever VFIT opens without that optional permission.
- The PWA keeps its visible-app motion counter and manual entry as fallbacks. It does not claim that a browser can count while closed.

Android 14 and newer can include mobile steps in Health Connect. On older supported phones, the user needs Health Connect plus a phone/watch app that writes step records to it.

## Build

Open the `android` directory in a current Android Studio installation with Android SDK 36 and JDK 17, then build the `app` module. The Gradle build copies the current root VFIT web files into generated Android assets; do not edit a duplicate web bundle.

The branch workflow also builds a debug-signed APK and uploads it as the `vfit-beta-android-debug` workflow artifact. A Play release must use the owner's private signing key.

The current package ID is `com.vaughanfitness.vfit`. If a VFIT Play listing already exists under another package ID, change `applicationId` before the first signed release; a published package ID cannot later be changed.

## Health Connect release requirements

Before Play Store publication:

1. Declare read access for Steps and background health-data access in Play Console.
2. Publish a privacy-policy URL whose Health Connect wording matches the in-app rationale and VFIT Privacy Centre.
3. Complete the Health apps declaration and explain that steps power the daily dashboard, coaching reports and user-selected fitness tracking.
4. Test permission denial, revocation, Android 13 with the Health Connect provider, Android 14+, a local-midnight rollover and a daylight-saving transition.

Official integration guidance: <https://developer.android.com/health-and-fitness/health-connect/get-started>
