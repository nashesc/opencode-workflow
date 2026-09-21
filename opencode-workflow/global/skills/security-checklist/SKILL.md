---
name: security-checklist
description: Security categories to check during a security pass — injection, auth, secrets, data exposure. Load when running a security review or when the security agent runs.
---

# Security Checklist

Check changes against these categories. Report findings as CRITICAL /
HIGH / MEDIUM / LOW.

- **Injection** — SQL, command, template, or query injection points from
  unsanitized input
- **Auth & access control** — missing checks, privilege escalation paths,
  broken session handling
- **Secrets** — hardcoded keys, tokens, or credentials; secrets logged or
  exposed in responses
- **Data exposure** — sensitive fields returned in API responses that
  shouldn't be, verbose error messages leaking internals
- **Dependency risk** — new dependencies with known CVEs or excessive
  permissions
- **Input validation** — missing or client-only validation on anything
  crossing a trust boundary

A project can define its own `security-checklist` skill under
`.opencode/skills/` to add project-specific concerns (e.g. "this project
handles PII, check every new field against the retention policy"). That
version takes precedence over this global default.
