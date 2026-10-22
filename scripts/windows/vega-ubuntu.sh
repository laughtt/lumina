#!/usr/bin/env bash
set -euo pipefail
SDK_VERSION="${VEGA_SDK_VERSION:-0.24.12112}"
API_URL="${LUMINA_TV_API:-http://10.0.2.2:8787}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "Checking this machine"
[ "$(uname -m)" = "x86_64" ] || { echo "The Vega Virtual Device on Linux needs an x86_64 CPU (found $(uname -m))."; exit 1; }
if [ ! -e /dev/kvm ]; then
  echo "No /dev/kvm. The Virtual Device needs hardware virtualization."
  echo "  WSL2: add 'nestedVirtualization=true' under [wsl2] in %USERPROFILE%\\.wslconfig, run 'wsl --shutdown', reopen."
  echo "  Native Ubuntu: turn on Intel VT-x / AMD-V in the BIOS, then: sudo apt install -y qemu-kvm"
  exit 1
fi
echo "x86_64 and /dev/kvm: OK"
if curl -sf "${API_URL/10.0.2.2/localhost}/api/health" >/dev/null; then echo "Lumina API reachable: OK"; else
  echo "Lumina API not reachable on localhost:8787. Start it first (Windows: scripts\\windows\\boot.ps1, Linux: docker compose up -d)."; fi
[ "${1:-}" = "--check" ] && exit 0

say "Installing Ubuntu packages (needs sudo once)"
sudo apt-get update -y
sudo apt-get install -y curl git jq unzip rsync lz4 watchman software-properties-common qemu-kvm \
  libgl1 libnss3 libxcomposite1 libxcursor1 libxi6 libxtst6 libxkbfile1 libpulse0 libasound2t64 2>/dev/null \
  || sudo apt-get install -y curl git jq unzip rsync lz4 watchman software-properties-common qemu-kvm \
       libgl1 libnss3 libxcomposite1 libxcursor1 libxi6 libxtst6 libxkbfile1 libpulse0 libasound2
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt-get update -y
sudo apt-get install -y libpython3.8-dev
sudo usermod -aG kvm "$USER" || true
sudo chmod 666 /dev/kvm

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  say "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if [ ! -x "$HOME/vega/bin/vega" ]; then
  say "Installing the Vega SDK $SDK_VERSION"
  tmp="$(mktemp -d)"
  curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh -o "$tmp/get_vvm.sh"
  NONINTERACTIVE=true VEGA_SDK_VERSION="$SDK_VERSION" FORCE_ASCII=true bash "$tmp/get_vvm.sh"
fi
source "$HOME/vega/env"
vega --version

say "Starting the Vega Virtual Device"
GUI=$([ -n "${VEGA_HEADLESS:-}" ] && echo --no-gui || echo --gui)
vega virtual-device status 2>/dev/null | grep -q '"running":true' || vega virtual-device start "$GUI" --timeout 600

say "Building Lumina's TV app for Vega"
TV="$REPO/tv"
if [[ "$REPO" == /mnt/* ]]; then
  mkdir -p "$HOME/lumina-tv"
  rsync -a --delete --exclude node_modules --exclude build "$REPO/tv/shared" "$REPO/tv/vega" "$HOME/lumina-tv/" 2>/dev/null \
    || { sudo apt-get install -y rsync && rsync -a --delete --exclude node_modules --exclude build "$REPO/tv/shared" "$REPO/tv/vega" "$HOME/lumina-tv/"; }
  TV="$HOME/lumina-tv"
fi
cd "$TV/vega"
printf "// Written by scripts/windows/vega-ubuntu.sh: the Lumina API as the TV sees it.\nexport const API_URL = '%s';\nexport const TOKEN = '%s';\n" "$API_URL" "${LUMINA_TV_TOKEN:-}" > src/config.ts
npm install --no-audit --no-fund --workspaces=false
npm run build:release

say "Installing and launching Lumina on the Virtual Device"
vega run-app build/x86_64-release/vega-tv_x86_64.vpkg com.lumina.tv.main -d VirtualDevice
echo
echo "Lumina is on the Vega Virtual Device. Talk to Rosa's speaker in the Studio: http://localhost:8787"
echo "If the TV stays on 'Lumina' (no data), the emulator can't reach $API_URL. Rerun with your LAN IP:"
echo "  LUMINA_TV_API=http://<your-ip>:8787 bash scripts/windows/vega-ubuntu.sh"
