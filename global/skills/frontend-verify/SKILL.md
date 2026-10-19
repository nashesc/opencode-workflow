---
name: frontend-verify
description: Verify UI in a running app - responsive widths, keyboard/focus, console errors, loading/empty/error states, a11y. Load after any frontend change.
---

# Frontend Verify

Run the dev server first. Browser checks need the `playwright` MCP: enable it for this task only (it is off by default for token cost); if unavailable, list the checks for the user instead of claiming them.

- **Widths:** 360, 768, 1280. No horizontal scroll, no clipped or overlapping content.
- **States:** loading, empty, error, and long-content variants exist and render.
- **Keyboard:** tab order follows visual order; focus visible; Esc closes modals/menus; no keyboard trap.
- **Console:** zero errors/warnings from the changed screens.
- **A11y basics:** labels on inputs, alt text on meaningful images, contrast on new colors, semantic elements over div-buttons.
- **Motion:** animations respect `prefers-reduced-motion`; no layout shift on load.
- **Data:** no fetch on every render; failed requests show a message, not a blank screen.

Report pass/fail per check with one line of evidence. Screenshots only on request (token cost). Disable the MCP again when done.
