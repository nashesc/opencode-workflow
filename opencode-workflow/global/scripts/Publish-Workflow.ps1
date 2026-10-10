# Publish-Workflow.ps1 — sync live workflow to the opencode-workflow distro, sanitized.
#
# Worker for the global /publish-workflow command. Copies a FIXED manifest
# (no globs) from the live roots to the distro, sanitizes, verifies
# fail-closed, then writes. Never commits — the caller reviews git diff.
#
# Sources:  $env:USERPROFILE\.config\opencode  (global, key-bearing)
#           $WorkspaceRoot                      (project template, default: Default Project)
# Dest:     -DestRoot (or $env:PUBLISH_DEST, or the NASH default below).
#
# PowerShell 5.1 compatible. Supports -WhatIf (dry run: stage + verify, write nothing).

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$DestRoot = $null,
    [string]$WorkspaceRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Default Project')
)

$ErrorActionPreference = 'Stop'

$DEFAULT_DEST = '<WORKFLOW_DISTRO>'

function Resolve-DestRoot([string]$override) {
    if ($override) { return $override }
    if ($env:PUBLISH_DEST) { return $env:PUBLISH_DEST }
    if ($DEFAULT_DEST -eq '<WORKFLOW_DISTRO>') {
        throw 'no dest root: pass -DestRoot <path> or set $env:PUBLISH_DEST (default is machine-specific and intentionally not shipped)'
    }
    return $DEFAULT_DEST
}

function Assert-NoSecrets([string]$path) {
    $raw = Get-Content -LiteralPath $path -Raw
    if ($raw -match 'sk-[A-Za-z0-9]{10,}') { throw "secret sweep FAILED (api-key pattern): $path" }
    if ($raw -match 'C:\\Users\\[A-Za-z]+\\') { throw "secret sweep FAILED (machine path): $path" }
}

$dest = Resolve-DestRoot $DestRoot
$globalRoot = Join-Path $env:USERPROFILE '.config\opencode'

foreach ($p in @($globalRoot, $WorkspaceRoot, $dest)) {
    if (-not (Test-Path -LiteralPath $p)) { throw "required path missing: $p" }
}

# Fixed manifest: live source -> dest relative path. Whole-file copies only;
# global opencode.jsonc is deliberately NOT whole-copied (distro stays canonical).
$manifest = @(
    @{ src = (Join-Path $globalRoot 'AGENTS.md'); rel = 'global/AGENTS.md' },
    @{ src = (Join-Path $globalRoot 'commands\publish-workflow.md'); rel = 'global/commands/publish-workflow.md' },
    @{ src = (Join-Path $globalRoot 'scripts\Publish-Workflow.ps1'); rel = 'global/scripts/Publish-Workflow.ps1' }
)
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $globalRoot 'commands') -Filter '*.md' -File) {
    if ($f.Name -like '*.bak') { continue }
    if ($f.Name -eq 'publish-workflow.md') { continue } # already listed
    $manifest += @{ src = $f.FullName; rel = ('global/commands/' + $f.Name) }
}
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $globalRoot 'agents') -Filter '*.md' -File) {
    if ($f.Name -like '*.bak') { continue }
    $manifest += @{ src = $f.FullName; rel = ('global/agents/' + $f.Name) }
}
foreach ($d in Get-ChildItem -LiteralPath (Join-Path $globalRoot 'skills') -Directory) {
    $skill = Join-Path $d.FullName 'SKILL.md'
    if (Test-Path -LiteralPath $skill) {
        $manifest += @{ src = $skill; rel = ('global/skills/' + $d.Name + '/SKILL.md') }
    }
}
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $globalRoot 'templates') -File) {
    $manifest += @{ src = $f.FullName; rel = ('global/templates/' + $f.Name) }
}
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $globalRoot 'scripts') -File) {
    if ($f.Name -like '*.bak') { continue }
    if ($f.Name -eq 'Publish-Workflow.ps1') { continue } # already listed
    $manifest += @{ src = $f.FullName; rel = ('global/scripts/' + $f.Name) }
}
# Project-template files (live workspace -> distro).
$manifest += @{ src = (Join-Path $WorkspaceRoot 'AGENTS.md'); rel = 'project-template/AGENTS.md' }
$manifest += @{ src = (Join-Path $WorkspaceRoot 'opencode.jsonc'); rel = 'project-template/opencode.jsonc' }
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $WorkspaceRoot '.opencode\commands') -Filter '*.md' -File) {
    if ($f.Name -like '*.bak') { continue }
    $manifest += @{ src = $f.FullName; rel = ('project-template/.opencode/commands/' + $f.Name) }
}
$manifest += @{ src = (Join-Path $WorkspaceRoot '.opencode\plugins\token-report.js'); rel = 'project-template/.opencode/plugins/token-report.js' }

# Fail-closed guards on LIVE sources: the backfill fixes must be present upstream.
$livePlan = Get-Content -LiteralPath (Join-Path $globalRoot 'commands\plan.md') -Raw
if ($livePlan -notmatch '\$ARGUMENTS') { throw 'guard FAILED: live plan.md lacks $ARGUMENTS — fix live first' }
$livePlugin = Get-Content -LiteralPath (Join-Path $WorkspaceRoot '.opencode\plugins\token-report.js') -Raw
if ($livePlugin -match '"experimental\.text\.complete"|PULL_ATTEMPTS|pending\.set|pending\.has') {
    throw 'guard FAILED: live token-report.js still has footer machinery — fix live first'
}
$liveJsonc = Get-Content -LiteralPath (Join-Path $WorkspaceRoot 'opencode.jsonc') -Raw
if ($liveJsonc -match '"instructions":\s*\["\.opencode/memory/\*\.md"\]') {
    throw 'guard FAILED: live opencode.jsonc still uses the *.md glob — fix live first'
}

# Stage to temp (never write dest directly).
$stage = Join-Path ([IO.Path]::GetTempPath()) ('publish-workflow-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    foreach ($m in $manifest) {
        if (-not (Test-Path -LiteralPath $m.src)) { throw "manifest source missing: $($m.src)" }
        $target = Join-Path $stage $m.rel
        $parent = Split-Path -Parent $target
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        Copy-Item -LiteralPath $m.src -Destination $target -Force
    }

    # Sanitize staging. Machine-specific paths become the <WORKFLOW_DISTRO>
    # placeholder (the published copy must not bake in this machine's layout);
    # live files keep their concrete defaults.
    foreach ($f in Get-ChildItem -LiteralPath $stage -Recurse -File) {
        $raw = Get-Content -LiteralPath $f.FullName -Raw
        $clean = $raw -replace 'sk-[A-Za-z0-9]{10,}', '{env:REDACTED}'
        $clean = $clean -replace [regex]::Escape($DEFAULT_DEST), '<WORKFLOW_DISTRO>'
        if ($clean -ne $raw) { Set-Content -LiteralPath $f.FullName -Value $clean -NoNewline }
    }

    # Fail-closed verification over staging.
    foreach ($f in Get-ChildItem -LiteralPath $stage -Recurse -File) { Assert-NoSecrets $f.FullName }
    $stagedJsonc = Get-Content -LiteralPath (Join-Path $stage 'project-template\opencode.jsonc') -Raw
    if ($stagedJsonc -match '"instructions":\s*\[[^\]]*\*') { throw 'verify FAILED: staged instructions array contains a glob' }
    $stripped = ($stagedJsonc -split "`r?`n" | Where-Object { $_ -notmatch '^\s*//' }) -join "`n"
    try { $stripped | ConvertFrom-Json | Out-Null } catch { throw "verify FAILED: staged opencode.jsonc does not parse: $_" }
    $stagedPlan = Get-Content -LiteralPath (Join-Path $stage 'global\commands\plan.md') -Raw
    if ($stagedPlan -notmatch '\$ARGUMENTS') { throw 'verify FAILED: staged plan.md lacks $ARGUMENTS' }
    $stagedPlugin = Get-Content -LiteralPath (Join-Path $stage 'project-template\.opencode\plugins\token-report.js') -Raw
    if ($stagedPlugin -match '"experimental\.text\.complete"|PULL_ATTEMPTS|pending\.set|pending\.has') {
        throw 'verify FAILED: staged token-report.js still has footer machinery'
    }

    # README correction (idempotent guards — skip silently if wording already new).
    $readmePath = Join-Path $dest 'README.md'
    if (($PSCmdlet.ShouldProcess($readmePath, 'README backfill')) -and (Test-Path -LiteralPath $readmePath)) {
        $readme = Get-Content -LiteralPath $readmePath -Raw
        $updated = $readme
        $updated = $updated -replace '`instructions: \["\.opencode/memory/\*\.md"\]`', 'explicit `instructions` file list — never a `*.md` glob, so archives stay unloaded'
        $updated = $updated -replace '- \*\*Per-response footer:\*\*[^\r\n]*\r?\n', ('- **Vault log only:** `.opencode/plugins/token-report.js` records real SDK token totals per assistant message (no footer injection, no polling).' + "`r`n")
        if ($updated -ne $readme) { Set-Content -LiteralPath $readmePath -Value $updated -NoNewline }
    }

    # Move staging -> dest (listed files only; never delete extras).
    foreach ($m in $manifest) {
        $from = Join-Path $stage $m.rel
        $to = Join-Path $dest $m.rel
        $parent = Split-Path -Parent $to
        if (-not (Test-Path -LiteralPath $parent)) {
            if ($PSCmdlet.ShouldProcess($parent, 'create dir')) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        }
        if ($PSCmdlet.ShouldProcess($to, 'publish file')) { Copy-Item -LiteralPath $from -Destination $to -Force }
    }

    # MANIFEST.md (source map + shas + timestamp).
    $lines = @('# Publish manifest', '', '- Generated (UTC): ' + ((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')), '')
    foreach ($m in $manifest) { $lines += ('- `' + $m.src + '` -> `' + $m.rel + '`') }
    try {
        $wsSha = (git -C $WorkspaceRoot rev-parse --short HEAD 2>$null); if ($wsSha) { $lines += ('- workspace HEAD: ' + ($wsSha -join '')) }
        $destSha = (git -C $dest rev-parse --short HEAD 2>$null); if ($destSha) { $lines += ('- dest HEAD (before): ' + ($destSha -join '')) }
    } catch {}
    $manifestPath = Join-Path $dest 'MANIFEST.md'
    if ($PSCmdlet.ShouldProcess($manifestPath, 'write manifest')) {
        Set-Content -LiteralPath $manifestPath -Value ($lines -join "`r`n" + "`r`n") -NoNewline
    }

    Write-Output ("published $($manifest.Count) files to $dest")
    if (Test-Path -LiteralPath (Join-Path $dest '.git')) { $r = $dest } else { $r = Split-Path -Parent $dest }
    Write-Output '--- git status ---'
    git -C $r status --short -- opencode-workflow 2>$null; if (-not $?) { git -C $r status --short 2>$null | Select-Object -First 20 }
} finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
