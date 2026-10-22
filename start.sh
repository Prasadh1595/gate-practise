#!/usr/bin/env bash
# Mac / Linux launcher. Usage: ./start.sh
cd "$(dirname "$0")/server" || exit 1
command -v node >/dev/null || { echo "Node.js not found. Install the LTS from https://nodejs.org"; exit 1; }
( sleep 2; (command -v xdg-open >/dev/null && xdg-open http://localhost:3002) || (command -v open >/dev/null && open http://localhost:3002) ) >/dev/null 2>&1 &
exec node --no-warnings index.js
