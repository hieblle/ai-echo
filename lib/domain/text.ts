/**
 * Du/Sie text resolution (pure, no IO).
 *
 * UI copy is German; Du is the default and Sie is an org setting
 * (`organizations.form_of_address`, SPEC.md §14 / CLAUDE.md). Seeds carry the
 * Sie variant in `text_sie` / `label_sie` / `*_sie`; missing variants fall
 * back to the Du form.
 */

import type { Choice, FormOfAddress, Question } from "@/lib/types";

export function questionText(q: Question, form: FormOfAddress): string {
  return form === "sie" && q.text_sie ? q.text_sie : q.text;
}

export function choiceLabel(c: Choice, form: FormOfAddress): string {
  return form === "sie" && c.label_sie ? c.label_sie : c.label;
}

export function scaleAnchors(
  options: Extract<NonNullable<Question["options"]>, { kind: "scale" }>,
  form: FormOfAddress,
): { min: string; max: string } {
  return {
    min:
      form === "sie" && options.min_label_sie
        ? options.min_label_sie
        : options.min_label,
    max:
      form === "sie" && options.max_label_sie
        ? options.max_label_sie
        : options.max_label,
  };
}
