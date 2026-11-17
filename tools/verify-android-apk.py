"""Verify APK update identity and the exact web assets before distributing it."""
import argparse
import hashlib
import re
import subprocess
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--apk', required=True, type=Path)
parser.add_argument('--sdk', required=True, type=Path)
parser.add_argument('--mode', required=True, choices=['update', 'test-only', 'unsigned-update'])
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
build_tools = args.sdk / 'build-tools' / '36.0.0'
badging = subprocess.check_output([str(build_tools / 'aapt'), 'dump', 'badging', str(args.apk)], text=True)
package = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
assert package, 'APK identity could not be read'
app_id, version_code, version_name = package.groups()
expected_version = re.search(r"VFIT_APP_VERSION = '([^']+)'", (root / 'core/state.js').read_text()).group(1)
expected_code = re.search(r'versionCode = (\d+)', (root / 'android/app/build.gradle.kts').read_text()).group(1)
expected_id = 'com.vaughanfitness.vfit' + ('.backuppreview' if args.mode == 'test-only' else '')
assert app_id == expected_id, 'Wrong application ID: update refused'
assert version_code == expected_code, 'Wrong Android version code'
assert version_name == expected_version + ('-test' if args.mode == 'test-only' else ''), 'Wrong app version'
if args.mode == 'test-only':
    assert "application-label:'VFIT Backup Preview'" in badging, 'Missing backup preview label'
else:
    assert "application-label:'VFIT Beta'" in badging, 'Wrong label for the original app'
apk_bytes = args.apk.read_bytes()
signature_check = subprocess.run(
    [str(build_tools / 'apksigner'), 'verify', '--verbose', '--print-certs', str(args.apk)],
    text=True, capture_output=True,
)
if args.mode == 'unsigned-update':
    assert signature_check.returncode != 0, 'Expected an unsigned APK for local signing'
else:
    signature_check.check_returncode()
    certificates = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})', signature_check.stdout)
    assert len(certificates) == 1, 'Expected exactly one APK signing certificate'
    if args.mode == 'update':
        expected_certificate = (root / 'android/vfit-update-certificate.sha256').read_text().strip()
        assert certificates[0] == expected_certificate, 'Signing key changed: update refused to protect installed data'
with zipfile.ZipFile(args.apk) as archive:
    if args.mode == 'unsigned-update':
        assert apk_bytes[archive.start_dir - 16:archive.start_dir] != b'APK Sig Block 42', 'Unsigned APK contains a signing block'
        assert not any(re.fullmatch(r'META-INF/[^/]+\.(SF|RSA|DSA|EC)', name, re.I) for name in archive.namelist()), 'Unsigned APK contains signing files'
    # Android Gradle generates these profiles while packaging a release APK.
    generated_profiles = {'assets/dexopt/baseline.prof', 'assets/dexopt/baseline.profm'}
    assets = [name for name in archive.namelist()
              if name.startswith('assets/') and not name.endswith('/') and name not in generated_profiles]
    for name in assets:
        source = root / name.removeprefix('assets/')
        assert source.is_file() and archive.read(name) == source.read_bytes(), 'Untested packaged asset: ' + name
print(f'Verified {args.mode} APK: {app_id}, {version_name} ({version_code}), {len(assets)} source files')
print('APK SHA-256:', hashlib.sha256(apk_bytes).hexdigest())
