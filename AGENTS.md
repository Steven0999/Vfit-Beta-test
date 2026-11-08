# Saved data is a product requirement

Updates must preserve each account's saved information, history, settings,
workout plans, recipes, notes and pictures. Changing application code is not
permission to reset or replace a person's saved data.

- Keep the production Android application ID, WebView origin, account storage
  keys and progress-photo database identity stable across releases.
- Android update APKs must use the certificate in
  `android/vfit-update-certificate.sha256`. Do not replace that pin or generate
  another signing key to bypass a missing-key failure. Unconfigured debug
  builds deliberately install as VFIT Test alongside the production app.
- Keep pre-update account copies intact before normalising older saves. Stop
  writes when a save cannot be protected or requires a newer app version.
- Never clear personal localStorage, IndexedDB or photos during startup,
  service-worker activation, a version change or failed cloud reconciliation.
- Refresh the code-cache version or revision when app scripts change. Only
  replace app-code caches; keep personal storage identities unchanged.
- Reconcile an existing cloud account before uploading a full device snapshot.
  A failed read is not evidence of an empty account. Respect saved privacy
  preferences after reconciliation.
- Do not cap or truncate complete device histories. Cloud size limits must not
  alter the complete device save or a complete user-requested backup.
- Keep the existing cloud copy when a full snapshot is too large to sync.
- Automatic backups need a folder chosen by the account owner. Verify each
  new copy before rotating app-created copies. Keep manual exports separate.
- Data deletion and picture replacement require the existing explicit user
  action. Account deletion must also remove that account's recovery copies.
- Validate storage changes with the update-safety and photo-storage cases in
  the existing tests, including storage failures and separate accounts.

Do not claim that uninstalling, clearing device storage or losing a signing key
is a data-preserving update. Never recommend uninstalling as an update fix
without a verified user-owned backup that includes their photos.
