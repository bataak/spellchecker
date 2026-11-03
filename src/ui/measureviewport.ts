import {
  type Layout,
  type TalkPlan,
  type Metrics,
  talkPlan,
  type LayoutChoice,
  available,
  pageWidth,
  previewMeasure,
  PREVIEW_MIN_MEASURE,
  has,
  HYSTERESIS,
  projectViewport,
} from "./layout.ts";
import { talkOpen, talkYielded } from "./talkslot.ts";

export function px(
  cs: CSSStyleDeclaration,
  prop: string,
  fallback: number,
): number {
  const v = Number.parseFloat(cs.getPropertyValue(prop));
  return Number.isFinite(v) ? v : fallback;
}

export function measureVar(
  host: HTMLElement,
  name: string,
  fallback: number,
): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    `position:absolute;visibility:hidden;pointer-events:none;` +
    `height:0;padding:0;border:0;width:var(${name})`;
  host.append(probe);
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  return Number.isFinite(w) && w >= 0 ? w : fallback;
}

const wideQuery = window.matchMedia("(min-width: 1024px)");

const PROJECT_W = 236;

function projectRoom(wrap: HTMLElement, x: Metrics): number {
  if (document.documentElement.dataset.project !== "on" || !wideQuery.matches)
    return 0;
  return measureVar(wrap, "--project-w", PROJECT_W) + x.panelGap + x.gutterW;
}

export interface ViewportPlan {
  readonly viewport: number;
  readonly offered: Layout[] | null;
  readonly projectFloat: boolean;
  readonly talk: TalkPlan | null;
}

function planTalk(
  wrap: HTMLElement,
  metrics: Metrics,
  full: number,
  page: { readonly loose: number; readonly tight: number },
  projectColumn: number,
): TalkPlan | null {
  if (!talkOpen() || !wideQuery.matches) return null;
  const projectW = measureVar(wrap, "--project-w", PROJECT_W);
  return talkPlan(metrics, full, page, projectColumn, projectW);
}

export function planViewport(
  wrap: HTMLElement,
  metrics: Metrics,
  choose: (fit: Layout[]) => LayoutChoice,
  prev: Layout[],
): ViewportPlan {
  const full = document.documentElement.clientWidth;
  const room = projectRoom(wrap, metrics);
  if (room <= 0 && !(talkOpen() && wideQuery.matches))
    return { viewport: full, offered: null, projectFloat: false, talk: null };
  const wide = choose(available(metrics, full, prev));
  const loose = pageWidth(
    wide.active,
    metrics,
    previewMeasure(wide.active, metrics, full),
  );
  const tight = wide.active.preview
    ? pageWidth(wide.active, metrics, PREVIEW_MIN_MEASURE) +
      (has(prev, wide.active) ? 0 : HYSTERESIS)
    : loose;
  const project =
    room > 0 ? projectViewport(full, room, tight) : { viewport: full };
  const docked = room > 0 && project.viewport !== full;
  const talk = planTalk(
    wrap,
    metrics,
    full,
    { loose, tight },
    docked ? room : 0,
  );
  const aside = talk?.mode === "swap" && talkYielded();
  const ownColumn = talk !== null && talk.mode !== "float" && !aside;
  return {
    viewport: ownColumn ? talk.viewport : project.viewport,
    offered: wide.avail,
    projectFloat: room > 0 && !docked,
    talk,
  };
}
