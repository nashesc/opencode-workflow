# pre-commit.ps1 — capture-only git hook for OpenCode memory system
#
# LEGACY fallback: pre-commit.js is the canonical portable hook.
# This script stays for machines without node; behavior is equivalent.
#
# Detects the project's test/lint command from its manifest, runs it,
# and on failure writes up to 3 failure summaries to .opencode/.pending-hook-errors
# for /end-session to capture. NEVER exits non-zero — this hook never blocks a commit.
#
# Installed by /end-session when user opts in.

$ErrorActionPreference = 'Continue'

# Find project root (where .git lives) by walking up from cwd
function Get-GitRoot {
    $dir = Get-Location
    while ($dir -ne $null) {
        if (Test-Path -LiteralPath (Join-Path $dir '.git')) {
            return $dir.ToString()
        }
        $parent = Split-Path -Parent $dir
        if ($parent -eq $dir) { return $null }
        $dir = $parent
    }
    return $null
}

$projectRoot = Get-GitRoot
if (-not $projectRoot) {
    exit 0  # Can't find root — skip silently
}

$pendingFile = Join-Path $projectRoot '.opencode\.pending-hook-errors'
$timestamp   = (Get-Date).ToString('yyyy-MM-dd')
$dash = [char]0x2014
$noBom = [Text.UTF8Encoding]::new($false)

# -- Gitleaks soft-gate ------------------------------------------------------
# Runs on every commit regardless of project type. Only when gitleaks is
# installed; warns once and skips otherwise. Findings are captured like
# test failures. Never blocks (exit stays 0).
$leaks = Get-Command gitleaks -ErrorAction SilentlyContinue
if ($leaks) {
    try {
        $leakOut = & gitleaks protect --staged --verbose --no-git 2>&1
        $leakCode = $LASTEXITCODE
    } catch {
        $leakCode = 1
        $leakOut = @("Error running gitleaks: $_")
    }
    if ($leakCode -ne 0) {
        $pendingDir = Split-Path -Parent $pendingFile
        if (-not (Test-Path -LiteralPath $pendingDir)) {
            New-Item -ItemType Directory -Path $pendingDir -Force | Out-Null
        }
        $leakLines = @($leakOut | Where-Object { $_ -match '\S' } | Select-Object -First 3)
        foreach ($line in $leakLines) {
            $cleanLine = ($line -replace '\s+', ' ').Trim()
            $entry = "$timestamp $dash Pre-commit hook: gitleaks found possible secret $dash $cleanLine"
            [IO.File]::AppendAllText($pendingFile, $entry + "`r`n", $noBom)
        }
    }
} else {
    Write-Output 'pre-commit: gitleaks not installed, secret scan skipped (winget install gitleaks to enable)'
}

# ── Detect project type and build test command ─────────────────────────────
$testCmd    = $null
$testArgs   = @()
$testLabel  = $null

if (Test-Path -LiteralPath (Join-Path $projectRoot 'package.json')) {
    $pkg = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
    $scripts = $pkg.scripts

    # Prefer bun if bun.lockb present, else npm
    $useBun = Test-Path -LiteralPath (Join-Path $projectRoot 'bun.lockb')
    $pm     = if ($useBun) { 'bun' } else { 'npm' }

    if ($scripts.test) {
        $testCmd   = $pm
        $testArgs  = @('test', '--', '--passWithNoTests')
        $testLabel = "$pm test"
    } elseif ($scripts.lint) {
        $testCmd   = $pm
        $testArgs  = @('run', 'lint')
        $testLabel = "$pm run lint"
    }
} elseif (Test-Path -LiteralPath (Join-Path $projectRoot 'pyproject.toml')) {
    $testCmd   = 'pytest'
    $testArgs  = @('--tb=short', '-q')
    $testLabel = 'pytest'
} elseif (Test-Path -LiteralPath (Join-Path $projectRoot 'go.mod')) {
    $testCmd   = 'go'
    $testArgs  = @('test', './...')
    $testLabel = 'go test ./...'
} elseif (Test-Path -LiteralPath (Join-Path $projectRoot 'Cargo.toml')) {
    $testCmd   = 'cargo'
    $testArgs  = @('test')
    $testLabel = 'cargo test'
} else {
    # No recognised manifest — skip silently
    exit 0
}

# ── Run the test command ───────────────────────────────────────────────────
try {
    $output = & $testCmd @testArgs 2>&1
    $exitCode = $LASTEXITCODE
} catch {
    # Command not found or threw — capture as a failure
    $exitCode = 1
    $output   = @("Error running '$testLabel': $_")
}

if ($exitCode -eq 0) {
    exit 0  # All good — nothing to log
}

# ── Extract up to 3 failure lines ─────────────────────────────────────────
#
# Heuristic: lines containing "FAIL", "Error", "error", "×", "✗", "●", "FAILED"
# are likely failure indicators across different test runners.
$failurePattern = 'FAIL|FAILED|Error|error|✗|×|●|\bfailed\b'
$failureLines   = @($output | Where-Object { $_ -match $failurePattern } | Select-Object -First 3)

if ($failureLines.Count -eq 0) {
    # Fallback: just take the last 3 non-empty lines of output
    $failureLines = @($output | Where-Object { $_ -match '\S' } | Select-Object -Last 3)
}

# ── Write to pending errors file ───────────────────────────────────────────
$pendingDir = Split-Path -Parent $pendingFile
if (-not (Test-Path -LiteralPath $pendingDir)) {
    New-Item -ItemType Directory -Path $pendingDir -Force | Out-Null
}

foreach ($line in $failureLines) {
    $cleanLine = ($line -replace '\s+', ' ').Trim()
    $entry = "$timestamp $dash Pre-commit hook: $testLabel failed $dash $cleanLine"
    # .NET append: 5.1 Add-Content -Encoding UTF8 stamps a BOM on creation.
    [IO.File]::AppendAllText($pendingFile, $entry + "`r`n", $noBom)
}

# Always exit 0 — capture-only, never blocks
exit 0
