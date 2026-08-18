"use client";

/**
 * Renders the input control for one survey question (mobile-first: large
 * touch targets, one question per screen — SPEC.md §9 UX rules).
 * Controlled component: value/onChange with the typed AnswerValue.
 */

import { choiceLabel, scaleAnchors } from "@/lib/domain/text";
import { cn } from "@/lib/utils";
import type {
  AnswerValue,
  Choice,
  FormOfAddress,
  Question,
} from "@/lib/types";

interface QuestionInputProps {
  question: Question;
  form: FormOfAddress;
  /** Resolved tool rows for tool_matrix questions. */
  toolChoices: Choice[];
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
}

const optionButton =
  "w-full rounded-lg border px-4 py-3 text-left text-base transition-colors " +
  "active:scale-[0.99] hover:bg-accent";
const optionButtonSelected =
  "border-primary bg-primary text-primary-foreground hover:bg-primary";

const textFieldClasses =
  "w-full rounded-lg border bg-background px-4 py-3 text-base " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ScaleButtons({
  min,
  max,
  value,
  onSelect,
  minLabel,
  maxLabel,
}: {
  min: number;
  max: number;
  value: number | undefined;
  onSelect: (v: number) => void;
  minLabel?: string;
  maxLabel?: string;
}) {
  const steps: number[] = [];
  for (let v = min; v <= max; v++) steps.push(v);
  return (
    <div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
        {steps.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onSelect(v)}
            className={cn(
              "h-12 rounded-lg border text-base font-medium transition-colors hover:bg-accent",
              value === v && optionButtonSelected,
            )}
          >
            {v > 0 && min < 0 ? `+${v}` : v}
          </button>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>
            {min}&nbsp;=&nbsp;{minLabel}
          </span>
          <span>
            {max}&nbsp;=&nbsp;{maxLabel}
          </span>
        </div>
      )}
    </div>
  );
}

export function QuestionInput({
  question: q,
  form,
  toolChoices,
  value,
  onChange,
}: QuestionInputProps) {
  switch (q.type) {
    case "single_choice": {
      if (q.options?.kind !== "choices") return null;
      const current = value?.kind === "choice" ? value : undefined;
      const followup = q.options.followup_scale;
      return (
        <div className="space-y-2">
          {q.options.choices.map((c) => {
            const selected = current?.value === c.value;
            return (
              <div key={c.value}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    // Re-tapping the selected option must not wipe typed
                    // text / the follow-up scale; switching values must.
                    if (!selected) onChange({ kind: "choice", value: c.value });
                  }}
                  className={cn(optionButton, selected && optionButtonSelected)}
                >
                  {choiceLabel(c, form)}
                </button>
                {selected && c.allows_text && (
                  <input
                    type="text"
                    autoFocus
                    placeholder={
                      form === "sie"
                        ? "Optional – keine Angaben, die Sie identifizieren"
                        : "Optional – keine Angaben, die dich identifizieren"
                    }
                    className={cn(textFieldClasses, "mt-2")}
                    value={current?.text ?? ""}
                    onChange={(e) =>
                      onChange({
                        kind: "choice",
                        value: c.value,
                        ...(e.target.value ? { text: e.target.value } : {}),
                        ...(current?.scale !== undefined
                          ? { scale: current.scale }
                          : {}),
                      })
                    }
                  />
                )}
              </div>
            );
          })}
          {followup && current?.value === followup.on_value && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-2 text-sm font-medium">
                {form === "sie" && followup.text_sie
                  ? followup.text_sie
                  : followup.text}
              </p>
              <ScaleButtons
                min={1}
                max={10}
                value={current.scale}
                onSelect={(v) =>
                  onChange({
                    kind: "choice",
                    value: current.value,
                    ...(current.text ? { text: current.text } : {}),
                    scale: v,
                  })
                }
              />
            </div>
          )}
        </div>
      );
    }

    case "multi_choice": {
      if (q.options?.kind !== "choices") return null;
      const current = value?.kind === "choices" ? value : undefined;
      const selectedValues = current?.values ?? [];
      const byValue = new Map(q.options.choices.map((c) => [c.value, c]));
      const toggle = (c: Choice) => {
        let next: string[];
        if (selectedValues.includes(c.value)) {
          next = selectedValues.filter((v) => v !== c.value);
        } else if (c.exclusive) {
          next = [c.value]; // exclusive clears everything else
        } else {
          next = [
            ...selectedValues.filter((v) => !byValue.get(v)?.exclusive),
            c.value,
          ];
        }
        if (next.length === 0) {
          onChange(undefined);
          return;
        }
        const keepText = next.some((v) => byValue.get(v)?.allows_text);
        onChange({
          kind: "choices",
          values: next,
          ...(keepText && current?.other_text
            ? { other_text: current.other_text }
            : {}),
        });
      };
      const showText = selectedValues.some((v) => byValue.get(v)?.allows_text);
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Mehrfachauswahl möglich</p>
          {q.options.choices.map((c) => {
            const selected = selectedValues.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(c)}
                className={cn(
                  optionButton,
                  "flex items-center gap-3",
                  selected && optionButtonSelected,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs",
                    selected
                      ? "border-primary-foreground"
                      : "border-muted-foreground",
                  )}
                >
                  {selected ? "✓" : ""}
                </span>
                {choiceLabel(c, form)}
              </button>
            );
          })}
          {showText && (
            <input
              type="text"
              placeholder={
                form === "sie"
                  ? "Optional – keine Angaben, die Sie identifizieren"
                  : "Optional – keine Angaben, die dich identifizieren"
              }
              className={textFieldClasses}
              value={current?.other_text ?? ""}
              onChange={(e) =>
                current &&
                onChange({
                  kind: "choices",
                  values: current.values,
                  ...(e.target.value ? { other_text: e.target.value } : {}),
                })
              }
            />
          )}
        </div>
      );
    }

    case "scale_1_10":
    case "scale_0_10":
    case "scale_minus5_plus5": {
      const opts = q.options?.kind === "scale" ? q.options : null;
      const min =
        opts?.min ?? (q.type === "scale_0_10" ? 0 : q.type === "scale_minus5_plus5" ? -5 : 1);
      const max = opts?.max ?? (q.type === "scale_minus5_plus5" ? 5 : 10);
      const anchors = opts ? scaleAnchors(opts, form) : null;
      return (
        <ScaleButtons
          min={min}
          max={max}
          value={value?.kind === "scale" ? value.value : undefined}
          onSelect={(v) => onChange({ kind: "scale", value: v })}
          minLabel={anchors?.min}
          maxLabel={anchors?.max}
        />
      );
    }

    case "number":
    case "currency": {
      const unit = q.options?.kind === "number" ? q.options.unit : null;
      const current = value?.kind === "number" ? value.value : undefined;
      return (
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="decimal"
            min={q.options?.kind === "number" ? (q.options.min ?? 0) : 0}
            step="any"
            placeholder="0"
            className={cn(textFieldClasses, "max-w-40 text-lg")}
            value={current ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange(undefined);
                return;
              }
              const parsed = Number(raw);
              if (Number.isFinite(parsed)) {
                onChange({ kind: "number", value: parsed });
              }
            }}
          />
          {unit && <span className="text-base text-muted-foreground">{unit}</span>}
        </div>
      );
    }

    case "text_optional": {
      return (
        <textarea
          rows={4}
          placeholder={
            form === "sie"
              ? "Ihre Antwort (optional)…"
              : "Deine Antwort (optional)…"
          }
          className={textFieldClasses}
          value={value?.kind === "text" ? value.value : ""}
          onChange={(e) =>
            onChange(
              e.target.value.trim().length > 0
                ? { kind: "text", value: e.target.value }
                : undefined,
            )
          }
        />
      );
    }

    case "tool_matrix": {
      const current = value?.kind === "tool_matrix" ? value : undefined;
      const rowFor = (tool: string) =>
        current?.tools.find((t) => t.tool === tool);
      const update = (
        tool: string,
        patch: Partial<{ usefulness: number; uses_per_week: number }>,
      ) => {
        const others = current?.tools.filter((t) => t.tool !== tool) ?? [];
        const existing = rowFor(tool);
        const nextRow = {
          tool,
          usefulness: patch.usefulness ?? existing?.usefulness ?? 0,
          uses_per_week: patch.uses_per_week ?? existing?.uses_per_week ?? 0,
        };
        onChange({ kind: "tool_matrix", tools: [...others, nextRow] });
      };
      return (
        <div className="space-y-6">
          {toolChoices.map((c) => {
            const row = rowFor(c.value);
            return (
              <div key={c.value} className="rounded-lg border p-4">
                <p className="mb-3 font-medium">{choiceLabel(c, form)}</p>
                <p className="mb-1 text-xs text-muted-foreground">
                  Nützlichkeit (1–10)
                </p>
                <ScaleButtons
                  min={1}
                  max={10}
                  value={row && row.usefulness > 0 ? row.usefulness : undefined}
                  onSelect={(v) => update(c.value, { usefulness: v })}
                />
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Nutzungen/Woche:</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={500}
                    className={cn(textFieldClasses, "max-w-24 py-2")}
                    value={row?.uses_per_week ?? ""}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      // Clamp to the server's accepted range (0..500).
                      const clamped =
                        Number.isFinite(parsed) && parsed >= 0
                          ? Math.min(parsed, 500)
                          : 0;
                      update(c.value, { uses_per_week: clamped });
                    }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      );
    }
  }
}

/** Whether the current value is a complete, submittable answer. */
export function isAnswerComplete(
  q: Question,
  value: AnswerValue | undefined,
  toolChoices: Choice[],
): boolean {
  if (!value) return false;
  switch (q.type) {
    case "single_choice": {
      if (value.kind !== "choice") return false;
      const followup =
        q.options?.kind === "choices" ? q.options.followup_scale : undefined;
      if (followup && value.value === followup.on_value) {
        return value.scale !== undefined;
      }
      return true;
    }
    case "multi_choice":
      return value.kind === "choices" && value.values.length > 0;
    case "scale_1_10":
    case "scale_0_10":
    case "scale_minus5_plus5":
      return value.kind === "scale";
    case "number":
    case "currency":
      return value.kind === "number";
    case "text_optional":
      return value.kind === "text" && value.value.trim().length > 0;
    case "tool_matrix":
      return (
        value.kind === "tool_matrix" &&
        toolChoices.length > 0 &&
        toolChoices.every((c) =>
          value.tools.some((t) => t.tool === c.value && t.usefulness >= 1),
        )
      );
  }
}
