# Publish-Workflow.ps1 -- sync live workflow to the opencode-workflow distro, sanitized.
#
# Worker for the global /publish-workflow command. Copies a FIXED manifest
# (no globs) from the live roots to the distro, sanitizes, verifies
# fail-closed, then writes. Never commits -- the caller reviews git diff.
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

# Key classes the sanitizer covers. Anchored with a non-alphanumeric
# lookbehind plus minimum lengths so ordinary hyphenated prose
# (risk-based, mask-sensitive, disk-usage, task-level) does NOT match.
# Matching is case-SENSITIVE (-cmatch/-creplace): every real prefix below
# has fixed case. `sk-` covers OpenRouter (`sk-or-v1-...`) and Anthropic
# (`sk-ant-...`) forms; other classes have different prefixes entirely.
$KEY_PATTERNS = @(
    '(?<![A-Za-z0-9])sk-(or|ant|proj)?-?[A-Za-z0-9\-]{20,}',
    '(?<![A-Za-z0-9])sk_live_[A-Za-z0-9]{20,}',
    'ghp_[A-Za-z0-9]{36,}',
    'gho_[A-Za-z0-9]{36,}',
    'github_pat_[A-Za-z0-9_]{60,}',
    'ghs_[A-Za-z0-9]{36,}',
    'AIza[A-Za-z0-9_\-]{35}',
    'xox[bap]-?[A-Za-z0-9\-]{20,}',
    'xoxs-[A-Za-z0-9\-]{20,}',
    'hf_[A-Za-z0-9]{30,}',
    'AKIA[0-9A-Z]{16}'
)

function Test-HasKey([string]$raw) {
    foreach ($p in $KEY_PATTERNS) { if ($raw -cmatch $p) { return $true } }
    return $false
}

function Assert-NoSecrets([string]$path) {
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    if (Test-HasKey $raw) { throw "secret sweep FAILED (api-key pattern): $path" }
    if ($raw -match 'C:\\Users\\[A-Za-z]+\\') { throw "secret sweep FAILED (machine path): $path" }
}

# Key-only sweep for LIVE sources (no machine-path check: this script's own
# DEFAULT_DEST legitimately contains one, and it is redacted at stage time).
function Assert-NoLiveKeys([string]$path) {
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    if (Test-HasKey $raw) { throw "secret sweep FAILED on live source (key class): $path" }
}

# Writers. Windows PowerShell 5.1 `Set-Content -Encoding UTF8` stamps a BOM
# on every rewrite, which landed inconsistently (only rewritten files got
# one) and risks breaking frontmatter parsers -- so .md/.jsonc staged output
# is uniformly BOM-free. The exception is .ps1/.psm1: 5.1 reads BOM-less
# scripts as ANSI, which corrupts non-ASCII string patterns (verified: this
# file failed to parse BOM-less until it was made pure ASCII). Staged
# scripts therefore keep a BOM; MemoryHelpers/pre-commit intentionally carry
# non-ASCII match patterns and keep theirs too.
function Write-StagedFile([string]$path, [string]$text) {
    [IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false))
}

function Write-StagedScript([string]$path, [string]$text) {
    [IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($true))
}

# Live apiKey rule: the key-bearing live config is NOT in the manifest, so
# the manifest sweep cannot see it. Every apiKey value in the live global
# config must be an indirection ({env:} / {file:}) -- never a literal key.
# Fail-closed: publish stays blocked until Step 1 (move keys to env) is done.
function Assert-LiveApiKeyIndirection([string]$path) {
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $m = [regex]::Matches($raw, '"apiKey"\s*:\s*"([^"]*)"')
    foreach ($hit in $m) {
        $v = $hit.Groups[1].Value
        if ($v -cmatch '^(\{env:|\{file:)') { continue }
        throw "secret guard FAILED: live $path carries a literal apiKey value (move it to {env:} first)"
    }
}

# Drift guard for global/opencode.jsonc (H1 pipeline fix). The distro file
# stays canonical for providers and is never whole-copied; instead the
# carried sections (permissions, depth, MCP pins, providers-off list, small
# model, compaction, instructions) must match live after secret/path
# normalization. Any divergence fails closed with a manual-sync instruction.
function Assert-ConfigDrift([string]$livePath, [string]$distroPath) {
    $norm = {
        param([string]$p, [switch]$isLive)
        $t = Get-Content -LiteralPath $p -Raw -Encoding UTF8
        $t = ($t -split "`r?`n" | Where-Object { $_ -notmatch '^\s*//' }) -join "`n"
        $t = [regex]::Replace($t, ',(\s*[}\]])', '$1')
        $j = $t | ConvertFrom-Json
        $o = [ordered]@{
            permission = $j.permission
            subagent_depth = $j.subagent_depth
            mcp = $j.mcp
            disabled_providers = $j.disabled_providers
            small_model = $j.small_model
            compaction = $j.compaction
            instructions = $j.instructions
        }
        if ($isLive) {
            foreach ($srv in @($o.mcp | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name)) {
                $cmd = $o.mcp.$srv.command
                if ($cmd -is [array]) {
                    $o.mcp.$srv.command = @($cmd | ForEach-Object { if ($_ -like '*Obsidian Vault*') { 'YOUR_OBSIDIAN_VAULT_PATH' } else { $_ } })
                }
            }
        }
        $s = ($o | ConvertTo-Json -Depth 12 -Compress)
        if ($isLive) {
            $s = [regex]::Replace($s, '"apiKey":"[^"]*"', '"apiKey":"X"')
        }
        return $s
    }
    $sections = @('permission', 'subagent_depth', 'mcp', 'disabled_providers', 'small_model', 'compaction', 'instructions')
    $a = &$norm $livePath -isLive
    $b = &$norm $distroPath
    if ($a -ne $b) {
        $aj = $a | ConvertFrom-Json; $bj = $b | ConvertFrom-Json
        $diff = @($sections | Where-Object { (($aj.$_ | ConvertTo-Json -Depth 12 -Compress) -ne ($bj.$_ | ConvertTo-Json -Depth 12 -Compress)) })
        throw ("config drift FAILED: live global/opencode.jsonc vs distro disagree on: " + ($diff -join ', ') + " -- sync distro/global/opencode.jsonc manually (placeholders intact), then re-run")
    }
}

$dest = Resolve-DestRoot $DestRoot
$globalRoot = Join-Path $env:USERPROFILE '.config\opencode'

foreach ($p in @($globalRoot, $WorkspaceRoot, $dest)) {
    if (-not (Test-Path -LiteralPath $p)) { throw "required path missing: $p" }
}

# Fixed manifest: live source -> dest relative path. Whole-file copies only;
# global opencode.jsonc is deliberately NOT whole-copied (distro stays
# canonical for providers; carried sections are checked by Assert-ConfigDrift).
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
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $globalRoot 'instructions') -Filter '*.md' -File) {
    if ($f.Name -like '*.bak') { continue }
    $manifest += @{ src = $f.FullName; rel = ('global/instructions/' + $f.Name) }
}
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $globalRoot 'scripts') -File) {
    if ($f.Name -like '*.bak') { continue }
    if ($f.Name -like '*.test.ps1') { continue } # dev-only corpus tests: live-only, never published (their synthetic keys would trip the sweep and get redacted)
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
$livePlan = Get-Content -LiteralPath (Join-Path $globalRoot 'commands\plan.md') -Raw -Encoding UTF8
if ($livePlan -notmatch '\$ARGUMENTS') { throw 'guard FAILED: live plan.md lacks $ARGUMENTS -- fix live first' }
$livePlugin = Get-Content -LiteralPath (Join-Path $WorkspaceRoot '.opencode\plugins\token-report.js') -Raw -Encoding UTF8
if ($livePlugin -match '"experimental\.text\.complete"|PULL_ATTEMPTS|pending\.set|pending\.has') {
    throw 'guard FAILED: live token-report.js still has footer machinery -- fix live first'
}
$liveJsonc = Get-Content -LiteralPath (Join-Path $WorkspaceRoot 'opencode.jsonc') -Raw -Encoding UTF8
if ($liveJsonc -match '"instructions":\s*\["\.opencode/memory/\*\.md"\]') {
    throw 'guard FAILED: live opencode.jsonc still uses the *.md glob -- fix live first'
}

# Fail-closed key sweep on LIVE manifest sources, BEFORE any redaction.
# The post-sanitize assert below cannot catch a key class the sanitizer
# misses (redaction runs first), so live sources are swept here with the
# same pattern set. Machine paths are excluded: staging redacts them.
foreach ($m in $manifest) {
    if (-not (Test-Path -LiteralPath $m.src)) { throw "manifest source missing: $($m.src)" }
    Assert-NoLiveKeys $m.src
}

# Live key-bearing config: literal apiKeys fail the publish until moved to {env:}.
$liveConfig = Join-Path $globalRoot 'opencode.jsonc'
Assert-LiveApiKeyIndirection $liveConfig

# Drift guard: carried sections of the live config must match the distro copy.
Assert-ConfigDrift $liveConfig (Join-Path $dest 'global\opencode.jsonc')

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
    # live files keep their concrete defaults. Every staged file is rewritten
    # through an explicit writer so encoding is uniform (reads strip any BOM).
    # Matched keys become <REDACTED>: an obviously-invalid value. ({env:...}
    # is NOT used here -- an unset variable substitutes to an empty string,
    # silently turning a redacted key into an empty one.)
    foreach ($f in Get-ChildItem -LiteralPath $stage -Recurse -File) {
        $raw = Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8
        $clean = $raw
        foreach ($p in $KEY_PATTERNS) { $clean = $clean -creplace $p, '<REDACTED>' }
        $clean = $clean -replace [regex]::Escape($DEFAULT_DEST), '<WORKFLOW_DISTRO>'
        if ($f.Extension -match '^\.ps(m)?1$') { Write-StagedScript $f.FullName $clean }
        else { Write-StagedFile $f.FullName $clean }
    }

    # Fail-closed verification over staging.
    foreach ($f in Get-ChildItem -LiteralPath $stage -Recurse -File) { Assert-NoSecrets $f.FullName }
    $stagedJsonc = Get-Content -LiteralPath (Join-Path $stage 'project-template\opencode.jsonc') -Raw -Encoding UTF8
    if ($stagedJsonc -match '"instructions":\s*\[[^\]]*\*') { throw 'verify FAILED: staged instructions array contains a glob' }
    $stripped = ($stagedJsonc -split "`r?`n" | Where-Object { $_ -notmatch '^\s*//' }) -join "`n"
    try { $stripped | ConvertFrom-Json | Out-Null } catch { throw "verify FAILED: staged opencode.jsonc does not parse: $_" }
    $stagedPlan = Get-Content -LiteralPath (Join-Path $stage 'global\commands\plan.md') -Raw -Encoding UTF8
    if ($stagedPlan -notmatch '\$ARGUMENTS') { throw 'verify FAILED: staged plan.md lacks $ARGUMENTS' }
    $stagedPlugin = Get-Content -LiteralPath (Join-Path $stage 'project-template\.opencode\plugins\token-report.js') -Raw -Encoding UTF8
    if ($stagedPlugin -match '"experimental\.text\.complete"|PULL_ATTEMPTS|pending\.set|pending\.has') {
        throw 'verify FAILED: staged token-report.js still has footer machinery'
    }

    # README correction (idempotent guards -- skip silently if wording already new).
    $readmePath = Join-Path $dest 'README.md'
    if (($PSCmdlet.ShouldProcess($readmePath, 'README backfill')) -and (Test-Path -LiteralPath $readmePath)) {
        $readme = Get-Content -LiteralPath $readmePath -Raw -Encoding UTF8
        $updated = $readme
        $updated = $updated -replace '`instructions: \["\.opencode/memory/\*\.md"\]`', 'explicit `instructions` file list -- never a `*.md` glob, so archives stay unloaded'
        $updated = $updated -replace '- \*\*Per-response footer:\*\*[^\r\n]*\r?\n', ('- **Vault log only:** `.opencode/plugins/token-report.js` records real SDK token totals per assistant message (no footer injection, no polling).' + "`r`n")
        if ($updated -ne $readme) { Write-StagedFile $readmePath $updated }
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

    # MANIFEST.md (source map + shas + timestamp). Source paths are
    # relativized to portable roots -- machine paths must never reach the distro.
    $lines = @('# Publish manifest', '', '- Generated (UTC): ' + ((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')), '')
    foreach ($m in $manifest) {
        $srcPortable = $m.src -replace [regex]::Escape($globalRoot), '~/.config/opencode'
        $srcPortable = $srcPortable -replace [regex]::Escape($WorkspaceRoot), '<workspace>'
        $srcPortable = $srcPortable -replace '\\', '/'
        $lines += ('- `' + $srcPortable + '` -> `' + $m.rel + '`')
    }
    try {
        # Workspace HEAD only: proves what was published. The old "dest HEAD
        # (before)" line is dropped -- it describes pre-publish state and is
        # stale noise the moment anything commits.
        $wsSha = (git -C $WorkspaceRoot rev-parse --short HEAD 2>$null); if ($wsSha) { $lines += ('- workspace HEAD: ' + ($wsSha -join '')) }
    } catch {}
    $manifestPath = Join-Path $dest 'MANIFEST.md'
    $manifestText = ($lines -join "`r`n" + "`r`n")
    if ($manifestText -match 'C:\\Users\\[A-Za-z]+\\') { throw 'verify FAILED: manifest contains machine path' }
    if ($PSCmdlet.ShouldProcess($manifestPath, 'write manifest')) {
        Write-StagedFile $manifestPath $manifestText
    }

    Write-Output ("published $($manifest.Count) files to $dest")
    if (Test-Path -LiteralPath (Join-Path $dest '.git')) { $r = $dest } else { $r = Split-Path -Parent $dest }
    Write-Output '--- git status ---'
    git -C $r status --short 2>$null | Select-Object -First 20
} finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
