/**
 * Minimal form primitives for the admin pages (server-rendered forms with
 * server actions — no client state), styled for design D.
 */

import { cn } from "@/lib/utils";

export const inputClass =
  "h-10 w-full rounded-xl border border-input bg-white px-3 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "ok" | "err" | "info";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "err" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-2xl px-4 py-3 text-sm",
        tone === "err" && "bg-[#fbe9e9] text-[#8a3b3b]",
        tone === "ok" && "bg-white shadow-soft",
        tone === "info" && "bg-white/60 text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className="status-dot mt-1.5"
        style={{
          background:
            tone === "err"
              ? "var(--status-alert)"
              : tone === "ok"
                ? "var(--accent-yellow)"
                : "hsl(var(--tertiary-foreground))",
        }}
      />
      <span>{children}</span>
    </p>
  );
}

/** Section card used by the admin pages: title, optional lead text, body. */
export function SectionCard({
  id,
  step,
  title,
  lead,
  aside,
  children,
  className,
}: {
  id?: string;
  step?: string;
  title: string;
  lead?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("card-soft scroll-mt-6 p-6", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-medium">
            {step && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {step}
              </span>
            )}
            {title}
          </h2>
          {lead && <p className="max-w-2xl text-sm text-muted-foreground">{lead}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
