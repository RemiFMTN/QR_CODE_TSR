param(
  [string]$MainCommitMessage = "chore: update project",
  [string]$PagesCommitMessage = "chore: deploy web",
  [string]$ApiBaseUrl = "https://qr-code-tsr.onrender.com",
  [string]$BaseHref,
  [switch]$SkipMainPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Run-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string]$WorkingDir
  )

  Write-Host "> $Command" -ForegroundColor Cyan
  Push-Location $WorkingDir
  try {
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $Command"
    }
  }
  finally {
    Pop-Location
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$flutterDir = Join-Path $rootDir "qr_code_tsr"
$ghPagesDir = Join-Path $rootDir "gh-pages"
$buildWebDir = Join-Path $flutterDir "build\web"

if (-not (Test-Path (Join-Path $rootDir ".git"))) {
  throw "Git repo not found at: $rootDir"
}
if (-not (Test-Path $flutterDir)) {
  throw "Flutter project directory not found: $flutterDir"
}
if (-not (Test-Path $ghPagesDir)) {
  throw "gh-pages worktree folder not found: $ghPagesDir"
}

if (-not $BaseHref) {
  $originUrl = (git -C $rootDir remote get-url origin).Trim()
  if (-not $originUrl) {
    throw "Remote origin URL not found."
  }

  $repoName = ""
  if ($originUrl -match "[:/]([^/]+?)\.git$") {
    $repoName = $Matches[1]
  } elseif ($originUrl -match "/([^/]+)$") {
    $repoName = $Matches[1]
  }

  if (-not $repoName) {
    throw "Could not infer repository name from origin URL: $originUrl"
  }

  $BaseHref = "/$repoName/"
}

Write-Host "Using API base URL: $ApiBaseUrl" -ForegroundColor Yellow
Write-Host "Using base href: $BaseHref" -ForegroundColor Yellow

if (-not $SkipMainPush) {
  Write-Host "\n[1/3] Commit and push main repository changes..." -ForegroundColor Green
  Run-Step -WorkingDir $rootDir -Command "git add -A"

  $mainStatus = (git -C $rootDir status --porcelain)
  if ($mainStatus) {
    Run-Step -WorkingDir $rootDir -Command "git commit -m '$MainCommitMessage'"
  } else {
    Write-Host "No changes to commit on main repository." -ForegroundColor DarkYellow
  }

  $currentBranch = (git -C $rootDir rev-parse --abbrev-ref HEAD).Trim()
  Run-Step -WorkingDir $rootDir -Command "git push origin $currentBranch"
} else {
  Write-Host "\n[1/3] Skip main push enabled." -ForegroundColor DarkYellow
}

Write-Host "\n[2/3] Build Flutter Web..." -ForegroundColor Green
Run-Step -WorkingDir $flutterDir -Command "flutter pub get"
Run-Step -WorkingDir $flutterDir -Command "flutter build web --release --dart-define=API_BASE_URL=$ApiBaseUrl --base-href $BaseHref"

Write-Host "\n[3/3] Publish build to gh-pages..." -ForegroundColor Green
Get-ChildItem -Path $ghPagesDir -Force |
  Where-Object { $_.Name -ne ".git" } |
  Remove-Item -Recurse -Force

Copy-Item -Path (Join-Path $buildWebDir "*") -Destination $ghPagesDir -Recurse -Force
New-Item -Path (Join-Path $ghPagesDir ".nojekyll") -ItemType File -Force | Out-Null

Run-Step -WorkingDir $ghPagesDir -Command "git add -A"
$pagesStatus = (git -C $ghPagesDir status --porcelain)
if ($pagesStatus) {
  Run-Step -WorkingDir $ghPagesDir -Command "git commit -m '$PagesCommitMessage'"
} else {
  Write-Host "No changes to commit on gh-pages." -ForegroundColor DarkYellow
}
Run-Step -WorkingDir $ghPagesDir -Command "git push origin gh-pages"

Write-Host "\nDone. Main branch and gh-pages are up to date." -ForegroundColor Green
