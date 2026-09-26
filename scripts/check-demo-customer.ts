#!/usr/bin/env tsx
/**
 * Prints what the dashboard of an org in the REAL database would show —
 * a quick sanity check after `pnpm seed:demo` (or for any customer slug).
 *
 *   pnpm check:org            → the showcase customer (moorbach)
 *   pnpm check:org <slug>
 */

import { SupabaseStore } from "@/lib/data/supabase-store";
import { QUESTIONS } from "@/lib/seed/questions";
import { RECOMMENDATION_RULES } from "@/lib/seed/rules";
import { getDashboardData } from "@/lib/server/dashboard-service";
import { getSupabaseEnv } from "@/lib/server/env";

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)} %`);
const one = (v: number | null) => (v === null ? "–" : v.toFixed(1));

async function main() {
  const slug = process.argv[2] ?? "moorbach";
  const env = getSupabaseEnv();
  if (!env) {
    console.error("Supabase is not configured — see .env.example");
    process.exit(1);
  }
  const store = new SupabaseStore({
    url: env.url,
    secretKey: env.secretKey,
    questions: QUESTIONS,
    rules: RECOMMENDATION_RULES,
  });

  const data = await getDashboardData(store, slug);
  if (!data) {
    console.error(`no organization with slug "${slug}"`);
    process.exit(1);
  }
  const latest = data.history[data.history.length - 1];
  const members = await store.listMemberships(data.org.id);
  const cycles = await store.listCycles(data.org.id);

  console.log(`${data.org.name} (/${data.org.slug}) · ${data.org.form_of_address} · k = ${data.org.k_anonymity_min}`);
  console.log(`Mitglieder: ${members.filter((m) => m.status !== "removed").length} · Zyklen: ${cycles.length} (offen: ${cycles.filter((c) => c.status === "open").length})`);
  console.log(`Wochen: ${data.weeks.length} (${data.weeks[0]} – ${data.weeks[data.weeks.length - 1]}) · Antworten gesamt: ${data.totalResponses}`);
  console.log(`Adoption ${pct(data.adoption.current)} · Effizienz ${one(data.efficiencyCombined)} · Vertrauen ${one(latest?.trust_index ?? null)} · Stimmung ${one(latest?.sentiment_index ?? null)} · Teilnahme ${pct(latest?.participation_rate ?? null)}`);
  console.log(`ROI: ${Math.round(data.roi.net_savings_eur)} € netto/Monat · ${data.roi.roi_multiple?.toFixed(1) ?? "–"}× · ${Math.round(data.roi.saved_hours)} h`);
  console.log(`Gap: ${data.gapPairs.map((g) => `${g.pair} ${g.gap === null ? "–" : g.gap.toFixed(1)}`).join(" · ")} · NPS ${data.nps ? data.nps.value : "–"}`);
  const suppressed = data.departments.filter((d) =>
    data.heatmap.filter((c) => c.department_id === d.id).every((c) => c.suppressed || c.value === null),
  );
  console.log(`Heatmap unterdrückt (n < k): ${suppressed.map((d) => d.name).join(", ") || "keine"}`);
  console.log(`Empfehlungen: ${data.recommendations.map((r) => `${r.rule.key}${r.context ? `(${r.context})` : ""}`).join(", ") || "keine"}`);
  console.log(`Freitexte: ${data.freeTexts.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
