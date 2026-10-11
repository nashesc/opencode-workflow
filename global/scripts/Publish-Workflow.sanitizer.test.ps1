# Publish-Workflow.sanitizer.test.ps1 — corpus test for the publish sanitizer.
#
# Parses $KEY_PATTERNS out of Publish-Workflow.ps1 via AST (never executes
# the publisher) and asserts benign strings pass while known key shapes trip.
# Run: powershell -NoProfile -File Publish-Workflow.sanitizer.test.ps1
# Exit 0 = all green, 1 = failure. No Pester dependency (3.4-safe).

$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'Publish-Workflow.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { Write-Output "AST parse errors:"; $errors | ForEach-Object { Write-Output $_.Message }; exit 1 }

$assign = $ast.FindAll({
    param($n)
    $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and
    $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and
    $n.Left.VariablePath.UserPath -eq 'KEY_PATTERNS'
}, $true) | Select-Object -First 1
if (-not $assign) { Write-Output 'FAIL: $KEY_PATTERNS assignment not found'; exit 1 }
$KEY_PATTERNS = Invoke-Expression $assign.Right.Extent.Text

function Test-HasKey([string]$raw) {
    foreach ($p in $KEY_PATTERNS) { if ($raw -cmatch $p) { return $true } }
    return $false
}

# Must NOT match: ordinary hyphenated prose + placeholders.
$benign = @(
    'risk-based-approach',
    'mask-sensitive-fields',
    'disk-usage-report',
    'task-level-specificity',
    'Use the feature name as the consistent commit scope.',
    'YOUR_OBSIDIAN_VAULT_PATH',
    'YOUR_API_KEY_HERE',
    '<REDACTED>',
    '{env:MY_API_KEY}',
    '{file:~/.secrets/key}',
    '<WORKFLOW_DISTRO>\opencode-workflow',
    'src/user.keys.ts',
    'keyframes.css',
    'npm_install_rollback'
)

# Must match: every covered key shape (synthetic values, real shapes).
# Stored as split prefix+body pairs and joined at runtime so this file
# itself contains no sweep-tripping literal (the live key sweep runs over
# scripts/ and must stay green; the publisher also excludes *.test.ps1).
$keyParts = @(
    @('sk-', '75dc514b4d56c40af76ju39933ad8eeee'),
    @('sk-', 'or-v1-abc123def456789xyz0000000000'),
    @('sk-', 'ant-abc123def456789xyz0000000000'),
    @('sk_live_', 'abc123def456789xyz0000000000'),
    @('ghp_', 'abc123def456789xyz00000000000000000000'),
    @('gho_', 'abc123def456789xyz00000000000000000000'),
    @('ghu_', 'abc123def456789xyz00000000000000000000'),
    @('glpat-', 'abc123def456789xyz00'),
    @('npm_', 'abc123def456789xyz00000000000000000000'),
    @('rk_live_', 'abc123def456789xyz0000000000'),
    @('ya29.', 'abc123def456789xyz0000000000'),
    @('github_pat_', 'abc123def456789xyz00000000000000000000000000000000000000000000'),
    @('ghs_', 'abc123def456789xyz00000000000000000000'),
    @('AIza', 'abc123def456789xyz0000000000000000000'),
    @('xoxb-', 'abc123def456789xyz-000000000000'),
    @('xoxp-', 'abc123def456789xyz-000000000000'),
    @('xoxa-', 'abc123def456789xyz-000000000000'),
    @('xoxr-', 'abc123def456789xyz-000000000000'),
    @('xoxs-', 'abc123def456789xyz00000000000000'),
    @('hf_', 'abc123def456789xyz0000000000000000'),
    @('AKIA', 'IOSFODNN7EXAMPLE')
)
$keys = @($keyParts | ForEach-Object { $_[0] + $_[1] })

$fail = 0
foreach ($b in $benign) {
    if (Test-HasKey $b) { Write-Output "FALSE-POSITIVE: $b"; $fail++ }
}
foreach ($k in $keys) {
    if (-not (Test-HasKey $k)) { Write-Output "MISSED-KEY: $k"; $fail++ }
}

# Placeholder + case-sensitivity contract on the publisher itself.
$src = Get-Content -LiteralPath $scriptPath -Raw -Encoding UTF8
if ($src -cmatch '\{env:REDACTED\}') { Write-Output 'FAIL: publisher still uses {env:REDACTED} placeholder'; $fail++ }
if ($src -notmatch "'<REDACTED>'") { Write-Output 'FAIL: publisher missing <REDACTED> placeholder'; $fail++ }
if ($src -notmatch '-cmatch \$p') { Write-Output 'FAIL: Test-HasKey not case-sensitive'; $fail++ }
if ($src -notmatch '-creplace \$p') { Write-Output 'FAIL: redaction not case-sensitive'; $fail++ }

if ($fail -gt 0) { Write-Output "SANITIZER-TEST: $fail failure(s)"; exit 1 }
Write-Output ("SANITIZER-TEST: green ({0} benign + {1} keys)" -f $benign.Count, $keys.Count)
exit 0
