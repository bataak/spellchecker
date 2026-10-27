const root = (): DOMStringMap => document.documentElement.dataset;

export function talkCovers(): boolean {
  return "talkSwap" in root() && !("talkYield" in root());
}

export function talkYielded(): boolean {
  return "talkSwap" in root() && "talkYield" in root();
}

export function yieldTalk(on: boolean): void {
  if (on) root().talkYield = "";
  else delete root().talkYield;
}

export function onSlotChange(listener: () => void): void {
  new MutationObserver(listener).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-talk-swap", "data-talk-yield"],
  });
}
