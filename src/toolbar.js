export function initToolbar() {
  initToolbarScroll();
  initToolbarSnap();
  initSaveReveal();
}

function initToolbarScroll() {
  if (window.matchMedia('(min-width: 1024px)').matches) return;
  const bar = document.querySelector('.toolbar');
  const clearBtn = document.querySelector('#clearBtn');
  if (!bar || !clearBtn) return;
  requestAnimationFrame(() => {
    if (bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollLeft += clearBtn.getBoundingClientRect().left - bar.getBoundingClientRect().left;
  });
}

function initToolbarSnap() {
  if (window.matchMedia('(min-width: 1024px)').matches) return;
  const bar = document.querySelector('.toolbar');
  const clearBtn = document.querySelector('#clearBtn');
  const saveBtn = document.querySelector('#saveBtn');
  if (!bar || !clearBtn || !saveBtn) return;
  const ZONE = 56;
  let st;
  bar.addEventListener('scroll', () => {
    clearTimeout(st);
    st = setTimeout(() => {
      const b = bar.getBoundingClientRect();
      const dHome = clearBtn.getBoundingClientRect().left - b.left;
      const dSave = saveBtn.getBoundingClientRect().right - b.right;
      const aHome = Math.abs(dHome);
      const aSave = Math.abs(dSave);
      if (Math.min(aHome, aSave) > ZONE) return;
      const d = aHome <= aSave ? dHome : dSave;
      if (Math.abs(d) > 1) bar.scrollBy({ left: d, behavior: 'smooth' });
    }, 90);
  }, { passive: true });
}

function initSaveReveal() {
  if (window.matchMedia('(min-width: 1024px)').matches) return;
  const bar = document.querySelector('.toolbar');
  const saveBtn = document.querySelector('#saveBtn');
  if (!bar || !saveBtn) return;
  saveBtn.addEventListener('click', () => {
    const b = bar.getBoundingClientRect();
    const r = saveBtn.getBoundingClientRect();
    const over = r.right - b.right;
    if (over > 0) bar.scrollBy({ left: over + 8, behavior: 'smooth' });
  });
}
