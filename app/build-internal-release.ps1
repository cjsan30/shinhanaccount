$ErrorActionPreference = 'Stop'
$storeFile = 'C:\Users\lAte\Keys\shinhanhae-release.jks'
if (-not (Test-Path -LiteralPath $storeFile)) { throw "Keystore not found: $storeFile" }
$storePassword = Read-Host 'Keystore password' -AsSecureString
$keyPassword = Read-Host 'Key password (same password is allowed)' -AsSecureString
$toPlain = { param($value) [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)) }
$env:SHINHANHAE_STORE_FILE = $storeFile
$env:SHINHANHAE_STORE_PASSWORD = & $toPlain $storePassword
$env:SHINHANHAE_KEY_ALIAS = 'shinhanhae'
$env:SHINHANHAE_KEY_PASSWORD = & $toPlain $keyPassword
npm.cmd run build:internal
npx.cmd cap copy android
Push-Location android
try { .\gradlew.bat assembleRelease } finally { Pop-Location }
Write-Host 'Release APK: android\app\build\outputs\apk\release\app-release.apk'