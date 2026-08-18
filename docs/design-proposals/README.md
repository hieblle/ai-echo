# Dashboard design proposals (Phase 3 exploration)

Three visual directions for the KI-Barometer dashboard, built as static
HTML mockups with identical content (real KPI structure from the app,
Merlin demo org). Only the visual language differs:

| File | Option | Direction |
| --- | --- | --- |
| `Main.dc.html` | A · Klar & Fokussiert | Light SaaS look close to the current app (system-ui, blue/green viz palette from `globals.css`) |
| `DarkCockpit.dc.html` | B · Dark Cockpit | Dark analytics cockpit, large numerals (Space Grotesk + IBM Plex Sans) |
| `WarmMenschlich.dc.html` | C · Warm & Menschlich | Warm cream tones, serif accents (Lora + Karla) |

`canvas.json` is the layout manifest for the Claude Design canvas where
these were first published. The files are plain HTML and open in any
browser; the `<x-dc>` wrapper and the trailing script block are canvas
metadata and can be ignored when reading them as mockups.

Companion Figma file (to be populated with these artboards):
https://www.figma.com/design/kugtMn53f6SRupeYtF37v2

These mockups are design exploration only — they are not part of the
Next.js app and are not imported by any code.
