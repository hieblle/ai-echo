# Dashboard design proposals (Phase 3/4 exploration)

Visual directions for the KI-Barometer dashboard, built as static HTML
mockups with the real KPI structure from the app. Only the visual language
differs:

| File | Option | Direction |
| --- | --- | --- |
| `Main.dc.html` | A · Klar & Fokussiert | Light SaaS look close to the current app (system-ui, blue/green viz palette from `globals.css`); Merlin demo org |
| `DarkCockpit.dc.html` | B · Dark Cockpit | Dark analytics cockpit, large numerals (Space Grotesk + IBM Plex Sans); Merlin demo org |
| `WarmMenschlich.dc.html` | C · Warm & Menschlich | Warm cream tones, serif accents (Lora + Karla); Merlin demo org |
| `SoftGlass.dc.html` + `SoftGlassPulse.dc.html` | D · Soft UI (2026-09-26) | Rebuilt from a reference the user provided: square presentation frame on warm grey, flat light app window, floating left panel (navigation + survey drawer with stacked cards and paper previews), hairline progress bars, dot statuses, thin half-donut gauge, one yellow accent (Poppins). Tweak `presentationBlur` toggles the reference's deliberately blurred background elements. Org-level numbers are the real Moorbach values after D4.8; department rows and dates are illustrative. Second artboard: the pulse on a phone in the same look. Canvas: https://claude.ai/artifact/2UPA67HrKysPp9LWY3HjzP |

`canvas.json` is the layout manifest for the Claude Design canvas where
these were first published. The files are plain HTML and open in any
browser; the `<x-dc>` wrapper and the trailing script block are canvas
metadata and can be ignored when reading them as mockups.

Companion Figma file (to be populated with these artboards):
https://www.figma.com/design/kugtMn53f6SRupeYtF37v2

These mockups are design exploration only — they are not part of the
Next.js app and are not imported by any code. Phase 4 setup lives in
`docs/SETUP-PHASE4.md`.
