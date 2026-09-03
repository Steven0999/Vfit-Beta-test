// Public, environment-specific VFIT switches.
// These values are safe to ship to the browser. Never place Stripe secret keys,
// Firebase service-account credentials, or other private secrets in this file.
window.VFIT_CONFIG = Object.freeze({
  functionsRegion: 'europe-west2',
  appCheckSiteKey: '',
  fcmVapidKey: '',
  paymentsEnabled: false,
  pushEnabled: false,
  privacyVersion: '2026-09-03'
});
