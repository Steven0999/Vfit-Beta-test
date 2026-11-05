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
parser.add_argument('--mode', required=True, choices=['update', 'test-only'])
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
build_tools = args.sdk / 'build-tools' / '36.0.0'
badging = subprocess.check_output([str(build_tools / 'aapt'), 'dump', 'badging', str(args.apk)], text=True)
package = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
assert package, 'APK identity could not be read'
app_id, version_code, version_name = package.groups()
expected_version = re.search(r"VFIT_APP_VERSION = '([^']+)'", (root / 'core/state.js').read_text()).group(1)
expected_id = 'com.vaughanfitness.vfit' + ('.test' if args.mode == 'test-only' else '')
assert app_id == expected_id, 'Wrong application ID: update refused'
assert version_name == expected_version + ('-test' if args.mode == 'test-only' else ''), 'Wrong app version'
signed = subprocess.check_output([str(build_tools / 'apksigner'), 'verify', '--verbose', '--print-certs', str(args.apk)], text=True)
certificates = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})', signed)
assert len(certificates) == 1, 'Expected exactly one APK signing certificate'
if args.mode == 'update':
    expected_certificate = (root / 'android/vfit-update-certificate.sha256').read_text().strip()
    assert certificates[0] == expected_certificate, 'Signing key changed: update refused to protect installed data'
with zipfile.ZipFile(args.apk) as archive:
    assets = [name for name in archive.namelist() if name.startswith('assets/') and not name.endswith('/')]
    for name in assets:
        source = root / name.removeprefix('assets/')
        assert source.is_file() and archive.read(name) == source.read_bytes(), 'Untested packaged asset: ' + name
print(f'Verified {args.mode} APK: {app_id}, {version_name}, {len(assets)} source files')
print('APK SHA-256:', hashlib.sha256(args.apk.read_bytes()).hexdigest())
