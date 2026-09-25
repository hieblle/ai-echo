/**
 * Minimal form primitives for the admin pages (server-rendered forms with
 * server actions — no client state).
 */

import { cn } from "@/lib/utils";

export const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

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
  tone: "ok" | "err";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "err" ? "alert" : "status"}
      className={cn(
        "rounded-lg border p-3 text-sm",
        tone === "err"
          ? "border-destructive bg-destructive/10 text-destructive"
          : "border-primary/40 bg-primary/5",
      )}
    >
      {children}
    </p>
  );
}
