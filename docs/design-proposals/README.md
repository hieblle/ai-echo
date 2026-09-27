# Dashboard design proposals (Phase 3/4 exploration)

Visual directions for the KI-Barometer dashboard, built as static HTML
mockups with the real KPI structure from the app. Only the visual language
differs:

| File | Option | Direction |
| --- | --- | --- |
| `Main.dc.html` | A · Klar & Fokussiert | Light SaaS look close to the current app (system-ui, blue/green viz palette from `globals.css`); Merlin demo org |
| `DarkCockpit.dc.html` | B · Dark Cockpit | Dark analytics cockpit, large numerals (Space Grotesk + IBM Plex Sans); Merlin demo org |
| `WarmMenschlich.dc.html` | C · Warm & Menschlich | Warm cream tones, serif accents (Lora + Karla); Merlin demo org |
| `SoftGlass.dc.html` + `SoftGlassPulse.dc.html` | D · Soft UI (2026-09-27) | Mirrors a reference the user provided slot for slot: square presentation frame on warm grey, flat light app window, floating left panel (navigation + survey drawer with stacked cards and paper previews), three airy top cards, a four-row status table, thin half-donut gauge, one yellow accent (Poppins); tweak `presentationBlur` reproduces the reference's blurred background elements. Second artboard: the pulse on a phone. Canvas: https://claude.ai/artifact/2UPA67HrKysPp9LWY3HjzP |
| `Editorial.dc.html` + `EditorialPulse.dc.html` | E · Editorial Monochrom (2026-09-27) | Mirrors a second reference: cream container on dark, text-only navigation, free-standing hero headline with the lead KPI in display size, grouped bar chart (hatched vs. solid), recommendation rows like a contact list, date tiles with black active states, thin-divider schedule, one feedback card; Manrope, almost fully monochrome. Second artboard: the pulse on a phone. Same canvas as option D (right of it). |

Both were checked against the references as rendered PNGs (Playwright,
`scripts`-free scratch render) before publishing. The style comes first:
each reference slot carries the closest KI-Barometer fact (lead KPI = net
savings per month, alerts = recommendations, cost/revenue = licence vs.
savings per head, pipeline = departments, gauge = participation, events =
anonymous free texts). Org-level numbers are the real Moorbach values;
department rows, weekly series, dates and closed recommendations are
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
