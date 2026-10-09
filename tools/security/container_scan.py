#!/usr/bin/env python3
"""App-owned, one-shot container/config security gate. No private checkout needed."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import selectors
import subprocess
import sys
import tempfile
import time
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.codex-scratch/security/container'
PINS = Path(__file__).with_name('tools.json')
LIMIT = 200 * 1024 * 1024


def target_pin():
    host = {'Linux-x86_64': 'linux-amd64', 'Darwin-arm64': 'darwin-arm64'}[platform.system() + '-' + platform.machine().lower()]
    return json.loads(PINS.read_text())['trivy']['archives'][host]


def verified_binary(archive, expected):
    if archive.stat().st_size > LIMIT or hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        raise ValueError('Scanner archive checksum/size mismatch')
    with tarfile.open(archive, 'r:gz') as package:
        entry = package.getmember('trivy')
        if not entry.isfile() or entry.size > LIMIT:
            raise ValueError('Invalid scanner archive entry')
        return package.extractfile(entry).read()


def install():
    OUT.mkdir(parents=True, exist_ok=True)
    pin = target_pin()
    with urllib.request.urlopen(pin['url'], timeout=60) as response:
        payload = response.read(LIMIT + 1)
    if len(payload) > LIMIT:
        raise ValueError('Scanner archive too large')
    archive = OUT / 'trivy.tar.gz'
    archive.write_bytes(payload)
    binary = verified_binary(archive, pin['sha256'])
    executable = OUT / 'trivy'
    executable.write_bytes(binary)
    executable.chmod(0o700)
    print('Trivy archive and executable verified')


def executable():
    binary = verified_binary(OUT / 'trivy.tar.gz', target_pin()['sha256'])
    path = OUT / 'trivy'
    if path.is_symlink() or path.read_bytes() != binary:
        raise ValueError('Scanner executable no longer matches pinned archive')
    return str(path)


def base_images(text):
    images = re.findall(r'^FROM\s+(?:--platform=\S+\s+)?(\S+)', text, re.M | re.I)
    if len(images) != 2 or not re.fullmatch(r'node:24-alpine@sha256:[a-f0-9]{64}', images[0]) or not re.fullmatch(r'nginxinc/nginx-unprivileged:stable-alpine-slim@sha256:[a-f0-9]{64}', images[1]):
        raise ValueError('Expected pinned Node builder and unprivileged NGINX runtime')
    return images


def report_gate(document, kind):
    if document.get('SchemaVersion') != 2:
        raise ValueError('Unsupported scanner report schema')
    results = document.get('Results')
    if not isinstance(results, list) or not results:
        raise ValueError('Scanner result coverage missing')
    if kind == 'image':
        metadata = document.get('Metadata', {})
        config = metadata.get('ImageConfig', {})
        if config.get('os') != 'linux' or config.get('architecture') != 'amd64':
            raise ValueError('Image report must describe Linux AMD64')
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', metadata.get('ImageID', '')):
            raise ValueError('Image configuration identity absent')
        info = metadata.get('OS', {})
        if not info.get('Family') or info.get('EOSL'):
            raise ValueError('Missing or unsupported operating system')
        if not any(r.get('Class') == 'os-pkgs' and isinstance(r.get('Packages'), list) and r['Packages']
                   and all(isinstance(p.get('Name'), str) and p['Name'] and isinstance(p.get('Version'), str) and p['Version'] for p in r['Packages']) for r in results):
            raise ValueError('OS package coverage missing')
    elif kind == 'config':
        if not any(r.get('Class') == 'config' and r.get('Target') == 'Dockerfile'
                   and sum(r.get('MisconfSummary', {}).get(k, 0) for k in ('Successes', 'Failures')) > 0 for r in results):
            raise ValueError('Dockerfile configuration coverage missing')
    else:
        raise ValueError('Unsupported report kind')
    counts = {'high': 0, 'critical': 0, 'unknown': 0, 'secrets': 0, 'lower': 0}
    for result in results:
        for field in ('Vulnerabilities', 'Misconfigurations', 'Secrets'):
            for finding in result.get(field) or []:
                if field == 'Secrets':
                    counts['secrets'] += 1
                    continue
                severity = finding.get('Severity')
                if severity not in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'):
                    raise ValueError('Missing or invalid severity')
                counts[severity.lower() if severity in ('HIGH', 'CRITICAL', 'UNKNOWN') else 'lower'] += 1
    if any(counts[key] for key in ('high', 'critical', 'unknown', 'secrets')):
        raise ValueError('Security findings require action')
    return counts


def image_identity(document, target, config_id=None):
    metadata = document.get('Metadata', {})
    if config_id is not None:
        if metadata.get('ImageID') != config_id:
            raise ValueError('Scanner image differs from exported local configuration')
    else:
        digest = target.rsplit('@', 1)[-1]
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
            raise ValueError('Remote image must have immutable digest')
        digests = metadata.get('RepoDigests')
        if not isinstance(digests, list) or not any(isinstance(value, str) and re.fullmatch(r'[^@\s]+@sha256:[a-f0-9]{64}', value) and value.rsplit('@', 1)[-1] == digest for value in digests):
            raise ValueError('Scanner image differs from requested pinned base')


ARCHIVE_LIMIT = 2 * 1024 * 1024 * 1024


def export_local_image(target, archive):
    # Stream only the selected immutable daemon image; enforce a disk bound and
    # deadline while reading, rather than after an unbounded docker save.
    with archive.open('wb') as output, subprocess.Popen(
            ['docker', 'image', 'save', target], cwd=ROOT, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL) as process:
        try:
            deadline = time.monotonic() + 120
            size = 0
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise ValueError('Local image export timed out')
                    if not selector.select(min(remaining, 1)):
                        continue
                    chunk = os.read(process.stdout.fileno(), 1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > ARCHIVE_LIMIT:
                        raise ValueError('Local image export exceeds bound')
                    output.write(chunk)
            if process.wait(timeout=max(0.01, deadline - time.monotonic())):
                raise ValueError('Local image export failed')
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)


def archive_config_id(archive):
    if not archive.is_file() or archive.is_symlink() or archive.stat().st_size > ARCHIVE_LIMIT:
        raise ValueError('Invalid or oversized image archive')
    with tarfile.open(archive, 'r:') as package:
        members = {}
        for member in package:
            path = PurePosixPath(member.name)
            if (len(members) >= 512 or not member.name or path.is_absolute() or '..' in path.parts
                    or '\\' in member.name or member.name in members
                    or not (member.isfile() or member.isdir())):
                raise ValueError('Unsafe or ambiguous archive member')
            members[member.name] = member
        def read_member(name, limit):
            member = members.get(name)
            if member is None or not member.isfile() or member.size > limit:
                raise ValueError('Required image metadata missing or oversized')
            return package.extractfile(member).read(limit + 1)
        manifests = json.loads(read_member('manifest.json', 256 * 1024))
        if not isinstance(manifests, list) or len(manifests) != 1:
            raise ValueError('Expected exactly one exported image manifest')
        config_name = manifests[0].get('Config')
        if not isinstance(config_name, str):
            raise ValueError('Exported image has no configuration')
        config_bytes = read_member(config_name, 1024 * 1024)
        config = json.loads(config_bytes)
        if config.get('os') != 'linux' or config.get('architecture') != 'amd64':
            raise ValueError('Selected local image must be Linux AMD64')
        return 'sha256:' + hashlib.sha256(config_bytes).hexdigest()


def local_config_id(target):
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', target):
        raise ValueError('Immutable local image required')
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='image-binding-', dir=OUT) as directory:
        archive = Path(directory) / 'image.tar'
        export_local_image(target, archive)
        return archive_config_id(archive)


def scan(kind, target=None, local=False):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'trivy.yaml').write_text('{}\n')
    (OUT / 'ignore').write_text('')
    report = OUT / (kind + '-' + hashlib.sha256((target or '.').encode()).hexdigest()[:12] + '.json')
    report.unlink(missing_ok=True)
    common = ['--config', str(OUT / 'trivy.yaml'), '--ignorefile', str(OUT / 'ignore'),
              '--format', 'json', '--output', str(report), '--exit-code', '0', '--timeout', '15m', '--quiet']
    config_id = local_config_id(target) if kind == 'image' and local else None
    if kind == 'image':
        args = ['image', '--image-src', 'docker' if local else 'remote', '--platform', 'linux/amd64',
                '--scanners', 'vuln', '--list-all-pkgs', *common, target]
    else:
        args = ['fs', '--scanners', 'misconfig,secret', '--skip-dirs', '.git,.codex-scratch,node_modules,dist,coverage', *common, '.']
    clean_env = {k: v for k, v in os.environ.items() if not k.startswith('TRIVY_')}
    result = subprocess.run([executable(), *args], cwd=ROOT, env=clean_env, capture_output=True, timeout=960)
    (report.with_suffix('.log')).write_bytes(result.stdout + result.stderr)
    if result.returncode:
        raise ValueError('Scanner failed; private diagnostics retained locally')
    document = json.loads(report.read_text())
    counts = report_gate(document, kind)
    if kind == 'image':
        image_identity(document, target, config_id)
    print(json.dumps({'scan': kind, 'counts': counts}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('install', 'config', 'images'))
    parser.add_argument('--image')
    args = parser.parse_args()
    if args.action == 'install':
        install()
    elif args.action == 'config':
        scan('config')
    else:
        if not args.image or not re.fullmatch(r'sha256:[a-f0-9]{64}', args.image):
            raise ValueError('Immutable local image ID from build iidfile required')
        for image in base_images((ROOT / 'Dockerfile').read_text()):
            scan('image', image)
        scan('image', args.image, local=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, tarfile.TarError, subprocess.SubprocessError, json.JSONDecodeError):
        print('Container security gate failed; no clean result is available.', file=sys.stderr)
        sys.exit(1)
