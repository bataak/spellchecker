import { afterBoot } from "./layoutsnapshot.ts";
import { initScrollHint } from "./scrollhint.ts";
import {
  DEFAULT_LAYOUT,
  DEFAULT_METRICS,
  MEASURES,
  available,
  dockColumnFits,
  pageWidth,
  previewMeasure,
  parseLayout,
  serializeLayout,
  showsControl,
  chooseLayout,
  PREVIEW_MIN_MEASURE,
  projectViewport,
  talkPlan,
  type Layout,
  type LayoutChoice,
  type Metrics,
} from "./layout.ts";
import { KEYS, read, remove, write, writeJson } from "../core/store.ts";
import { talkYielded, yieldTalk } from "./talkslot.ts";
import { bindMenu, buildControl, paintMenu } from "./measuremenu.ts";

const SAMPLE =
  "Монгол хэлний үг залгамал бүтэцтэй тул нэлээд урт болдог, " +
  "үүнээс шалтгаалж мөрийн төгсгөлийн үлдэгдэл зай ихэсдэг тул " +
  "нэг тэмдэгтийн дундаж өргөнийг бодит бичвэрээр хэмжинэ.";

function px(cs: CSSStyleDeclaration, prop: string, fallback: number): number {
  const v = Number.parseFloat(cs.getPropertyValue(prop));
  return Number.isFinite(v) ? v : fallback;
}

function measureVar(host: HTMLElement, name: string, fallback: number): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    `position:absolute;visibility:hidden;pointer-events:none;` +
    `height:0;padding:0;border:0;width:var(${name})`;
  host.append(probe);
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  return Number.isFinite(w) && w >= 0 ? w : fallback;
}

function sampleWidth(
  ctx: CanvasRenderingContext2D,
  cs: CSSStyleDeclaration,
  size: string,
  family: string,
): number {
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size} ${family}`;
  return ctx.measureText(SAMPLE).width;
}

function fitMono(ctx: CanvasRenderingContext2D, cs: CSSStyleDeclaration): void {
  const root = getComputedStyle(document.documentElement);
  const serif = root.getPropertyValue("--serif").trim();
  const mono = root.getPropertyValue("--mono").trim();
  if (!serif || !mono) return;
  const a = sampleWidth(ctx, cs, "100px", serif);
  const b = sampleWidth(ctx, cs, "100px", mono);
  if (!(a > 0 && b > 0)) return;
  document.documentElement.style.setProperty("--mono-fit", (a / b).toFixed(4));
}

function fontsLoaded(el: HTMLElement): boolean {
  const fonts: FontFaceSet | undefined = document.fonts;
  if (!fonts) return true;
  const cs = getComputedStyle(el);
  const root = getComputedStyle(document.documentElement);
  return [
    cs.fontFamily,
    root.getPropertyValue("--serif").trim(),
    root.getPropertyValue("--mono").trim(),
  ]
    .filter(Boolean)
    .every((family) => fonts.check(`${cs.fontSize} ${family}`, SAMPLE));
}

function measurePer(el: HTMLElement): number | null {
  if (!fontsLoaded(el)) return null;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return DEFAULT_METRICS.per;
  fitMono(ctx, getComputedStyle(el));
  const cs = getComputedStyle(el);
  const w = sampleWidth(ctx, cs, cs.fontSize, cs.fontFamily);
  if (!(w > 0)) return DEFAULT_METRICS.per;
  const ls = Number.parseFloat(cs.letterSpacing);
  return w / SAMPLE.length + (Number.isFinite(ls) ? ls : 0);
}

function normalizePer(raw: number, scale: number): number {
  return scale > 0 ? raw / scale : raw;
}

function toolbarNeed(bar: HTMLElement): number {
  const cs = getComputedStyle(bar);
  const gap = Number.parseFloat(cs.columnGap) || 0;
  let w =
    (Number.parseFloat(cs.paddingLeft) || 0) +
    (Number.parseFloat(cs.paddingRight) || 0);
  let count = 0;
  for (const el of bar.children) {
    const e = el as HTMLElement;
    if (e.hidden || e.offsetParent === null) continue;
    w += e.getBoundingClientRect().width;
    count += 1;
  }
  return w + Math.max(count - 1, 0) * gap;
}

function syncToolbar(bar: HTMLElement | null): void {
  const host = bar?.parentElement;
  if (!bar || !host) return;
  const room = host.getBoundingClientRect().width;
  const wide = toolbarNeed(bar) > room + 0.5;
  if (wide) document.documentElement.dataset.toolbar = "wide";
  else delete document.documentElement.dataset.toolbar;
}

function createToolbarFit(): { sync(): void; destroy(): void } {
  const bar = document.querySelector<HTMLElement>(".toolbar");
  const hint = bar ? initScrollHint(bar) : null;
  return {
    sync() {
      syncToolbar(bar);
      hint?.sync();
    },
    destroy: () => hint?.destroy(),
  };
}

let scrollbarWidth: number | null = null;

function measureScrollbar(): number {
  if (scrollbarWidth !== null) return scrollbarWidth;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;" +
    "width:100px;height:100px;overflow:scroll";
  document.body.append(probe);
  scrollbarWidth = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return scrollbarWidth;
}

function createMetricsWriter(): (saved: string) => void {
  let last = "";
  return (saved) => {
    if (saved === last) return;
    last = saved;
    writeJson(KEYS.metrics, JSON.parse(saved));
  };
}

function readMetrics(
  area: HTMLElement,
  wrap: HTMLElement,
  persist: (saved: string) => void,
): Metrics {
  const root = getComputedStyle(document.documentElement);
  const areaCs = getComputedStyle(area);
  const scale = px(root, "--editor-scale", DEFAULT_METRICS.scale);
  const main = wrap.closest<HTMLElement>("main");
  const raw = measurePer(area);
  if (raw !== null) {
    const fit = Number.parseFloat(
      document.documentElement.style.getPropertyValue("--mono-fit"),
    );
    const saved = JSON.stringify({
      per: Number(normalizePer(raw, scale).toFixed(3)),
      monoFit: Number.isFinite(fit) ? fit : undefined,
    });
    persist(saved);
  }
  return {
    per:
      raw === null
        ? px(root, "--editor-per", DEFAULT_METRICS.per)
        : normalizePer(raw, scale),
    scale,
    padX: Number.parseFloat(areaCs.paddingLeft) || DEFAULT_METRICS.padX,
    pagePad: main
      ? Number.parseFloat(getComputedStyle(main).paddingLeft) ||
        DEFAULT_METRICS.pagePad
      : DEFAULT_METRICS.pagePad,
    gutterW: measureVar(wrap, "--gutter-w", DEFAULT_METRICS.gutterW),
    panelW: DEFAULT_METRICS.panelW,
    previewPad: DEFAULT_METRICS.previewPad,
    panelGap: DEFAULT_METRICS.panelGap,
  };
}

const wideQuery = window.matchMedia("(min-width: 1024px)");

function projectRoom(wrap: HTMLElement, x: Metrics): number {
  if (document.documentElement.dataset.project !== "on" || !wideQuery.matches)
    return 0;
  return measureVar(wrap, "--project-w", 236) + x.panelGap + x.gutterW;
}

function talkOpen(): boolean {
  return (
    document.documentElement.hasAttribute("data-talk") && wideQuery.matches
  );
}

function setFlag(
  name: "projectFloat" | "talkFloat" | "talkSwap",
  on: boolean,
): void {
  const data = document.documentElement.dataset;
  if (on) data[name] = "";
  else delete data[name];
}

function load(tex: boolean): Layout {
  return parseLayout(read(tex ? KEYS.layoutTex : KEYS.layout));
}

function save(l: Layout, tex: boolean): void {
  write(tex ? KEYS.layoutTex : KEYS.layout, serializeLayout(l));
}

function loadMdPreview(tex: boolean): boolean {
  return read(tex ? KEYS.mdPreviewTex : KEYS.mdPreview) !== "off";
}

function saveMdPreview(on: boolean, tex: boolean): void {
  const key = tex ? KEYS.mdPreviewTex : KEYS.mdPreview;
  if (on) remove(key);
  else write(key, "off");
}

function applyLayout(l: Layout): void {
  const root = document.documentElement;
  root.style.setProperty("--editor-measure", String(MEASURES[l.measure]));
  if (l.measure === "a") delete root.dataset.measure;
  else root.dataset.measure = l.measure;
  if (l.panel) delete root.dataset.panel;
  else root.dataset.panel = "off";
  if (l.preview) root.dataset.preview = "on";
  else delete root.dataset.preview;
}

function publishMetrics(metrics: Metrics): void {
  afterBoot("metrics", () => setRootMetrics(metrics));
}

function planTalk(
  wrap: HTMLElement,
  metrics: Metrics,
  full: number,
  page: { readonly loose: number; readonly tight: number },
  project: number,
): number | null {
  const style = document.documentElement.style;
  const plan = talkOpen()
    ? talkPlan(
        metrics,
        full,
        page,
        project,
        measureVar(wrap, "--project-w", 236),
      )
    : null;
  const swap = plan?.mode === "swap";
  if (!swap) yieldTalk(false);
  setFlag("talkFloat", plan?.mode === "float");
  setFlag("talkSwap", swap);
  if (plan) style.setProperty("--talk-w", `${Math.floor(plan.width)}px`);
  else style.removeProperty("--talk-w");
  return plan && plan.mode !== "float" && !talkYielded() ? plan.viewport : null;
}

function planViewport(
  wrap: HTMLElement,
  metrics: Metrics,
  choose: (fit: Layout[]) => LayoutChoice,
  prev: Layout[],
): { viewport: number; offered: Layout[] | null } {
  const full = document.documentElement.clientWidth;
  const room = projectRoom(wrap, metrics);
  if (room <= 0 && !talkOpen()) {
    setFlag("projectFloat", false);
    planTalk(wrap, metrics, full, { loose: 0, tight: 0 }, 0);
    return { viewport: full, offered: null };
  }
  const wide = choose(available(metrics, full, prev));
  const loose = pageWidth(
    wide.active,
    metrics,
    previewMeasure(wide.active, metrics, full),
  );
  const tight = wide.active.preview
    ? pageWidth(wide.active, metrics, PREVIEW_MIN_MEASURE)
    : loose;
  const plan =
    room > 0 ? projectViewport(full, room, tight) : { viewport: full };
  const docked = room > 0 && plan.viewport !== full;
  setFlag("projectFloat", room > 0 && !docked);
  const talk = planTalk(
    wrap,
    metrics,
    full,
    { loose, tight },
    docked ? room : 0,
  );
  return { viewport: talk ?? plan.viewport, offered: wide.avail };
}

function placeTalk(wrap: HTMLElement): void {
  const root = document.documentElement;
  const workspace = wrap.closest<HTMLElement>(".workspace");
  const win = workspace?.querySelector<HTMLElement>(":scope > .talk-window");
  if (!workspace || !win || !("talkFloat" in root.dataset)) {
    root.style.removeProperty("--talk-x");
    return;
  }
  const preview = workspace.querySelector<HTMLElement>(".preview-panel");
  const space = workspace.getBoundingClientRect();
  const anchor =
    preview && !preview.hidden && preview.offsetParent !== null
      ? preview.getBoundingClientRect().left
      : wrap.getBoundingClientRect().right - win.offsetWidth;
  const x = Math.max(
    0,
    Math.min(anchor - space.left, space.width - win.offsetWidth),
  );
  root.style.setProperty("--talk-x", `${Math.round(x)}px`);
}

export interface MeasureControl {
  refresh(): void;
  dockRoom(side: "left" | "right", active: boolean): boolean;
  setPreviewMode(on: boolean, tex?: boolean): void;
  setPreviewBlocked(on: boolean): void;
  layout(): Layout;
  destroy(): void;
}

function setRootMetrics(metrics: Metrics): void {
  const style = document.documentElement.style;
  style.setProperty("--editor-per", `${metrics.per.toFixed(3)}px`);
  style.setProperty("--scrollbar-w", `${measureScrollbar()}px`);
}

function watchRoot(refresh: () => void): () => void {
  const root = document.documentElement;
  const sized = new ResizeObserver(refresh);
  sized.observe(root);
  const talk = new MutationObserver(refresh);
  talk.observe(root, {
    attributes: true,
    attributeFilter: ["data-talk", "data-talk-yield"],
  });
  return () => {
    sized.disconnect();
    talk.disconnect();
  };
}

function watchFonts(refresh: () => void): void {
  const fonts: FontFaceSet | undefined = document.fonts;
  void fonts?.ready.then(refresh);
  void fonts?.load('16px "Bichig Mono"').then(refresh);
}

export function initMeasureControl(
  wrap: HTMLElement,
  area: HTMLElement,
  onChange?: (l: Layout) => void,
): MeasureControl {
  const control = buildControl(wrap);
  const { ctl, btn, menu, tools } = control;
  const toolbar = createToolbarFit();
  const persistMetrics = createMetricsWriter();

  let texMode = false;
  let desired: Layout = load(texMode);
  let previewMode = false;
  let previewBlocked = false;
  let mdMode = false;
  let mdPreview = loadMdPreview(texMode);
  let prev: Layout[] = [];
  let metrics: Metrics = { ...DEFAULT_METRICS };
  let shown: Layout = { ...DEFAULT_LAYOUT };
  let viewportW = 0;

  const apply = (l: Layout): void => {
    afterBoot("layout", () => applyLayout(l));
    onChange?.(l);
  };

  const close = (): void => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };

  const pick = (l: Layout): void => {
    desired = l;
    previewMode = false;
    if (mdMode && l.preview !== mdPreview) {
      mdPreview = l.preview;
      saveMdPreview(mdPreview, texMode);
    }
    save(l, texMode);
    close();
    refresh();
    btn.focus();
  };

  function refresh(): void {
    metrics = readMetrics(area, wrap, persistMetrics);
    publishMetrics(metrics);

    const choose = (fit: Layout[]): LayoutChoice =>
      chooseLayout(fit, desired, previewBlocked, previewMode);

    const root = document.documentElement;
    const { viewport, offered } = planViewport(wrap, metrics, choose, prev);
    const fit = available(metrics, viewport, prev);
    prev = fit;
    const { avail, active } = choose(fit);
    shown = active;
    viewportW = viewport;
    root.style.setProperty(
      "--preview-measure",
      String(previewMeasure(active, metrics, viewport)),
    );
    apply(active);
    requestAnimationFrame(() => placeTalk(wrap));

    toolbar.sync();

    const menuAvail = offered ?? avail;
    ctl.hidden = !showsControl(menuAvail);
    if (ctl.hidden) close();
    else paintMenu(control, menuAvail, active, metrics, pick);
  }

  const unbindMenu = bindMenu(control, close);

  const unwatch = watchRoot(() => refresh());

  watchFonts(() => refresh());

  refresh();

  return {
    refresh,
    dockRoom(side, active) {
      return dockColumnFits(shown, metrics, viewportW, side, active);
    },
    setPreviewMode(on, tex = false) {
      if (on === mdMode && tex === texMode) return;
      if (tex !== texMode) {
        texMode = tex;
        desired = load(tex);
        mdPreview = loadMdPreview(tex);
      }
      mdMode = on;
      previewMode = on && mdPreview;
      refresh();
    },
    setPreviewBlocked(on) {
      if (on === previewBlocked) return;
      previewBlocked = on;
      refresh();
    },
    layout() {
      return { ...shown };
    },
    destroy() {
      unwatch();
      toolbar.destroy();
      unbindMenu();
      wrap.append(...tools.querySelectorAll<HTMLElement>(".decode-btn"));
      tools.remove();
    },
  };
}
