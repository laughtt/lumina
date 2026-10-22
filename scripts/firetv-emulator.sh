#!/usr/bin/env bash
set -euo pipefail
export JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:/opt/homebrew/opt/node@22/bin:$PATH"
ADB="$ANDROID_HOME/platform-tools/adb"
cd "$(dirname "$0")/../tv/android"
[ -d node_modules ] || npm install --no-audit --no-fund --workspaces=false
printf "export const API_URL = '%s';\nexport const TOKEN = '%s';\n" "${LUMINA_TV_API:-http://10.0.2.2:8787}" "${LUMINA_TV_TOKEN:-}" > config.ts
if ! "$ADB" devices | grep -q emulator; then
  ("$ANDROID_HOME/emulator/emulator" -avd LuminaFireTV -no-snapshot-save -no-boot-anim >/dev/null 2>&1 &)
  "$ADB" wait-for-device
  until [ "$("$ADB" shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
fi
rm -rf android/app/build/generated/assets android/app/build/intermediates/assets
(cd android && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew -q assembleRelease -PreactNativeArchitectures=arm64-v8a)
"$ADB" install -r android/app/build/outputs/apk/release/app-release.apk >/dev/null
"$ADB" shell am start -n com.luminatv/.MainActivity >/dev/null
echo "Lumina is running in the Android TV emulator. Use the emulator's D-pad, or: adb shell input keyevent KEYCODE_DPAD_RIGHT"
