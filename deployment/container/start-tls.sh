#!/bin/sh
# Private inputs never become command arguments or diagnostics. No shell tracing.
set -eu
set +x
umask 077
fail() { printf '%s\n' 'Web TLS validation failed; startup denied' >&2; exit 1; }
schema=${LOOKAHEAD_TLS_SCHEMA-}
certificate=${LOOKAHEAD_TLS_SERVER_CERTIFICATE-}
privateKey=${LOOKAHEAD_TLS_SERVER_KEY-}
trust=${LOOKAHEAD_TLS_TRUST-}
serverName=${LOOKAHEAD_TLS_SERVER_NAME-}
unset LOOKAHEAD_TLS_SCHEMA LOOKAHEAD_TLS_SERVER_CERTIFICATE LOOKAHEAD_TLS_SERVER_KEY LOOKAHEAD_TLS_TRUST LOOKAHEAD_TLS_SERVER_NAME
# The sole writable credential mount is owned by the image's UID 10001.
credentialDirectory=/run/credentials
[ "$#" -eq 0 ] || fail
[ "$schema" = lookahead-tls/v1 ] || fail
case "$serverName" in web-blue.lookahead-dev.internal|web-green.lookahead-dev.internal) ;; *) fail ;; esac
for value in "$certificate" "$privateKey" "$trust"; do
    [ -n "$value" ] && [ "${#value}" -le 65536 ] || fail
done
[ -d "$credentialDirectory" ] && [ ! -L "$credentialDirectory" ] || fail
[ -z "$(ls -A "$credentialDirectory")" ] || fail
chmod 700 "$credentialDirectory" || fail
stage=$(mktemp -d "$credentialDirectory/.validate.XXXXXXXX") || fail
trap 'rm -rf "$stage"' EXIT HUP INT TERM
# Temporary files are protected before writing; they are published only after validation.
printf '%s\n' "$certificate" > "$stage/server.crt"
printf '%s\n' "$privateKey" > "$stage/server.key"
printf '%s\n' "$trust" > "$stage/trust.pem"
unset certificate privateKey trust value
validate() {
    cd "$stage" || return 1
    # Require a PKCS8 PEM header before OpenSSL performs key parsing and matching.
    head -n 1 server.key | tr -d '\r' | grep -Eq '^-{5}BEGIN PRIVATE KEY-{5}$' || return 1
    # Split public chains to check every supplied certificate, including validity.
    for bundle in server trust; do
        input=server.crt
        [ "$bundle" != trust ] || input=trust.pem
        awk -v prefix="$bundle" '
            /-----BEGIN CERTIFICATE-----/ { if (inside || ++count > 8) exit 1; inside=1; file=prefix "-" count ".pem" }
            inside { print > file }
            /-----END CERTIFICATE-----/ { if (!inside) exit 1; inside=0; close(file); next }
            !inside && !/^[[:space:]]*$/ { if ($0 !~ /-----BEGIN CERTIFICATE-----/) exit 1 }
            END { if (inside || count == 0) exit 1 }
        ' "$input" || return 1
    done
    for cert in server-*.pem trust-*.pem; do
        # The full verification below checks notBefore; checkend rejects expired inputs.
        openssl x509 -in "$cert" -checkend 0 -noout || return 1
        openssl verify -no-CAfile -no-CApath -no-CAstore -partial_chain -trusted "$cert" "$cert" || return 1
    done
    openssl x509 -in server-1.pem -checkend 86400 -noout || return 1
    openssl x509 -in server-1.pem -ext basicConstraints -noout | grep -q 'CA:FALSE' || return 1
    # Exact DNS SAN only; openssl's wildcard/CN fallback is deliberately insufficient.
    openssl x509 -in server-1.pem -ext subjectAltName -noout | tr ',' '\n' | sed 's/^[[:space:]]*//' | grep -Fxq "DNS:$serverName" || return 1
    openssl x509 -in server-1.pem -ext extendedKeyUsage -noout | grep -q 'TLS Web Server Authentication' || return 1
    for root in trust-*.pem; do
        openssl x509 -in "$root" -ext basicConstraints -noout | grep -q 'CA:TRUE' || return 1
        subject=$(openssl x509 -in "$root" -subject -noout -nameopt RFC2253) || return 1
        issuer=$(openssl x509 -in "$root" -issuer -noout -nameopt RFC2253) || return 1
        [ "${subject#subject=}" = "${issuer#issuer=}" ] || return 1
        openssl verify -no-CAfile -no-CApath -no-CAstore -trusted "$root" -check_ss_sig "$root" || return 1
    done
    openssl verify -no-CApath -no-CAstore -CAfile trust.pem -untrusted server.crt -purpose sslserver -verify_hostname "$serverName" server-1.pem || return 1
    openssl x509 -in server-1.pem -pubkey -noout > certificate-public.pem || return 1
    openssl pkey -in server.key -pubout > key-public.pem || return 1
    cmp -s certificate-public.pem key-public.pem || return 1
}
if ! (validate) >/dev/null 2>&1; then fail; fi
chmod 400 "$stage/server.crt" "$stage/server.key" "$stage/trust.pem" || fail
for file in server.crt server.key trust.pem; do mv "$stage/$file" "$credentialDirectory/$file" || fail; done
rm -rf "$stage"
trap - EXIT HUP INT TERM
printf '%s\n' 'Web TLS validation succeeded'
exec nginx -c /etc/nginx/nginx-lower-cost-dev.conf -g 'daemon off;'
