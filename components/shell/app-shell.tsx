"use client";

/**
 * App shell in design D (DECISIONS D4.9): a floating sidebar panel on the
 * left with the primary navigation (collapsible to an icon rail), and a
 * secondary panel that slides out next to it with the viewer's surveys as
 * stacked cards — like the reference's "Files Management" drawer. Below the
 * `lg` breakpoint the same content lives in a slide-in menu behind a
 * hamburger. Survey routes render "focused": no sidebar, one slim bar.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Home,
  LayoutDashboard,
  Lock,
  Menu,
  Settings,
  Shield,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ShellData,
  ShellIcon,
  ShellNavItem,
  ShellOrg,
  ShellSurveyItem,
} from "./types";

const ICONS: Record<ShellIcon, LucideIcon> = {
  home: Home,
  dashboard: LayoutDashboard,
  copilot: Bot,
  surveys: ClipboardCheck,
  report: FileText,
  members: Users,
  settings: Settings,
  platform: Shield,
  demo: Sparkles,
};

const STORAGE_COLLAPSED = "kib.sidebar.collapsed";
const STORAGE_DRAWER = "kib.sidebar.drawer";

/** Per-viewer convenience only (localStorage may be unavailable). */
function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === "1") setValue(true);
      if (raw === "0") setValue(false);
    } catch {
      /* private mode etc. — keep the default */
    }
  }, [key]);
  const set = (v: boolean) => {
    setValue(v);
    try {
      window.localStorage.setItem(key, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  return [value, set];
}

function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className}
    >
      <circle cx="6" cy="9" r="4.2" fill="var(--accent-yellow)" />
      <circle cx="10.5" cy="6" r="2.6" fill="currentColor" />
    </svg>
  );
}

function isActive(item: ShellNavItem, pathname: string): boolean {
  if (!item.href) return false;
  const path = item.href.split("#")[0] ?? "";
  if (item.href.includes("#")) return false;
  if (item.exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function startsWithPath(pathname: string, href: string): boolean {
  const path = href.split("#")[0] ?? "";
  return path !== "" && (pathname === path || pathname.startsWith(`${path}/`));
}

/** The org the current page belongs to: by base prefix, else by one of its links. */
function currentOrg(data: ShellData, pathname: string): ShellOrg | null {
  const byBase = data.orgs.find(
    (o) =>
      startsWithPath(pathname, o.base) ||
      o.paths?.some((p) => startsWithPath(pathname, p)),
  );
  if (byBase) return byBase;
  const byNav = data.orgs.find((o) =>
    o.nav.some((item) => item.href && startsWithPath(pathname, item.href)),
  );
  return byNav ?? data.orgs[0] ?? null;
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: ShellNavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href ?? "#"}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex h-10 items-center gap-3 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-white/70 hover:text-foreground",
        active && "bg-white text-foreground shadow-pill",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge && (
        <span className="text-[11px] text-muted-foreground">{item.badge}</span>
      )}
    </Link>
  );
}

function SurveyCard({ item }: { item: ShellSurveyItem }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-snug">{item.title}</p>
        <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{item.hint}</p>
      </div>
      {item.state === "due" && <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />}
      {item.state === "done" && <Check className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--viz-delta-good)" }} />}
      {item.state === "locked" && <Lock className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />}
    </>
  );
  const base =
    "flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors";
  if (item.state === "due" && item.href) {
    return (
      <Link href={item.href} className={cn(base, "card-solid hover:bg-white/90")}>
        <span className="status-dot" style={{ background: "var(--accent-yellow)" }} aria-hidden />
        {body}
      </Link>
    );
  }
  return (
    <div className={cn(base, "bg-white/60", item.state !== "done" && "text-muted-foreground")}>
      {body}
    </div>
  );
}

function Drawer({
  org,
  onClose,
  inline,
}: {
  org: ShellOrg;
  onClose?: () => void;
  inline?: boolean;
}) {
  const due = org.surveys.filter((s) => s.state === "due").length;
  const insight = org.insight;
  return (
    <section
      aria-label="Befragungen"
      className={cn(
        "flex flex-col gap-3 bg-panel-2 p-4",
        inline ? "rounded-[18px]" : "h-full w-[232px] shrink-0 overflow-y-auto",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!inline && <ArrowLeft className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />}
          <h2 className="text-base font-medium">Befragungen</h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Befragungen schließen"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-pill hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {org.name} · {due === 0 ? "nichts offen" : `${due} offen`}
      </p>
      {insight && (
        <div className="card-solid space-y-2 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium">Auf einen Blick</p>
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{insight}</p>
        </div>
      )}
      {org.surveys.length === 0 ? (
        <p className="rounded-[18px] bg-white/60 px-4 py-3 text-[11px] text-muted-foreground">
          Für diese Organisation liegen keine Befragungen für dich an.
        </p>
      ) : (
        org.surveys.map((s) => <SurveyCard key={s.key} item={s} />)
      )}
    </section>
  );
}

function OrgSwitcher({
  data,
  org,
  collapsed,
}: {
  data: ShellData;
  org: ShellOrg | null;
  collapsed: boolean;
}) {
  const router = useRouter();
  if (!org) return null;
  if (collapsed) {
    return (
      <div
        title={org.name}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-semibold shadow-pill"
      >
        {org.name.slice(0, 1)}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">Organisation</p>
      {data.orgs.length > 1 ? (
        <select
          aria-label="Organisation wechseln"
          value={org.slug}
          onChange={(e) => {
            const next = data.orgs.find((o) => o.slug === e.target.value);
            if (next) router.push(next.homeHref);
          }}
          className="h-9 w-full rounded-xl border border-border bg-white px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {data.orgs.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm font-medium leading-snug">{org.name}</p>
      )}
      <p className="text-[11px] text-muted-foreground">{org.roleLabel}</p>
    </div>
  );
}

interface AppShellProps {
  data: ShellData;
  signOut?: () => Promise<void>;
  children: ReactNode;
}

export function AppShell({ data, signOut, children }: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const org = currentOrg(data, pathname);
  const [collapsed, setCollapsed] = useStoredFlag(STORAGE_COLLAPSED, false);
  const [drawerOpen, setDrawerOpen] = useStoredFlag(STORAGE_DRAWER, true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSurveys, setMobileSurveys] = useState(false);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const focused = /\/survey\//.test(pathname);
  if (focused) {
    return (
      <div className="min-h-dvh">
        <div className="mx-auto flex h-12 max-w-xl items-center justify-between px-6 text-sm">
          <Link href={data.brandHref} className="flex items-center gap-2 font-medium">
            <BrandMark />
            KI-Barometer
          </Link>
          {org && <span className="truncate text-muted-foreground">{org.name}</span>}
        </div>
        {children}
      </div>
    );
  }

  const dueCount = org?.surveys.filter((s) => s.state === "due").length ?? 0;
  const surveysItem: ShellNavItem | null = org
    ? {
        key: "surveys",
        label: "Befragungen",
        icon: "surveys",
        drawer: true,
        badge: dueCount > 0 ? String(dueCount) : undefined,
      }
    : null;
  const showDrawer = !!org && drawerOpen && !collapsed;

  const navList = (mobile: boolean) => (
    <>
      <div className="flex flex-col gap-1">
        {data.globalNav.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            active={isActive(item, pathname)}
            collapsed={!mobile && collapsed}
          />
        ))}
        {surveysItem && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                mobile ? setMobileSurveys((v) => !v) : setDrawerOpen(!drawerOpen)
              }
              aria-expanded={mobile ? mobileSurveys : showDrawer}
              title={!mobile && collapsed ? surveysItem.label : undefined}
              className={cn(
                "flex h-10 flex-1 items-center gap-3 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-white/70 hover:text-foreground",
                (mobile ? mobileSurveys : showDrawer) && "bg-white text-foreground shadow-pill",
                !mobile && collapsed && "justify-center px-0",
              )}
            >
              <ClipboardCheck className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {(mobile || !collapsed) && (
                <span className="flex-1 truncate text-left">{surveysItem.label}</span>
              )}
              {(mobile || !collapsed) && surveysItem.badge && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium text-foreground"
                  style={{ background: "var(--accent-yellow)" }}
                  aria-label={`${surveysItem.badge} offen`}
                >
                  {surveysItem.badge}
                </span>
              )}
            </button>
            {!mobile && showDrawer && (
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Befragungen schließen"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-pill hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}
        {mobile && mobileSurveys && org && <Drawer org={org} inline />}
        {org?.nav.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            active={isActive(item, pathname)}
            collapsed={!mobile && collapsed}
          />
        ))}
      </div>
    </>
  );

  const userBlock = (mobile: boolean) =>
    data.user && (
      <div
        className={cn(
          "flex items-center gap-3",
          !mobile && collapsed && "flex-col",
        )}
      >
        <span
          title={data.user.label}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold shadow-pill"
        >
          {data.user.initials}
        </span>
        {(mobile || !collapsed) && (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {data.user.label}
          </span>
        )}
        {signOut && (
          <form action={signOut}>
            <button
              type="submit"
              title="Abmelden"
              className={cn(
                "rounded-full px-3 text-xs text-muted-foreground hover:bg-white hover:text-foreground",
                !mobile && collapsed && "px-2",
              )}
            >
              {!mobile && collapsed ? "↩" : "Abmelden"}
            </button>
          </form>
        )}
      </div>
    );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop: floating panel */}
      <aside
        className={cn(
          "shell-chrome hidden lg:sticky lg:top-3 lg:flex lg:h-[calc(100dvh-1.5rem)] lg:overflow-hidden lg:rounded-[22px] lg:bg-panel lg:shadow-float",
          "lg:m-3 lg:mr-0",
        )}
      >
        <nav
          aria-label="Hauptnavigation"
          className={cn(
            "flex h-full shrink-0 flex-col gap-5 overflow-y-auto p-4",
            collapsed ? "w-[76px] items-stretch" : "w-[236px]",
          )}
        >
          <div className={cn("flex items-center justify-between", collapsed && "flex-col gap-3")}>
            <Link href={data.brandHref} className="flex items-center gap-2 text-sm font-medium tracking-wide">
              <BrandMark />
              {!collapsed && <span>KI-Barometer</span>}
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-pill hover:bg-accent"
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              )}
            </button>
          </div>
          <OrgSwitcher data={data} org={org} collapsed={collapsed} />
          <div className="h-px bg-border" />
          {navList(false)}
          <div className="mt-auto border-t border-border pt-4">{userBlock(false)}</div>
        </nav>
        {showDrawer && org && <Drawer org={org} onClose={() => setDrawerOpen(false)} />}
      </aside>

      {/* Mobile: top bar + slide-in menu */}
      <div className="shell-chrome sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <Link href={data.brandHref} className="flex items-center gap-2 text-sm font-medium">
          <BrandMark />
          KI-Barometer
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Menü öffnen"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-pill"
        >
          <Menu className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-foreground/20"
          />
          <nav className="absolute inset-y-3 left-3 flex w-[300px] max-w-[calc(100%-1.5rem)] flex-col gap-5 overflow-y-auto rounded-[22px] bg-panel p-4 shadow-float">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <BrandMark />
                KI-Barometer
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Menü schließen"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-pill"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
            <OrgSwitcher data={data} org={org} collapsed={false} />
            <div className="h-px bg-border" />
            {navList(true)}
            <div className="mt-auto border-t border-border pt-4">{userBlock(true)}</div>
          </nav>
        </div>
      )}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
