Param(
  [string]$BaseUrl = "http://localhost:4000",
  [string]$EnvPath = (Join-Path $PSScriptRoot "..\\.env")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path $Path)) {
    throw "Env file not found: $Path"
  }

  $line = Get-Content $Path | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
  if (-not $line) {
    throw "Missing $Key in $Path"
  }

  return $line.Substring($Key.Length + 1)
}

Write-Host "[1/5] Health check..."
$health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health"
$health | ConvertTo-Json -Depth 3 | Write-Host

$username = Get-EnvValue -Path $EnvPath -Key "ADMIN_USERNAME"
$password = Get-EnvValue -Path $EnvPath -Key "ADMIN_PASSWORD"

Write-Host "[2/5] Login..."
$loginBody = @{ username = $username; password = $password } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -Body $loginBody -ContentType "application/json"
$token = $login.token
if (-not $token) { throw "Missing token in login response" }

$headers = @{ Authorization = "Bearer $token" }

Write-Host "[3/5] Create group..."
$groupBody = @{ name = "TSR"; creatorName = "Admin TSR" } | ConvertTo-Json
$group = Invoke-RestMethod -Method Post -Uri "$BaseUrl/groups" -Headers $headers -Body $groupBody -ContentType "application/json"
$group | ConvertTo-Json -Depth 4 | Write-Host

Write-Host "[4/5] Add member..."
$memberBody = @{ fullName = "Alice Martin"; email = "alice@example.com" } | ConvertTo-Json
$member = Invoke-RestMethod -Method Post -Uri "$BaseUrl/groups/$($group.id)/members" -Headers $headers -Body $memberBody -ContentType "application/json"
$member | ConvertTo-Json -Depth 4 | Write-Host

Write-Host "[5/5] Scan by QR token + check-in..."
$scanBody = @{ qrToken = $group.qrToken } | ConvertTo-Json
$scan = Invoke-RestMethod -Method Post -Uri "$BaseUrl/scan/qr" -Headers $headers -Body $scanBody -ContentType "application/json"
$scan | ConvertTo-Json -Depth 5 | Write-Host

$checkinBody = @{ checkedIn = $true } | ConvertTo-Json
$checkin = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/members/$($member.id)" -Headers $headers -Body $checkinBody -ContentType "application/json"
$checkin | ConvertTo-Json -Depth 3 | Write-Host

Write-Host "Done."
