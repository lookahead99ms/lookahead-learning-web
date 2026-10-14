#!/bin/sh
set -eu
port=8080
if [ "${LOOKAHEAD_RUNTIME_MODE:-}" = lower-cost-dev ]; then port=8081; fi
body=$(wget -q -T 3 -O - "http://127.0.0.1:$port/health") || exit 1
[ "$body" = '{"status":"UP"}' ]
