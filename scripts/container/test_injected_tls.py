"""Opt-in real Web image tests with disposable synthetic certificates, no AWS calls."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

IMAGE = os.environ.get('WEB_TLS_TEST_IMAGE')


@unittest.skipUnless(IMAGE, 'Set WEB_TLS_TEST_IMAGE to a locally built immutable image')
class WebInjectedTlsTests(unittest.TestCase):
    def setUp(self):
        self.scratch=tempfile.TemporaryDirectory();self.root=Path(self.scratch.name)
        self.addCleanup(self.scratch.cleanup)
        self.openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','5','-subj','/CN=Synthetic root','-addext','basicConstraints=critical,CA:TRUE')
        self.openssl('genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out','server.key')
        self.leaf()
        self.image=json.loads(self.docker('image','inspect',IMAGE).stdout)[0]['Id']

    def openssl(self,*arguments):
        subprocess.run(['openssl',*arguments],cwd=self.root,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

    def leaf(self, name='web-blue.lookahead-dev.internal', purpose='serverAuth', period='valid', names=None):
        self.openssl('req','-new','-key','server.key','-out','server.csr','-subj','/CN='+name)
        san=','.join('DNS:'+n for n in (names or [name]))
        (self.root/'extensions').write_text('basicConstraints=critical,CA:FALSE\nsubjectAltName='+san+'\nextendedKeyUsage='+purpose+'\n')
        if period in ('expired', 'future'):
            # `ca` supports explicit validity dates on CI's OpenSSL 3.0 too.
            (self.root/'index').write_text('')
            (self.root/'serial').write_text('01\n')
            (self.root/'ca.conf').write_text(
                '[ca]\ndefault_ca=fixture\n[fixture]\ndatabase=index\nserial=serial\n'
                'new_certs_dir=.\ncertificate=ca.pem\nprivate_key=ca.key\n'
                'default_md=sha256\npolicy=subject\n[subject]\ncommonName=supplied\n')
            start, end = ('20000101000000Z', '20010101000000Z') if period == 'expired' else ('20990101000000Z', '20990103000000Z')
            self.openssl('ca','-batch','-notext','-config','ca.conf','-in','server.csr',
                         '-out','server.pem','-extfile','extensions','-startdate',start,'-enddate',end)
        else:
            self.openssl('x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key',
                         '-CAcreateserial','-out','server.pem','-extfile','extensions',
                         '-days','1' if period == 'short' else '3')

    def docker(self,*arguments,environment=None,check=True):
        return subprocess.run(['docker',*arguments],env=environment,text=True,capture_output=True,check=check,timeout=60)

    def environment(self):
        return {**os.environ,'LOOKAHEAD_TLS_SCHEMA':'lookahead-tls/v1','LOOKAHEAD_TLS_SERVER_NAME':'web-blue.lookahead-dev.internal',
            'LOOKAHEAD_TLS_SERVER_CERTIFICATE':(self.root/'server.pem').read_text(),'LOOKAHEAD_TLS_SERVER_KEY':(self.root/'server.key').read_text(),
            'LOOKAHEAD_TLS_TRUST':(self.root/'ca.pem').read_text()}

    OWNED_MOUNT=['--tmpfs','/run/credentials:rw,noexec,nosuid,nodev,size=1m,mode=0700,uid=10001,gid=10001']
    # AWS documents a Fargate bind mount as root-owned 0755 unless the image declares the path with VOLUME.
    ROOT_OWNED_MOUNT=['--mount','type=tmpfs,destination=/run/credentials,tmpfs-mode=0755']

    def start(self,environment,mount=OWNED_MOUNT):
        args=['run','--detach','--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges',
              '--tmpfs','/tmp:rw,noexec,nosuid,size=16m',
              # The ECS task definition mounts the empty `credentials` task volume here; the image root stays read-only.
              *mount,
              '--entrypoint','/opt/lookahead/start-tls.sh']
        for name in sorted(environment):
            if name.startswith('LOOKAHEAD_TLS_'):args.extend(['--env',name])
        container=self.docker(*args,self.image,environment=environment).stdout.strip()
        self.addCleanup(lambda:self.docker('rm','--force','--volumes',container))
        return container

    def wait_for_health(self,container):
        for _ in range(100):
            result=self.docker('exec',container,'wget','-qO-','http://127.0.0.1:8081/health',check=False)
            if result.returncode==0:return result
            state=json.loads(self.docker('inspect',container).stdout)[0]['State']
            self.assertTrue(state['Running'],self.docker('logs',container).stdout)
            time.sleep(0.1)
        return result

    def test_declared_volume_initializes_credential_ownership_without_an_explicit_mount(self):
        # DLV-914: ECS copies the VOLUME path's UID-10001 ownership into the task's empty bind mount; Docker does the same
        # for the anonymous volume it creates here. The container is removed with --volumes.
        self.assertEqual(json.loads(self.docker('image','inspect',IMAGE).stdout)[0]['Config'].get('Volumes'),{'/run/credentials':{}})
        container=self.start(self.environment(),mount=[])
        self.assertEqual(json.loads(self.wait_for_health(container).stdout),{'status':'UP'})
        self.assertEqual(self.docker('exec',container,'stat','-c','%u:%g:%a','/run/credentials').stdout.strip(),'10001:10001:700')
        self.assertEqual(self.docker('exec',container,'stat','-c','%u:%g:%a','/run/credentials/server.key').stdout.strip(),'10001:10001:400')

    def test_one_leaf_listing_both_slot_sans_serves_either_slot(self):
        # User decision 2026-10-30: one lookahead-dev-web-tls version whose leaf lists both exact slot SANs is bound to both slot stacks.
        slots=['web-blue.lookahead-dev.internal','web-green.lookahead-dev.internal']
        self.leaf(names=slots)
        for server in slots:
            with self.subTest(server=server):
                environment=self.environment();environment['LOOKAHEAD_TLS_SERVER_NAME']=server
                container=self.start(environment)
                self.assertEqual(json.loads(self.wait_for_health(container).stdout),{'status':'UP'})
                self.assertIn('Web TLS validation succeeded',self.docker('logs',container).stdout)
        environment=self.environment();environment['LOOKAHEAD_TLS_SERVER_NAME']='web.lookahead-dev.internal'
        container=self.start(environment)
        self.assertEqual(self.docker('wait',container).stdout.strip(),'1')
        self.assertIn('Web TLS validation failed; startup denied',self.docker('logs',container).stdout+self.docker('logs',container).stderr)

    def test_root_owned_empty_mount_denies_startup_without_leaking_material(self):
        container=self.start(self.environment(),mount=self.ROOT_OWNED_MOUNT)
        self.assertEqual(self.docker('wait',container).stdout.strip(),'1')
        logs=self.docker('logs',container);output=logs.stdout+logs.stderr
        self.assertIn('Web TLS validation failed; startup denied',output)
        self.assertNotIn('BEGIN',output);self.assertNotIn('validation succeeded',output)

    def test_valid_unprivileged_read_only_image_starts_nginx_with_protected_files(self):
        container=self.start(self.environment())
        for _ in range(100):
            result=self.docker('exec',container,'wget','-qO-','http://127.0.0.1:8081/health',check=False)
            if result.returncode==0:break
            state=json.loads(self.docker('inspect',container).stdout)[0]['State']
            self.assertTrue(state['Running'],self.docker('logs',container).stdout)
            time.sleep(0.1)
        self.assertEqual(json.loads(result.stdout),{'status':'UP'})
        self.assertEqual(self.docker('exec',container,'stat','-c','%u:%g:%a','/run/credentials/server.key').stdout.strip(),'10001:10001:400')
        self.assertEqual(self.docker('exec',container,'stat','-c','%a','/run/credentials').stdout.strip(),'700')
        self.assertNotEqual(self.docker('exec',container,'touch','/etc/unwanted-write',check=False).returncode,0)
        logs=self.docker('logs',container).stdout
        self.assertIn('Web TLS validation succeeded',logs);self.assertNotIn('BEGIN',logs)
        # Report only boolean success; never print the process environment.
        self.assertEqual(self.docker('exec',container,'sh','-c',"if tr '\\0' '\\n' < /proc/1/environ | grep -q '^LOOKAHEAD_TLS_'; then exit 1; fi").returncode,0)

    def test_invalid_material_never_starts_nginx_or_logs_secrets(self):
        for case in ['missing','wrong-host','purpose','key','trust','short','expired','future','schema','pkcs1']:
            with self.subTest(case=case):
                self.leaf(purpose='clientAuth' if case=='purpose' else 'serverAuth',period=case if case in ['short','expired','future'] else 'valid')
                environment=self.environment()
                if case=='missing':environment.pop('LOOKAHEAD_TLS_SERVER_KEY')
                if case=='wrong-host':environment['LOOKAHEAD_TLS_SERVER_NAME']='web-green.lookahead-dev.internal'
                if case=='key':environment['LOOKAHEAD_TLS_SERVER_KEY']=(self.root/'ca.key').read_text()
                if case=='trust':environment['LOOKAHEAD_TLS_TRUST']=(self.root/'server.pem').read_text()
                if case=='schema':environment['LOOKAHEAD_TLS_SCHEMA']='invalid'
                if case=='pkcs1':
                    self.openssl('pkey','-in','server.key','-traditional','-out','traditional.key')
                    environment['LOOKAHEAD_TLS_SERVER_KEY']=(self.root/'traditional.key').read_text()
                container=self.start(environment)
                self.assertEqual(self.docker('wait',container).stdout.strip(),'1')
                logs=self.docker('logs',container);output=logs.stdout+logs.stderr
                self.assertIn('Web TLS validation failed; startup denied',output)
                self.assertNotIn('BEGIN',output);self.assertNotIn('validation succeeded',output)


if __name__ == '__main__':
    if not IMAGE:
        raise SystemExit('WEB_TLS_TEST_IMAGE must select the locally built image')
    unittest.main()
