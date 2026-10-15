<#
.SYNOPSIS
  File-direct vault mirror for memory entries (no MCP, no restart).

.DESCRIPTION
  Prepends one entry to OpenCode/Decisions.md (or Errors.md) inside the
  Obsidian vault on disk, then archives when count exceeds 50. Used by
  /end-session Step 3 so the vault mirror works while the obsidian MCP
  stays disabled (token gate). Idempotent: an entry already present
  (first-60-chars match) is skipped, so reruns are no-ops.
  Never throws: warnings only, exit 0, so the session is never blocked.

.PARAMETER Entry
  One-line entry: YYYY-MM-DD - summary - rationale (em-dash preferred).

.PARAMETER Type
  decisions or errors. Maps to Decisions.md / Errors.md (+ *_archive.md).

.PARAMETER VaultDir
  Defaults to "$HOME\Documents\Obsidian Vault\OpenCode".

.EXAMPLE
  powershell -NoProfile -NonInteractive -File Mirror-Memory.ps1 -Entry "2026-10-15 - ... - ..." -Type decisions
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Entry,
  [Parameter(Mandatory = $true)][ValidateSet("decisions", "errors")][string]$Type,
  [string]$VaultDir = ""
)

$ErrorActionPreference = "Continue"

try {
  if ([string]::IsNullOrWhiteSpace($VaultDir)) {
    $VaultDir = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Obsidian Vault\OpenCode"
  }
  $fileName = if ($Type -eq "decisions") { "Decisions.md" } else { "Errors.md" }
  $target = Join-Path $VaultDir $fileName

  Import-Module "$env:USERPROFILE\.config\opencode\scripts\MemoryHelpers.psm1" -Force

  if (-not (Test-Path -LiteralPath $VaultDir)) {
    New-Item -ItemType Directory -Path $VaultDir -Force | Out-Null
  }
  if (-not (Test-Path -LiteralPath $target)) {
    $title = if ($Type -eq "decisions") { "# Decisions" } else { "# Errors" }
    $desc = "Entries are prepended at the top (newest first), auto-archived after 50 entries."
    $header = "$title`n`n$desc`n`n"
    [IO.File]::WriteAllText($target, $header, [Text.UTF8Encoding]::new($false))
    Write-Host "Created $fileName"
  }

  # Idempotency: skip when the entry head already exists anywhere in the file.
  $key = if ($Entry.Length -gt 60) { $Entry.Substring(0, 60) } else { $Entry }
  $existing = [IO.File]::ReadAllText($target, [Text.Encoding]::UTF8)
  if ($existing.Contains($key)) {
    Write-Host "Already present in $fileName - skipped."
    exit 0
  }

  # Header-aware prepend: clean "# Title" header in first 5 lines -> helper;
  # otherwise (legacy degraded files) insert at line 1 to keep newest-first.
  $head = $existing -split '\r?\n' | Select-Object -First 5
  $hasHeader = $false
  foreach ($h in $head) { if ($h -match '^\s*#\s+(Decisions|Errors)') { $hasHeader = $true } }
  if ($hasHeader) {
    Add-MemoryEntryTop -FilePath $target -Entry $Entry
  } else {
    [IO.File]::WriteAllText($target, "$Entry`n`n$existing", [Text.UTF8Encoding]::new($false))
  }

  $count = Get-MemoryEntryCount -FilePath $target
  if ($count -gt 50) {
    Invoke-MemoryArchive -FilePath $target -Threshold 50
    Write-Host "Mirrored to $fileName ($count entries, archive check ran)."
  } else {
    Write-Host "Mirrored to $fileName ($count entries)."
  }
  exit 0
} catch {
  Write-Warning "Mirror-Memory failed (non-blocking): $_"
  exit 0
}
