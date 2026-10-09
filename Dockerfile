# Exact toolchain, compiler and serving images are scanned independently.
FROM alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0 AS toolchain
RUN apk add --no-cache nodejs=24.18.1-r0
COPY scripts/container/prepare-npm-cli.mjs /opt/lookahead/prepare-npm-cli.mjs
COPY deployment/container/npm-cli-lock.json /opt/npm/package-lock.json
# Bootstrap stays inside this RUN; only the genuinely patched locked CLI persists.
RUN wget -q https://registry.npmjs.org/npm/-/npm-11.17.0.tgz -O /tmp/npm.tgz \
    && echo "b290bbb35b9e72c3ef84edbe041f28c4479c4d9ee79f555817b8caafe7ce4bba  /tmp/npm.tgz" | sha256sum -c - \
    && mkdir -p /tmp/bootstrap /build \
    && tar -xzf /tmp/npm.tgz --strip-components=1 -C /tmp/bootstrap \
    && tar -xzf /tmp/npm.tgz --strip-components=1 --exclude='package/node_modules/*' -C /opt/npm \
    && node /opt/lookahead/prepare-npm-cli.mjs /opt/npm/package.json /opt/npm/package-lock.json \
    && node /tmp/bootstrap/bin/npm-cli.js ci --prefix /opt/npm --ignore-scripts --omit=dev --no-audit --no-fund \
    && ln -s /opt/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /opt/npm/bin/npx-cli.js /usr/local/bin/npx \
    && rm -rf /tmp/bootstrap /tmp/npm.tgz /root/.npm \
    && chown 10001:10001 /build
ENV HOME=/build
USER 10001:10001
WORKDIR /build

FROM toolchain AS build
COPY --chown=10001:10001 package.json package-lock.json ./
RUN npm ci --include=prod --include=dev --include=optional --include=peer --no-audit --no-fund
COPY --chown=10001:10001 angular.json tsconfig*.json ./
COPY --chown=10001:10001 src ./src
COPY --chown=10001:10001 scripts/build.mjs scripts/build-code-presentation.mjs ./scripts/
COPY --chown=10001:10001 scripts/container/verify-static.mjs ./scripts/container/
COPY --chown=10001:10001 public ./public
RUN npm run build:protected \
    && node scripts/container/verify-static.mjs dist/lookahead-learning-web/browser

FROM nginxinc/nginx-unprivileged:stable-alpine-slim@sha256:3af0c10d960cc2502427fe1219c52989d309e7d65596869c60a34fd2fa2406f0
COPY deployment/container/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=0555 deployment/container/healthcheck.sh /opt/lookahead/healthcheck.sh
COPY --from=build /build/dist/lookahead-learning-web/browser /usr/share/nginx/html
USER 10001:10001
WORKDIR /usr/share/nginx/html
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 CMD ["/opt/lookahead/healthcheck.sh"]
# Bypass the upstream writable configuration/envsubst entrypoint.
ENTRYPOINT ["nginx", "-g", "daemon off;"]
