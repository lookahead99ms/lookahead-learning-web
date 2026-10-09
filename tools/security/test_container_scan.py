import hashlib
import importlib.util
import io
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('container_scan', Path(__file__).with_name('container_scan.py'))
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)


def image_report():
    return {'SchemaVersion': 2, 'Metadata': {'ImageID': 'sha256:' + 'c' * 64, 'ImageConfig': {'os': 'linux', 'architecture': 'amd64'}, 'RepoDigests': ['docker.io/library/node@sha256:' + 'a' * 64], 'OS': {'Family': 'alpine'}}, 'Results': [
        {'Class': 'os-pkgs', 'Packages': [{'Name': 'musl', 'Version': '1.2.5'}]}]}


def config_report():
    return {'SchemaVersion': 2, 'Results': [{'Class': 'config', 'Target': 'Dockerfile', 'MisconfSummary': {'Successes': 1}}]}


class ContainerGateTests(unittest.TestCase):
    def test_failure_diagnostics_do_not_publish_untrusted_error_text(self):
        for reason in scan.SAFE_FAILURE_REASONS:
            self.assertIn(reason, scan.failure_message(ValueError(reason)))
        for error in (ValueError('synthetic-private-message'), OSError('synthetic-private-message'),
                      KeyError('synthetic-private-message'), ValueError('Security findings require action synthetic-private-message')):
            self.assertNotIn('synthetic-private-message', scan.failure_message(error))
            self.assertIn('No clean result', scan.failure_message(error))

    def test_clean_reports_and_lower_findings(self):
        report = image_report()
        report['Results'][0]['Vulnerabilities'] = [{'Severity': 'MEDIUM'}]
        self.assertEqual(1, scan.report_gate(report, 'image')['lower'])
        self.assertEqual(0, scan.report_gate(config_report(), 'config')['high'])

    def test_blocks_unfixed_high_critical_unknown_and_any_secret(self):
        for field, severity in [('Vulnerabilities', 'HIGH'), ('Vulnerabilities', 'CRITICAL'),
                                ('Vulnerabilities', 'UNKNOWN'), ('Secrets', 'LOW')]:
            report = image_report()
            report['Results'][0][field] = [{'Severity': severity, 'FixedVersion': ''}]
            with self.subTest(field=field, severity=severity), self.assertRaises(ValueError):
                scan.report_gate(report, 'image')

    def test_missing_scanner_coverage_is_never_clean(self):
        for report in ({}, {'Results': []}, {'Metadata': {'OS': {'Family': 'alpine'}}, 'Results': [{'Class': 'os-pkgs', 'Packages': []}]}):
            with self.assertRaises(ValueError): scan.report_gate(report, 'image')
        report = image_report(); report['Metadata']['OS']['EOSL'] = True
        with self.assertRaises(ValueError): scan.report_gate(report, 'image')
        report = config_report(); report['Results'][0]['Target'] = 'unrelated.yaml'
        with self.assertRaises(ValueError): scan.report_gate(report, 'config')

    def test_invalid_severity_or_missing_config_evaluation_fails(self):
        report = image_report(); report['Results'][0]['Vulnerabilities'] = [{}]
        with self.assertRaises(ValueError): scan.report_gate(report, 'image')
        report = config_report(); report['Results'][0]['MisconfSummary'] = {}
        with self.assertRaises(ValueError): scan.report_gate(report, 'config')

    def test_pinned_bases_include_platform_qualified_builder(self):
        valid = 'FROM alpine:3.23@sha256:' + 'a' * 64 + ' AS toolchain\nFROM toolchain AS build\nFROM nginxinc/nginx-unprivileged:stable-alpine-slim@sha256:' + 'b' * 64
        self.assertEqual(2, len(scan.base_images(valid)))
        for invalid in (valid.replace('@sha256:' + 'a' * 64, ''), valid.splitlines()[0], valid.replace('alpine:3.23', 'alpine:latest'), valid.replace('FROM toolchain AS build', 'FROM node:latest AS build')):
            with self.assertRaises(ValueError): scan.base_images(invalid)

    def test_images_require_each_exact_stage_and_scan_all_five_targets(self):
        ids = ['sha256:' + char * 64 for char in 'abc']
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            root.joinpath('Dockerfile').write_text('FROM alpine:3.23@sha256:' + 'd' * 64 + ' AS toolchain\nFROM toolchain AS build\nFROM nginxinc/nginx-unprivileged:stable-alpine-slim@sha256:' + 'e' * 64)
            args = ['container_scan.py', 'images', '--image', ids[0], '--toolchain', ids[1], '--builder', ids[2]]
            with patch.object(scan, 'ROOT', root), patch.object(scan.sys, 'argv', args), patch.object(scan, 'scan') as run:
                scan.main()
                self.assertEqual(5, run.call_count)
                self.assertEqual(run.call_args_list[2].kwargs, {'local': True, 'stage': 'toolchainImage'})
                self.assertEqual(run.call_args_list[3].kwargs, {'local': True, 'stage': 'builderImage'})
            with patch.object(scan.sys, 'argv', args[:-2]), patch.object(scan, 'scan') as run:
                with self.assertRaises(ValueError): scan.main()
                run.assert_not_called()

    def test_stage_inventory_requires_node_npm_cli_and_target_application_packages(self):
        document = {'Results': [{'Packages': [{'Name': 'nodejs', 'Version': '24.18.1-r0'}, {'Name': 'npm', 'Version': '11.17.0', 'FilePath': 'opt/npm/package.json'}]}]}
        with self.assertRaises(ValueError): scan.stage_coverage({'Results': [{'Packages': []}]}, 'toolchainImage')
        with tempfile.TemporaryDirectory() as directory, patch.object(scan, 'ROOT', Path(directory)):
            cli_path = Path(directory, 'deployment/container'); cli_path.mkdir(parents=True)
            cli_path.joinpath('npm-cli-lock.json').write_text(scan.json.dumps({'packages': {'': {}, 'node_modules/tool': {'version': '1.0.0'}}}))
            with self.assertRaises(ValueError): scan.stage_coverage(document, 'toolchainImage')
            document['Results'][0]['Packages'].append({'Name': 'tool', 'Version': '1.0.0', 'FilePath': 'opt/npm/node_modules/tool/package.json'})
            scan.stage_coverage(document, 'toolchainImage')
            Path(directory, 'package-lock.json').write_text(scan.json.dumps({'packages': {'': {}, 'node_modules/@sample/a': {'version': '1.2.3'}, 'node_modules/mac-only': {'version': '1.0.0', 'os': ['darwin']}}}))
            with self.assertRaises(ValueError): scan.stage_coverage(document, 'builderImage')
            document['Results'][0]['Packages'].append({'Name': '@sample/a', 'Version': '1.2.3', 'FilePath': 'build/node_modules/@sample/a/package.json'})
            scan.stage_coverage(document, 'builderImage')
            document['Results'][0]['Packages'][-1]['Version'] = '1.2.4'
            with self.assertRaises(ValueError): scan.stage_coverage(document, 'builderImage')

    def test_executable_is_bound_to_hash_verified_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory); archive = output / 'trivy.tar.gz'
            with tarfile.open(archive, 'w:gz') as package:
                entry = tarfile.TarInfo('trivy'); payload = b'fixture executable'; entry.size = len(payload)
                package.addfile(entry, io.BytesIO(payload))
            pin = {'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
            (output / 'trivy').write_bytes(payload)
            with patch.object(scan, 'OUT', output), patch.object(scan, 'target_pin', return_value=pin):
                self.assertEqual(str(output / 'trivy'), scan.executable())
                (output / 'trivy').write_bytes(b'substitution')
                with self.assertRaises(ValueError): scan.executable()
                with self.assertRaises(ValueError): scan.verified_binary(archive, '0' * 64)

    def test_scan_removes_stale_result_and_disables_environment_suppressions(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(scan, 'OUT', Path(directory)), patch.object(scan, 'executable', return_value='fixture'), patch.dict(scan.os.environ, {'TRIVY_IGNORE_UNFIXED': 'true'}):
            def run(command, **kwargs):
                self.assertNotIn('TRIVY_IGNORE_UNFIXED', kwargs['env'])
                path = Path(command[command.index('--output') + 1])
                self.assertFalse(path.exists())
                path.write_text(scan.json.dumps(config_report()))
                return subprocess.CompletedProcess(command, 0, b'', b'')
            report = Path(directory) / ('config-' + hashlib.sha256(b'.').hexdigest()[:12] + '.json')
            report.write_text('{"stale":true}')
            with patch.object(scan.subprocess, 'run', side_effect=run): scan.scan('config')
            with patch.object(scan.subprocess, 'run', return_value=subprocess.CompletedProcess([], 2, b'', b'private fixture')):
                with self.assertRaises(ValueError): scan.scan('config')
                self.assertFalse(report.exists())

    def test_actual_image_target_is_immutable_and_uses_local_engine(self):
        with patch.object(scan.sys, 'argv', ['container_scan.py', 'images', '--image', 'mutable:tag']):
            with self.assertRaises(ValueError): scan.main()
        with tempfile.TemporaryDirectory() as directory, patch.object(scan, 'OUT', Path(directory)), patch.object(scan, 'executable', return_value='fixture'):
            def run(command, **kwargs):
                self.assertIn('--input', command)
                self.assertNotIn('--image-src', command)
                self.assertEqual('image.tar', Path(command[command.index('--input') + 1]).name)
                Path(command[command.index('--output') + 1]).write_text(scan.json.dumps(image_report()))
                return subprocess.CompletedProcess(command, 0, b'', b'')
            with patch.object(scan.subprocess, 'run', side_effect=run), patch.object(scan, 'export_local_image') as export, patch.object(scan, 'archive_config_id', return_value='sha256:' + 'c' * 64):
                scan.scan('image', 'sha256:' + 'a' * 64, local=True)
                self.assertEqual('sha256:' + 'a' * 64, export.call_args.args[0])

    def test_report_schema_platform_and_config_id_are_required(self):
        mutations = [('SchemaVersion', 1), ('SchemaVersion', None)]
        for key, value in mutations:
            report = image_report(); report[key] = value
            with self.assertRaises(ValueError): scan.report_gate(report, 'image')
        for key, value in [('os', 'windows'), ('architecture', 'arm64'), ('architecture', None)]:
            report = image_report(); report['Metadata']['ImageConfig'][key] = value
            with self.assertRaises(ValueError): scan.report_gate(report, 'image')
        report = image_report(); report['Metadata'].pop('ImageID')
        with self.assertRaises(ValueError): scan.report_gate(report, 'image')

    def test_substituted_remote_or_local_image_fails_even_with_clean_packages(self):
        report = image_report()
        scan.image_identity(report, 'node:24-alpine@sha256:' + 'a' * 64)
        scan.image_identity(report, 'sha256:' + 'b' * 64, 'sha256:' + 'c' * 64)
        with self.assertRaises(ValueError): scan.image_identity(report, 'node:24-alpine@sha256:' + 'b' * 64)
        with self.assertRaises(ValueError): scan.image_identity(report, 'sha256:' + 'a' * 64, 'sha256:' + 'd' * 64)
        report['Metadata'].pop('RepoDigests')
        with self.assertRaises(ValueError): scan.image_identity(report, 'node:24-alpine@sha256:' + 'a' * 64)

    def make_archive(self, path, config=None, manifest=None, extra=None):
        payload = scan.json.dumps(config or {'os':'linux', 'architecture':'amd64'}).encode()
        entries = {'manifest.json': scan.json.dumps(manifest if manifest is not None else [{'Config':'blobs/sha256/config'}]).encode(), 'blobs/sha256/config': payload}
        with tarfile.open(path, 'w') as archive:
            for name, content in entries.items():
                entry = tarfile.TarInfo(name); entry.size = len(content)
                archive.addfile(entry, io.BytesIO(content))
            if extra is not None: archive.addfile(extra)
        return 'sha256:' + hashlib.sha256(payload).hexdigest()

    def test_export_stream_is_bounded_and_selects_only_requested_image(self):
        original_popen = subprocess.Popen
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'image.tar'
            def start(command, **kwargs):
                self.assertEqual(['docker', 'image', 'save', 'sha256:' + 'a' * 64], command)
                return original_popen([scan.sys.executable, '-c', 'import sys; sys.stdout.buffer.write(b"fixture")'], **kwargs)
            with patch.object(scan.subprocess, 'Popen', side_effect=start):
                scan.export_local_image('sha256:' + 'a' * 64, archive)
                self.assertEqual(b'fixture', archive.read_bytes())
                with patch.object(scan, 'ARCHIVE_LIMIT', 3):
                    with self.assertRaises(ValueError): scan.export_local_image('sha256:' + 'a' * 64, archive)
                self.assertEqual(0, archive.stat().st_size)

    def test_export_resolves_config_distinct_from_index_and_cleans_own_archive(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(scan, 'OUT', Path(directory)):
            config_ids = []
            def export(target, archive):
                self.assertEqual('sha256:' + 'a' * 64, target)
                config_ids.append(self.make_archive(archive))
            with patch.object(scan, 'export_local_image', side_effect=export):
                actual = scan.local_config_id('sha256:' + 'a' * 64)
            self.assertEqual(config_ids[0], actual)
            self.assertNotEqual('sha256:' + 'a' * 64, actual)
            self.assertEqual([], list(Path(directory).iterdir()))
            with patch.object(scan, 'export_local_image', side_effect=ValueError('failed')):
                with self.assertRaises(ValueError): scan.local_config_id('sha256:' + 'a' * 64)
            self.assertEqual([], list(Path(directory).iterdir()))

    def test_archive_rejects_ambiguous_unsafe_linked_oversized_or_wrong_platform(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'image.tar'
            variants = [
                {'config':{'os':'linux','architecture':'arm64'}},
                {'manifest':[]}, {'manifest':[{'Config':'blobs/sha256/config'}] * 2},
                {'manifest':[{'Config':'absent'}]},
                {'extra':tarfile.TarInfo('../escape')},
            ]
            link = tarfile.TarInfo('link'); link.type = tarfile.SYMTYPE; link.linkname = 'blobs/sha256/config'
            variants.append({'extra':link})
            for variant in variants:
                self.make_archive(archive, **variant)
                with self.subTest(variant=variant), self.assertRaises(ValueError): scan.archive_config_id(archive)
            self.make_archive(archive)
            with patch.object(scan, 'ARCHIVE_LIMIT', 1):
                with self.assertRaises(ValueError): scan.archive_config_id(archive)

if __name__ == '__main__': unittest.main()
