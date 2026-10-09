# Angular compilation is platform independent; build natively even for AMD64 ECS.
FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund \
    && npm ci --include=prod --include=dev --include=optional --include=peer --no-audit --no-fund
COPY angular.json tsconfig*.json ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
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
