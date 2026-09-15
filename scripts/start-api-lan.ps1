<#
.SYNOPSIS
    Starts the Libra development API so a phone on the same Wi-Fi can reach it.

.DESCRIPTION
    `dotnet run` uses Properties/launchSettings.json, whose applicationUrl is http://localhost:5134. Kestrel then
    binds 127.0.0.1 and [::1] only, so nothing on the LAN — including a phone running Expo Go — can connect at
    all, whatever the firewall says. This script overrides ASPNETCORE_URLS to bind every interface for this run
    only, leaving launchSettings.json and the default local configuration untouched.

    It also picks the address the phone should actually use. A developer machine usually carries several IPv4
    addresses (Hyper-V, WSL, VirtualBox, VPN, link-local); none of those are reachable from a phone. The choice
    here is the adapter that is up, is not virtual, and has an IPv4 default gateway — the one that is genuinely
    on the same network as the phone. Pass -IPAddress to decide yourself.

.PARAMETER IPAddress
    LAN IPv4 address to advertise. Omit to detect it; pass it when several adapters make the choice ambiguous.

.PARAMETER Port
    TCP port to bind. Default 5134, matching launchSettings.json and .env.example.

.PARAMETER ArtifactsPath
    Build output directory used when the default bin/ folder is locked by an orphaned Libra.Api.exe. Only used
    if the normal build fails.

.PARAMETER SkipEnvFile
    Do not write src/mobile/.env.local. Use when you manage that file yourself.

.PARAMETER Detach
    Start the API and return immediately instead of streaming its log until Ctrl+C.

.EXAMPLE
    pwsh ./scripts/start-api-lan.ps1

.EXAMPLE
    pwsh ./scripts/start-api-lan.ps1 -IPAddress 192.168.6.225
#>
[CmdletBinding()]
param(
    [string] $IPAddress,
    [int] $Port = 5134,
    [string] $ArtifactsPath = (Join-Path $env:TEMP 'libra-artifacts'),
    [switch] $SkipEnvFile,
    [switch] $Detach
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $repoRoot 'src/backend/Libra.Api/Libra.Api.csproj'
$envFile = Join-Path $repoRoot 'src/mobile/.env.local'
$firewallRuleName = 'Libra dev API (LocalSubnet)'

if (-not (Test-Path $project)) {
    throw "Libra.Api.csproj not found at $project. Run this script from inside the repository."
}

function Write-Step {
    param([string] $Text)
    Write-Host ''
    Write-Host "== $Text" -ForegroundColor Cyan
}

# --- 1. The address the phone should use ------------------------------------------------------------------

<#
    Virtual adapters keep their own private subnets that no phone can route to. They are excluded by name as
    well as by the gateway test, because a VPN or hypervisor switch can occasionally carry a gateway of its own.
#>
$virtualNamePattern = 'vEthernet|Hyper-V|WSL|VirtualBox|VMware|Docker|Loopback|TAP-|OpenVPN|WireGuard|Tailscale|ZeroTier|Bluetooth'

function Get-LanCandidates {
    Get-NetIPConfiguration |
        Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
        ForEach-Object {
            $adapter = Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue
            [pscustomobject]@{
                Alias       = $_.InterfaceAlias
                IPv4        = $_.IPv4Address[0].IPAddress
                Gateway     = $_.IPv4DefaultGateway[0].NextHop
                Description = $adapter.InterfaceDescription
                IsVirtual   = [bool]$adapter.Virtual -or $_.InterfaceAlias -match $virtualNamePattern -or $adapter.InterfaceDescription -match $virtualNamePattern
                Metric      = (Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                    Select-Object -First 1 -ExpandProperty InterfaceMetric)
            }
        } |
        # 169.254.x.x is a link-local address a machine gives itself when DHCP failed; it reaches nothing.
        Where-Object { $_.IPv4 -notlike '169.254.*' -and $_.IPv4 -ne '127.0.0.1' }
}

Write-Step 'Network address'
$candidates = @(Get-LanCandidates)

if ($IPAddress) {
    $lanAddress = $IPAddress
    Write-Host "Using the address you passed: $lanAddress"
    if (@($candidates | ForEach-Object { $_.IPv4 }) -notcontains $lanAddress) {
        Write-Host "Note: $lanAddress is not one of this machine's routable addresses. Continuing anyway." -ForegroundColor Yellow
    }
}
else {
    $usable = @($candidates | Where-Object { -not $_.IsVirtual } | Sort-Object Metric)
    if ($usable.Count -eq 0) {
        throw 'No usable LAN adapter found (none is up, physical and holding a default gateway). Pass -IPAddress explicitly.'
    }

    $lanAddress = $usable[0].IPv4
    foreach ($candidate in $candidates) {
        $mark = if ($candidate.IPv4 -eq $lanAddress) { 'use ' } elseif ($candidate.IsVirtual) { 'skip' } else { '    ' }
        Write-Host ("  [{0}] {1,-15} {2}" -f $mark, $candidate.IPv4, $candidate.Alias)
    }

    if ($usable.Count -gt 1) {
        Write-Host "More than one physical network is connected. If the phone cannot reach this one, re-run with -IPAddress <other>." -ForegroundColor Yellow
    }
}

$baseUrl = "http://${lanAddress}:$Port"
$healthUrl = "$baseUrl/health/ready"

# --- 2. Free the port, stopping only a process we can identify ---------------------------------------------

Write-Step "Port $Port"
$owners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)

foreach ($owningPid in $owners) {
    $process = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
    if (-not $process) { continue }

    # Only our own API is ever stopped. Anything else on this port is reported and left alone.
    if ($process.ProcessName -notin @('Libra.Api', 'dotnet')) {
        throw "Port $Port is held by $($process.ProcessName) (PID $owningPid), which is not the Libra API. Stop it yourself or pass -Port."
    }

    Write-Host "Stopping the previous API: $($process.ProcessName) (PID $owningPid)"
    Stop-Process -Id $owningPid -Force
    Start-Sleep -Milliseconds 800
}

if (-not $owners) {
    Write-Host "Nothing was listening on $Port."
}

# --- 3. A signing key that survives a restart ---------------------------------------------------------------

<#
    Without Jwt:SigningKey the API generates an ephemeral key at startup, so every restart invalidates the
    session already stored on the phone: the app appears signed out, and any token it kept fails validation with
    IDX10517. That makes device testing unrepeatable. The key is stored in this project's user-secrets, which is
    machine-local and outside the repository — never in appsettings, never printed.
#>
Write-Step 'Signing key'
$secrets = & dotnet user-secrets list --project $project --id libra-api-dev 2>&1 | Out-String

if ($secrets -match 'Jwt:SigningKey\s*=') {
    Write-Host 'Jwt:SigningKey is already set in user-secrets; phone sessions survive a restart.'
}
else {
    # RandomNumberGenerator.Create() works on both Windows PowerShell 5.1 and PowerShell 7; Fill() does not.
    $keyBytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($keyBytes) } finally { $rng.Dispose() }
    $generated = [Convert]::ToBase64String($keyBytes)
    & dotnet user-secrets set 'Jwt:SigningKey' $generated --project $project --id libra-api-dev | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not store Jwt:SigningKey in user-secrets.' }
    Write-Host 'Generated a development Jwt:SigningKey and stored it in user-secrets (value not printed).'
    Write-Host 'Sessions already on the phone were signed with the old ephemeral key; sign in once more.'
}

# --- 4. Build (falling back to a separate output directory when bin/ is locked) -----------------------------

Write-Step 'Build'
$buildArgs = @()
& dotnet build $project --nologo -v quiet 2>&1 | Write-Host

if ($LASTEXITCODE -ne 0) {
    # An orphaned Libra.Api.exe can keep a handle on bin/ that cannot be released without a reboot. Building to
    # a separate artifacts directory sidesteps the lock without touching the repository layout.
    Write-Host "Default build output is locked; building into $ArtifactsPath instead." -ForegroundColor Yellow
    $buildArgs = @('-p:UseArtifactsOutput=true', "-p:ArtifactsPath=$ArtifactsPath")
    & dotnet build $project --nologo -v quiet @buildArgs 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
}

# --- 5. Start Kestrel on every interface, for this run only -------------------------------------------------

Write-Step 'Start'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
# 0.0.0.0 binds every IPv4 interface. launchSettings.json keeps its localhost default for everyone else.
$env:ASPNETCORE_URLS = "http://0.0.0.0:$Port"

# Start-Process does not quote arguments for you, and the repository path may contain spaces.
$runArgs = @('run', '--project', "`"$project`"", '--no-launch-profile') + $buildArgs
$api = Start-Process -FilePath 'dotnet' -ArgumentList $runArgs -NoNewWindow -PassThru
Write-Host "dotnet run started (PID $($api.Id)); binding $env:ASPNETCORE_URLS"

$ready = $false
foreach ($attempt in 1..40) {
    Start-Sleep -Milliseconds 1000
    try {
        $probe = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health/ready" -TimeoutSec 3 -UseBasicParsing
        if ($probe.StatusCode -eq 200) { $ready = $true; break }
    }
    catch { }
    if ($api.HasExited) { throw "The API exited during startup (code $($api.ExitCode)). Check the log above." }
}

if (-not $ready) { throw "The API did not answer /health/ready on loopback within 40s." }

# --- 6. Verify from Windows, and say plainly what that does and does not prove ------------------------------

Write-Step 'Checks from this Windows machine'

function Test-Health {
    param([string] $Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing
        $status = ($response.Content | ConvertFrom-Json).status
        Write-Host ("  OK   {0}  HTTP {1} ({2})" -f $Url, $response.StatusCode, $status) -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host ("  FAIL {0}  {1}" -f $Url, $_.Exception.Message) -ForegroundColor Red
        return $false
    }
}

$loopbackOk = Test-Health "http://127.0.0.1:$Port/health/ready"
$lanOk = Test-Health $healthUrl

# --- 7. Firewall: only reported, never changed, and never widened beyond the local subnet -------------------

Write-Step 'Windows Firewall'
$rule = Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
$profileForAddress = Get-NetConnectionProfile -ErrorAction SilentlyContinue |
    Where-Object { (Get-NetIPAddress -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress -contains $lanAddress } |
    Select-Object -First 1

Write-Host "The checks above came from this machine, whose own traffic the firewall does not filter, so they"
Write-Host "cannot tell you whether the phone is blocked. Only the phone can."

# Firewall rules are per program as well as per port, and Windows may already have created one the first time
# the API ran and a prompt was accepted. Reporting that prevents adding a second, redundant rule.
$programRules = @(
    Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue |
        Where-Object { $_.Program -match 'libra\.api\.exe$' } |
        ForEach-Object { $_ | Get-NetFirewallRule -ErrorAction SilentlyContinue } |
        Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' -and $_.Enabled -eq 'True' }
)
# Compared as strings: NetworkCategory and a rule's Profile are different enum types that merely print alike,
# so `-contains` between them is always false.
$networkCategory = if ($profileForAddress) { [string]$profileForAddress.NetworkCategory } else { 'unknown' }
$allowedProfiles = @($programRules | ForEach-Object { [string]$_.Profile } | Sort-Object -Unique)
$alreadyAllowed = $rule -or ($programRules.Count -gt 0 -and ($allowedProfiles -contains 'Any' -or $allowedProfiles -contains $networkCategory))

Write-Host ""
if ($rule) {
    Write-Host "Inbound rule '$firewallRuleName' is present (Enabled=$($rule.Enabled))." -ForegroundColor Green
}

if ($programRules.Count -gt 0) {
    Write-Host "Windows allows inbound connections to Libra.Api.exe: $($programRules.Count) rule(s) on $(($allowedProfiles) -join ', '); this network is $networkCategory." -ForegroundColor Green
    Write-Host "That covers the program, not the port. Starting the API as 'dotnet Libra.Api.dll' runs it as"
    Write-Host "dotnet.exe instead, which those rules do not match."
}

if (-not $alreadyAllowed) {
    Write-Host "Nothing currently allows inbound connections to the API on a $networkCategory network." -ForegroundColor Yellow
    if ($networkCategory -eq 'Public') {
        # A home or office Wi-Fi is a Private network. Leaving it Public and poking a hole in the Public profile
        # instead would weaken every network this machine ever joins.
        Write-Host ""
        Write-Host "'$($profileForAddress.Name)' is classified Public, where Windows refuses inbound connections." -ForegroundColor Yellow
        Write-Host "If this is your own Wi-Fi, reclassify it first (ELEVATED PowerShell):" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Set-NetConnectionProfile -Name '$($profileForAddress.Name)' -NetworkCategory Private" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Then, if the phone still times out, add the rule once (ELEVATED PowerShell):"
    Write-Host ""
    Write-Host "  New-NetFirewallRule -DisplayName '$firewallRuleName' -Direction Inbound -Action Allow ``" -ForegroundColor Yellow
    Write-Host "    -Protocol TCP -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "That allows only TCP $Port, only on Private networks, only from your own subnet. Do not disable"
    Write-Host "the firewall, and do not widen the rule to Any/Public."
}

# --- 8. Mobile configuration --------------------------------------------------------------------------------

if (-not $SkipEnvFile) {
    Write-Step 'Mobile configuration'
    # .env.local is ignored by git (src/mobile/.gitignore: .env*.local) and wins over .env in Expo's load order,
    # so the machine-specific address never reaches the repository or another developer.
    #
    # Written without a byte-order mark: Windows PowerShell's `Set-Content -Encoding utf8` prepends one, and a
    # BOM sitting in front of the first key is exactly the kind of thing a dotenv parser reads as part of the
    # variable name.
    [System.IO.File]::WriteAllText($envFile, "EXPO_PUBLIC_API_URL=$baseUrl`n", [System.Text.UTF8Encoding]::new($false))
    Write-Host "Wrote $envFile"
    Write-Host "  EXPO_PUBLIC_API_URL=$baseUrl"
    Write-Host "Restart Expo with a cleared cache so the new value is inlined: npx expo start -c"
}

Write-Step 'Open this on the phone'
Write-Host "  Health : $healthUrl" -ForegroundColor Green
Write-Host "  API    : $baseUrl/api  (bearer token required)"
Write-Host ""
Write-Host "The phone must be on the same Wi-Fi, and it is the only thing that proves the phone can reach the API."

if (-not $lanOk) {
    Write-Host "The LAN check above failed on this machine, so the phone will fail too. Re-run with -IPAddress." -ForegroundColor Red
}

if ($Detach) {
    Write-Host ""
    Write-Host "Running in the background as PID $($api.Id). Stop it with: Stop-Process -Id $($api.Id)"
    return
}

Write-Host ""
Write-Host 'Press Ctrl+C to stop the API.'
Wait-Process -Id $api.Id
