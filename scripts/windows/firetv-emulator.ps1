# Rosa's TV in the Android TV emulator on Windows. User-level installs only, no admin. Needs the API on :8787.
$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
$L = "$env:LOCALAPPDATA"
$env:JAVA_HOME = "$L\Lumina\jdk-17"; $env:ANDROID_HOME = "$L\Android\Sdk"; $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$sdk = "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
function Get-Zip($url, $dest) {
  $z = "$env:TEMP\$([IO.Path]::GetRandomFileName()).zip"; $t = "$env:TEMP\x$([IO.Path]::GetRandomFileName())"
  Invoke-WebRequest $url -OutFile $z; Expand-Archive $z $t; New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Move-Item (Get-ChildItem $t | Select-Object -First 1).FullName $dest; Remove-Item $z, $t -Recurse -Force
}
if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) { Get-Zip 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' $env:JAVA_HOME }
if (-not (Test-Path $sdk)) { Get-Zip 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' "$env:ANDROID_HOME\cmdline-tools\latest" }
if (-not (Test-Path "$env:ANDROID_HOME\system-images\android-31\android-tv\x86")) {
  1..30 | ForEach-Object { 'y' } | & $sdk --licenses | Out-Null
  & $sdk platform-tools emulator 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.1.12297006' 'cmake;3.22.1' 'system-images;android-31;android-tv;x86'
}
$avd = "$env:ANDROID_HOME\cmdline-tools\latest\bin\avdmanager.bat"
if (-not (& $avd list avd | Select-String lumina_tv)) { 'no' | & $avd create avd -n lumina_tv -d tv_1080p -k 'system-images;android-31;android-tv;x86' }
if (-not (& $adb devices | Select-String emulator)) {
  Start-Process "$env:ANDROID_HOME\emulator\emulator.exe" '-avd lumina_tv -no-snapshot-save -no-boot-anim' -WindowStyle Hidden
  & $adb wait-for-device
  while ("$(& $adb shell getprop sys.boot_completed)".Trim() -ne '1') { Start-Sleep 2 }
}
Set-Location "$PSScriptRoot\..\..\tv\android"
if (-not (Test-Path node_modules)) { npm install --no-audit --no-fund --workspaces=false }
$api = if ($env:LUMINA_TV_API) { $env:LUMINA_TV_API } else { 'http://10.0.2.2:8787' }
"export const API_URL = '$api';`nexport const TOKEN = '$env:LUMINA_TV_TOKEN';" | Set-Content config.ts -Encoding ascii
Remove-Item -Recurse -Force android\app\build\generated\assets, android\app\build\intermediates\assets -ErrorAction SilentlyContinue
Set-Location android
"sdk.dir=$($env:ANDROID_HOME.Replace([char]92,"/"))" | Set-Content local.properties -Encoding ascii
.\gradlew.bat -q assembleRelease -PreactNativeArchitectures=x86
& $adb install -r app\build\outputs\apk\release\app-release.apk
& $adb shell am start -n com.luminatv/.MainActivity
