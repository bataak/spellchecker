export function animateStatus(root) {
  animateStatusWords(root);
  animateStatusShimmer(root);
}

export function animateStatusWords(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let i = 0;
  for (const node of nodes) {
    const parts = node.nodeValue.split(/(\s+)/);
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      if (!part.trim()) {
        frag.appendChild(document.createTextNode(part));
        continue;
      }
      const span = document.createElement("span");
      span.className = "sw";
      span.style.animationDelay = Math.min(i * 36, 900) + "ms";
      span.textContent = part;
      frag.appendChild(span);
      i++;
    }
    node.parentNode.replaceChild(frag, node);
  }
}

export function animateStatusShimmer(root) {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  root.classList.remove("shimmer");
  void root.offsetWidth;
  root.classList.add("shimmer");
  clearTimeout(root._shimmerTimer);
  root._shimmerTimer = setTimeout(() => {
    root.classList.remove("shimmer");
  }, 1350);
}
