#!/bin/sh
set -eu
body=$(wget -q -T 3 -O - http://127.0.0.1:8080/health) || exit 1
[ "$body" = '{"status":"UP"}' ]
