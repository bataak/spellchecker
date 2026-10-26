export interface ScrollHint {
  sync(): void;
  destroy(): void;
}

type Side = "start" | "end";

const PAGE = 0.7;
const SLACK = 1;

function arrow(side: Side): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "scroll-arrow is-" + side;
  button.tabIndex = -1;
  button.setAttribute("aria-hidden", "true");
  button.textContent = side === "start" ? "‹" : "›";
  button.hidden = true;
  return button;
}

export function initScrollHint(bar: HTMLElement): ScrollHint {
  const start = arrow("start");
  const end = arrow("end");
  bar.parentElement?.append(start, end);

  function place(button: HTMLButtonElement, left: number): void {
    button.style.left = left + "px";
    button.style.top =
      bar.offsetTop + (bar.offsetHeight - button.offsetHeight) / 2 + "px";
  }

  function sync(): void {
    const max = bar.scrollWidth - bar.clientWidth;
    const room = !bar.hidden && max > SLACK;
    const before = room && bar.scrollLeft > SLACK;
    const after = room && bar.scrollLeft < max - SLACK;
    bar.classList.toggle("scroll-fade-start", before);
    bar.classList.toggle("scroll-fade-end", after);
    start.hidden = !before;
    end.hidden = !after;
    if (before) place(start, bar.offsetLeft);
    if (after) place(end, bar.offsetLeft + bar.clientWidth - end.offsetWidth);
  }

  const page = (sign: number): void =>
    bar.scrollBy({ left: sign * bar.clientWidth * PAGE, behavior: "smooth" });
  const keepFocus = (event: Event): void => event.preventDefault();
  const onWheel = (event: WheelEvent): void => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (bar.scrollWidth - bar.clientWidth <= SLACK) return;
    event.preventDefault();
    bar.scrollLeft += event.deltaY;
  };

  for (const button of [start, end])
    button.addEventListener("pointerdown", keepFocus);
  start.addEventListener("click", () => page(-1));
  end.addEventListener("click", () => page(1));
  bar.addEventListener("scroll", sync, { passive: true });
  bar.addEventListener("wheel", onWheel, { passive: false });
  const resize = new ResizeObserver(sync);
  resize.observe(bar);

  return {
    sync,
    destroy() {
      resize.disconnect();
      bar.removeEventListener("scroll", sync);
      bar.removeEventListener("wheel", onWheel);
      start.remove();
      end.remove();
    },
  };
}
