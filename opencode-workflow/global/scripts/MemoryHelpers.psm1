# Memory Helper Functions
# Shared utilities for reverse-chronological memory with auto-archive

<#
.SYNOPSIS
Counts memory entries matching the standard date format.

.DESCRIPTION
Counts lines matching the pattern: YYYY-MM-DD — summary — why
Used to determine when archive threshold (50 entries) is reached.

.PARAMETER FilePath
Path to the memory file (decisions.md or errors.md)

.EXAMPLE
Get-MemoryEntryCount "C:\path\to\decisions.md"
Returns: 42
#>
function Get-MemoryEntryCount {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath
    )

    if (-not (Test-Path -LiteralPath $FilePath)) {
        return 0
    }

    $content = Get-Content -LiteralPath $FilePath -Raw
    if ([string]::IsNullOrWhiteSpace($content)) {
        return 0
    }

    # Match lines starting with YYYY-MM-DD — (em-dash U+2014)
    # Use [—\u2014-] to match em-dash, en-dash, or regular hyphen for compatibility
    $pattern = '^\d{4}-\d{2}-\d{2}\s+[—\u2014\-]'
    $matches = [regex]::Matches($content, $pattern, 'Multiline')
    return $matches.Count
}

<#
.SYNOPSIS
Prepends a new entry immediately after the header in a memory file.

.DESCRIPTION
Inserts the new entry at the top (newest-first), after the header section.
Header is assumed to be: # Title\n\nDescription paragraph\n\n

.PARAMETER FilePath
Path to the memory file

.PARAMETER Entry
The entry text to prepend (should include date and format)

.EXAMPLE
Add-MemoryEntryTop "C:\path\to\decisions.md" "2026-09-20 — New decision — rationale"
#>
function Add-MemoryEntryTop {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        
        [Parameter(Mandatory = $true)]
        [string]$Entry
    )

    if (-not (Test-Path -LiteralPath $FilePath)) {
        throw "File not found: $FilePath"
    }

    $content = Get-Content -LiteralPath $FilePath -Raw
    
    # Find the end of header (first blank line after title, then next blank line after description)
    # Typical structure:
    # # Decisions
    # 
    # Entries are appended at the top...
    # 
    # [entries start here]
    
    # Split by double newline to find header boundary
    $parts = $content -split '\r?\n\r?\n', 3
    
    if ($parts.Count -lt 3) {
        # No entries yet, just header - append after header
        $newContent = $content.TrimEnd() + "`n`n$Entry`n"
    } else {
        # Header (title + description) + existing entries
        $header = $parts[0] + "`n`n" + $parts[1]
        $existingEntries = $parts[2]
        $newContent = $header + "`n`n$Entry`n`n" + $existingEntries
    }

    Set-Content -LiteralPath $FilePath -Value $newContent -NoNewline
}

<#
.SYNOPSIS
Archives oldest entries when count exceeds threshold.

.DESCRIPTION
When a memory file has >50 entries, moves the oldest N entries to *_archive.md,
keeping the live file at ≤50 entries. Archive file uses append-only, oldest-first order.

.PARAMETER FilePath
Path to the memory file (decisions.md or errors.md)

.PARAMETER Threshold
Entry count threshold (default: 50)

.PARAMETER ArchivePath
Optional explicit archive path; defaults to FilePath with _archive suffix

.EXAMPLE
Invoke-MemoryArchive "C:\path\to\decisions.md" -Threshold 50
#>
function Invoke-MemoryArchive {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        
        [int]$Threshold = 50,
        
        [string]$ArchivePath = ""
    )

    try {
        $count = Get-MemoryEntryCount -FilePath $FilePath
        
        if ($count -le $Threshold) {
            return  # Nothing to archive
        }

        # Determine archive path
        if ([string]::IsNullOrWhiteSpace($ArchivePath)) {
            $dir = Split-Path -Parent $FilePath
            $name = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)
            $ext = [System.IO.Path]::GetExtension($FilePath)
            $ArchivePath = Join-Path $dir "${name}_archive${ext}"
        }

        $content = Get-Content -LiteralPath $FilePath -Raw
        $lines = $content -split '\r?\n'
        
        # Find all entry lines (lines starting with date pattern)
        $entryPattern = '^\d{4}-\d{2}-\d{2}\s+[—\u2014\-]'
        $entryIndices = @()
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match $entryPattern) {
                $entryIndices += $i
            }
        }

        if ($entryIndices.Count -le $Threshold) {
            return  # Double-check with actual line parsing
        }

        # Find header end (line before first entry)
        $firstEntryIndex = $entryIndices[0]
        $headerEndIndex = $firstEntryIndex - 1
        while ($headerEndIndex -gt 0 -and [string]::IsNullOrWhiteSpace($lines[$headerEndIndex])) {
            $headerEndIndex--
        }
        $headerEndIndex++  # Include the blank line after header

        # Extract header
        $header = ($lines[0..$headerEndIndex] | Where-Object { $_ -ne $null }) -join "`n"

        # Extract entries (keep newest $Threshold, archive the rest)
        $keepCount = [Math]::Min($Threshold, $entryIndices.Count)
        $archiveStartIndex = $entryIndices[$keepCount]
        
        $keptLines = $lines[$firstEntryIndex..($archiveStartIndex - 1)]
        $archivedLines = $lines[$archiveStartIndex..($lines.Count - 1)]
        
        # Filter out trailing empty lines from archived content
        while ($archivedLines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($archivedLines[-1])) {
            $archivedLines = $archivedLines[0..($archivedLines.Count - 2)]
        }

        # Write archive file (append to existing)
        if (Test-Path -LiteralPath $ArchivePath) {
            # Append to existing archive
            $archiveAddition = "`n" + ($archivedLines -join "`n")
            Add-Content -LiteralPath $ArchivePath -Value $archiveAddition -NoNewline
        } else {
            # Create new archive with header
            $baseName = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)
            $archiveHeader = "# $baseName Archive`n`nArchived entries (oldest first, append-only). This file is never auto-loaded."
            $archiveContent = $archiveHeader + "`n`n" + ($archivedLines -join "`n")
            Set-Content -LiteralPath $ArchivePath -Value $archiveContent -NoNewline
        }

        # Rewrite live file with kept entries
        $newContent = $header + "`n" + ($keptLines -join "`n") + "`n"
        Set-Content -LiteralPath $FilePath -Value $newContent -NoNewline

        $archivedCount = $entryIndices.Count - $keepCount
        Write-Host "Archived $archivedCount entries from $(Split-Path -Leaf $FilePath) to $(Split-Path -Leaf $ArchivePath)"

    } catch {
        Write-Warning "Archive operation failed for $FilePath : $_"
        Write-Warning "Continuing without archive (graceful degradation)"
    }
}

Export-ModuleMember -Function Get-MemoryEntryCount, Add-MemoryEntryTop, Invoke-MemoryArchive
