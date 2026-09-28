# Dashboard design proposals (Phase 3/4 exploration)

Visual directions for the KI-Barometer dashboard, built as static HTML
mockups with the real KPI structure from the app. Only the visual language
differs:

| File | Option | Direction |
| --- | --- | --- |
| `Main.dc.html` | A · Klar & Fokussiert | Light SaaS look close to the current app (system-ui, blue/green viz palette from `globals.css`); Merlin demo org |
| `DarkCockpit.dc.html` | B · Dark Cockpit | Dark analytics cockpit, large numerals (Space Grotesk + IBM Plex Sans); Merlin demo org |
| `WarmMenschlich.dc.html` | C · Warm & Menschlich | Warm cream tones, serif accents (Lora + Karla); Merlin demo org |
| `SoftGlass.dc.html` + `SoftGlassPulse.dc.html` | D · Soft UI (2026-09-27) | The CURRENT app dashboard (`components/dashboard/dashboard-view.tsx`, section for section: header, five index tiles, ROI, departments × dimensions, perception gap, recommendations, free texts) restyled with the tokens of a reference the user provided: light grey ground, floating white sidebar panel, translucent white cards with 20 px radius, Poppins light, tiny grey captions, thin 2.5 px bars, dot statuses, one yellow accent. Second artboard: the pulse on a phone. Canvas: https://claude.ai/artifact/2UPA67HrKysPp9LWY3HjzP |
| `Editorial.dc.html` + `EditorialPulse.dc.html` | E · Editorial Monochrom (2026-09-27) | The same current dashboard restyled with a second reference: cream ground, text-only top navigation, no boxes but hairline dividers, big display numbers, Manrope, two tones only (black on cream, grey for secondary), black pills for primary actions, white bordered cards only for recommendations and quotes. Second artboard: the pulse on a phone. Same canvas as option D (right of it). |

Structure is the app's own (the user preferred it over reference-driven
rearrangements); only the visual language changes. Both were checked as
rendered PNGs before publishing. Org-level numbers are the real Moorbach
values; department rows, baseline deltas and the closed recommendation are
illustrative.

`canvas.json` is the layout manifest for the Claude Design canvas where
these were first published. The files are plain HTML and open in any
browser; the `<x-dc>` wrapper and the trailing script block are canvas
metadata and can be ignored when reading them as mockups.

Companion Figma file (to be populated with these artboards):
https://www.figma.com/design/kugtMn53f6SRupeYtF37v2

These mockups are design exploration only — they are not part of the
Next.js app and are not imported by any code. Phase 4 setup lives in
`docs/SETUP-PHASE4.md`.
