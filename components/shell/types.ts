/**
 * Navigation model of the app shell (design D, DECISIONS D4.9). Built on the
 * server per viewer (lib/server/shell.ts) and rendered by the client shell —
 * plain data only, so it can cross the server/client boundary.
 */

export type ShellIcon =
  | "home"
  | "dashboard"
  | "surveys"
  | "report"
  | "members"
  | "settings"
  | "platform"
  | "demo";

export interface ShellNavItem {
  key: string;
  label: string;
  icon: ShellIcon;
  /** Link target; omitted for the item that opens the survey drawer. */
  href?: string;
  /** Small right-aligned hint, e.g. "1 offen". */
  badge?: string;
  /** This item toggles the secondary panel instead of navigating. */
  drawer?: boolean;
  /** Active only on an exact pathname match (default: prefix match). */
  exact?: boolean;
}

export type ShellSurveyState = "due" | "done" | "locked" | "soon";

export interface ShellSurveyItem {
  key: string;
  title: string;
  hint: string;
  href?: string;
  state: ShellSurveyState;
}

export interface ShellOrg {
  slug: string;
  name: string;
  /** Pathname prefix that selects this org, e.g. "/app/moorbach". */
  base: string;
  /** Further pathname prefixes that belong to this org (demo: "/survey"). */
  paths?: string[];
  /** Where the org switcher navigates to. */
  homeHref: string;
  roleLabel: string;
  nav: ShellNavItem[];
  surveys: ShellSurveyItem[];
  /** One-line insight for the drawer's top card, or null. */
  insight: string | null;
}

export interface ShellData {
  mode: "product" | "demo";
  brandHref: string;
  /** Items above the org navigation (Übersicht, Plattform). */
  globalNav: ShellNavItem[];
  orgs: ShellOrg[];
  user: { label: string; initials: string } | null;
}
