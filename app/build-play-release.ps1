$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$androidStudioJbr = 'C:\Program Files\Android\Android Studio\jbr'
$storeFile = 'C:\Users\lAte\Keys\shinhanhae-release.jks'
$bundlePath = Join-Path $PSScriptRoot 'android\app\build\outputs\bundle\release\app-release.aab'
$apkPath = Join-Path $PSScriptRoot 'android\app\build\outputs\apk\release\app-release.apk'

function Get-Sha256Hash([string] $Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
        } finally {
            $sha256.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

if (-not (Test-Path -LiteralPath $androidStudioJbr)) { throw "Android Studio JBR not found: $androidStudioJbr" }
if (-not (Test-Path -LiteralPath $storeFile)) { throw "Keystore not found: $storeFile" }

$storePassword = Read-Host 'Keystore password' -AsSecureString
$keyPassword = Read-Host 'Key password (same password is allowed)' -AsSecureString
$storePasswordPlain = [System.Net.NetworkCredential]::new('', $storePassword).Password
$keyPasswordPlain = [System.Net.NetworkCredential]::new('', $keyPassword).Password
if ([string]::IsNullOrWhiteSpace($storePasswordPlain)) { throw 'Keystore password was not entered.' }
if ([string]::IsNullOrWhiteSpace($keyPasswordPlain)) { throw 'Key password was not entered.' }

$env:JAVA_HOME = $androidStudioJbr
$env:Path = "$androidStudioJbr\bin;$env:Path"
$env:SHINHANHAE_STORE_FILE = $storeFile
$env:SHINHANHAE_STORE_PASSWORD = $storePasswordPlain
$env:SHINHANHAE_KEY_ALIAS = 'shinhanhae'
$env:SHINHANHAE_KEY_PASSWORD = $keyPasswordPlain

try {
    npm.cmd run lint
    if ($LASTEXITCODE -ne 0) { throw "Lint failed with exit code $LASTEXITCODE" }
    npm.cmd run test:run
    if ($LASTEXITCODE -ne 0) { throw "Tests failed with exit code $LASTEXITCODE" }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Web build failed with exit code $LASTEXITCODE" }
    node --require ./scripts/capacitor-safe-userinfo.cjs ./node_modules/@capacitor/cli/bin/capacitor copy android
    if ($LASTEXITCODE -ne 0) { throw "Capacitor copy failed with exit code $LASTEXITCODE" }

    Push-Location android
    try {
        .\gradlew.bat testDebugUnitTest bundleRelease assembleRelease --offline
        if ($LASTEXITCODE -ne 0) { throw "Android release build failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath $bundlePath)) { throw "Signed release AAB was not created: $bundlePath" }
    if (-not (Test-Path -LiteralPath $apkPath)) { throw "Signed release APK was not created: $apkPath" }
    $manifest = Join-Path $PSScriptRoot 'android\app\build\intermediates\merged_manifests\release\processReleaseManifest\AndroidManifest.xml'
    if (Select-String -LiteralPath $manifest -Pattern 'android.permission.READ_SMS|android.permission.RECEIVE_SMS|SmsApprovalReceiver' -Quiet) {
        throw 'Restricted SMS permission or receiver remains in the release manifest.'
    }
    $bundleHash = Get-Sha256Hash $bundlePath
    $apkHash = Get-Sha256Hash $apkPath
    Write-Host "Play AAB: $bundlePath"
    Write-Host "AAB SHA-256: $bundleHash"
    Write-Host "Installable APK: $apkPath"
    Write-Host "APK SHA-256: $apkHash"
} finally {
    Remove-Item Env:SHINHANHAE_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SHINHANHAE_KEY_PASSWORD -ErrorAction SilentlyContinue
    $storePasswordPlain = $null
    $keyPasswordPlain = $null
}
