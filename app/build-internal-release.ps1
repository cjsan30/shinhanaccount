$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$androidStudioJbr = 'C:\Program Files\Android\Android Studio\jbr'
if (-not (Test-Path -LiteralPath $androidStudioJbr)) { throw "Android Studio JBR not found: $androidStudioJbr" }
$env:JAVA_HOME = $androidStudioJbr
$env:Path = "$androidStudioJbr\bin;$env:Path"
$storeFile = 'C:\Users\lAte\Keys\shinhanhae-release.jks'
if (-not (Test-Path -LiteralPath $storeFile)) { throw "Keystore not found: $storeFile" }
$storePassword = Read-Host 'Keystore password' -AsSecureString
$keyPassword = Read-Host 'Key password (same password is allowed)' -AsSecureString
$storePasswordPlain = [System.Net.NetworkCredential]::new('', $storePassword).Password
$keyPasswordPlain = [System.Net.NetworkCredential]::new('', $keyPassword).Password
if ([string]::IsNullOrWhiteSpace($storePasswordPlain)) { throw 'Keystore password was not entered.' }
if ([string]::IsNullOrWhiteSpace($keyPasswordPlain)) { throw 'Key password was not entered.' }
$env:SHINHANHAE_STORE_FILE = $storeFile
$env:SHINHANHAE_STORE_PASSWORD = $storePasswordPlain
$env:SHINHANHAE_KEY_ALIAS = 'shinhanhae'
$env:SHINHANHAE_KEY_PASSWORD = $keyPasswordPlain
# Friend-facing release builds must never include internal test controls.
npm.cmd run build
node --require ./scripts/capacitor-safe-userinfo.cjs ./node_modules/@capacitor/cli/bin/capacitor copy android
Push-Location android
try {
    .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "Release build failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }
$releaseApk = Join-Path $PSScriptRoot 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $releaseApk)) { throw "Signed release APK was not created: $releaseApk" }
Write-Host "Release APK: $releaseApk"
