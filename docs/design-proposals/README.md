# Dashboard design proposals (Phase 3/4 exploration)

Visual directions for the KI-Barometer dashboard, built as static HTML
mockups with the real KPI structure from the app. Only the visual language
differs:

| File | Option | Direction |
| --- | --- | --- |
| `Main.dc.html` | A · Klar & Fokussiert | Light SaaS look close to the current app (system-ui, blue/green viz palette from `globals.css`); Merlin demo org |
| `DarkCockpit.dc.html` | B · Dark Cockpit | Dark analytics cockpit, large numerals (Space Grotesk + IBM Plex Sans); Merlin demo org |
| `WarmMenschlich.dc.html` | C · Warm & Menschlich | Warm cream tones, serif accents (Lora + Karla); Merlin demo org |
| `SoftGlass.dc.html` + `SoftGlassPulse.dc.html` | D · Soft UI (2026-09-27) | From a reference the user provided: warm grey presentation frame, flat light app window, floating left panel (navigation + "current cycle" drawer), hairline bars, dot statuses, one yellow accent (Poppins). Second artboard: the employee home screen on a phone. Canvas: https://claude.ai/artifact/2UPA67HrKysPp9LWY3HjzP |
| `Editorial.dc.html` + `EditorialPulse.dc.html` | E · Editorial Monochrom (2026-09-27) | From a second reference: cream container on dark, text-only navigation, free-standing hero with the lead KPI in display size, thin dividers instead of cards, black active states; Manrope, almost fully monochrome. Second artboard: the employee home screen on a phone. Same canvas as option D (right of it). |

Options D and E share one information architecture, derived from what
`DashboardData` actually holds (see `lib/server/dashboard-service.ts`):

1. **Status** (top): current cycle with participation and the reminder
   action; the four indices with 6-week trend and delta to the baseline,
   plus participation; the ROI per head and scaled (D4.8) with tool usage
   next to licence cost.
2. **Where to act** (middle): open recommendations first with their trigger
   and actions; departments × dimensions with `n < 5` suppression and an
   org total row.
3. **Why** (bottom): perception gap (team vs. leadership) with NPS, free
   texts (anonymous, week only), tool usage and training wishes, each
   linked to the rule it feeds (R5, R4).

Org-level numbers are the real Moorbach values; department rows, weekly
series, dates and the closed recommendations are illustrative.

`canvas.json` is the layout manifest for the Claude Design canvas where
these were first published. The files are plain HTML and open in any
browser; the `<x-dc>` wrapper and the trailing script block are canvas
metadata and can be ignored when reading them as mockups.

Companion Figma file (to be populated with these artboards):
https://www.figma.com/design/kugtMn53f6SRupeYtF37v2

These mockups are design exploration only — they are not part of the
Next.js app and are not imported by any code. Phase 4 setup lives in
`docs/SETUP-PHASE4.md`.
