export interface TopbarFit {
  sync(): void;
  destroy(): void;
}

export function initTopbarFit(
  mount: HTMLElement | null,
  bar: HTMLElement,
  hasTools: () => boolean,
): TopbarFit {
  const wideQuery = window.matchMedia("(min-width: 701px)");

  function toolbarStart(): number | null {
    if (document.documentElement.dataset.toolbar !== "wide") return null;
    const toolbar = document.querySelector<HTMLElement>(".toolbar");
    if (!toolbar) return null;
    for (const el of toolbar.children) {
      const item = el as HTMLElement;
      if (item.hidden || item.offsetParent === null) continue;
      return item.getBoundingClientRect().left;
    }
    return null;
  }

  function syncWide(): void {
    const root = document.documentElement;
    const host = mount?.parentElement;
    const subtitle = mount?.querySelector<HTMLElement>(".subtitle") ?? null;
    if (!mount || !host || bar.hidden || !wideQuery.matches) {
      delete root.dataset.topbar;
      return;
    }
    const cs = getComputedStyle(host);
    const contentLeft =
      host.getBoundingClientRect().left +
      (Number.parseFloat(cs.paddingLeft) || 0);
    const pulled = hasTools() ? toolbarStart() : null;
    const room =
      host.clientWidth -
      (Number.parseFloat(cs.paddingLeft) || 0) -
      (Number.parseFloat(cs.paddingRight) || 0) +
      (pulled === null ? 0 : contentLeft - pulled);
    let text = 0;
    if (subtitle) {
      const wrap = subtitle.style.whiteSpace;
      subtitle.style.whiteSpace = "nowrap";
      const range = document.createRange();
      range.selectNodeContents(subtitle);
      text = Math.ceil(range.getBoundingClientRect().width);
      subtitle.style.whiteSpace = wrap;
    }
    const gap = Number.parseFloat(getComputedStyle(mount).columnGap) || 0;
    if (bar.scrollWidth + text + gap > room + 0.5) {
      const start = pulled ?? contentLeft;
      root.style.setProperty("--topbar-start", String(start) + "px");
      root.dataset.topbar = "wide";
    } else if (pulled !== null) {
      root.style.setProperty(
        "--topbar-pull",
        String(pulled - contentLeft) + "px",
      );
      root.dataset.topbar = "pull";
    } else delete root.dataset.topbar;
  }

  let wideFrame = 0;
  const queueWide = (): void => {
    if (wideFrame) return;
    wideFrame = requestAnimationFrame(() => {
      wideFrame = 0;
      syncWide();
    });
  };
  const subtitleWatch = new MutationObserver(queueWide);
  const watched = mount?.querySelector(".subtitle");
  if (watched)
    subtitleWatch.observe(watched, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  window.addEventListener("resize", queueWide);
  const toolbarWatch = new MutationObserver(queueWide);
  toolbarWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-toolbar"],
  });

  return {
    sync: syncWide,
    destroy() {
      window.removeEventListener("resize", queueWide);
      subtitleWatch.disconnect();
      toolbarWatch.disconnect();
      if (wideFrame) cancelAnimationFrame(wideFrame);
      delete document.documentElement.dataset.topbar;
    },
  };
}
