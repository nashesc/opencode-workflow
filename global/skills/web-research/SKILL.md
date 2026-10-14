---
name: web-research
description: Use only when the user explicitly asks to research external info (search the web, look something up, deep dive) or shares a non-GitHub URL to read. Not for code, local files, or GitHub repos.
---

# Web Research (minimal)

Prefer built-in tools. Escalate to downloads only for YouTube transcripts.

## Read a page

Use the built-in page reader first. It handles public docs and articles.

## Search the web

Use the built-in web search for neutral topics. Prefer official docs
and primary sources; cite URLs in the answer.

## YouTube subtitles (yt-dlp 2026.08.19, pipx)

```powershell
yt-dlp --skip-download --write-sub --write-auto-sub --sub-langs en `
  --sub-format vtt -o "$env:TEMP\subs\%(id)s.%(ext)s" "<URL>"
```

- Do not combine with `--print`; it suppresses file output.
- Output lands in `$env:TEMP\subs` as `<id>.en.vtt`. Delete the folder
  after extracting what you need.
- Public videos only. No cookies, no login, no `--cookies-*` flags.

## Privacy rule

Never put proprietary code, secrets, tokens, or internal hostnames in
search queries or page URLs — they go to third parties. Paraphrase the
question into public terms before searching.

## Out of scope

- Not installed, never install: Exa/mcporter, Jina, `gh`, agent-reach CLI, OpenCLI, Playwright, cookie tools.
- Login-backed platforms (X, Reddit, Bilibili, LinkedIn, XiaoHongShu, Boss, Xueqiu): decline.
- GitHub repos are out of scope for this skill.
