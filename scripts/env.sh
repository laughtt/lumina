#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
terraform -chdir=infra output -raw env_file > .env.local
IP="$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo 127.0.0.1)"
TOKEN="$(grep LUMINA_TOKEN .env.local | cut -d= -f2)"
printf "// Written by scripts/env.sh: the Lumina API as the TV sees it (your computer's LAN address).\nexport const API_URL = 'http://%s:8787';\nexport const TOKEN = '%s';\n" "$IP" "$TOKEN" > tv/vega/src/config.ts
echo "Wrote .env.local and tv/vega/src/config.ts (API http://${IP}:8787)"
