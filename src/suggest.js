const ENDPOINT = "https://api.bichig.dev/suggest";
const SITEKEY = "0x4AAAAAADvk6t3Gsh_j1vH7";
const WORD_RE = /^[\u0400-\u04FF][\u0400-\u04FF-]{1,49}$/u;

let overlay = null;
let widgetId = null;
let scriptPromise = null;
let busy = false;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        s.remove();
        reject(new Error("turnstile-load"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

function note(msg, kind) {
  const el = overlay.querySelector(".suggest-note");
  el.textContent = msg;
  el.dataset.kind = kind || "";
}

function closeForm() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  if (window.turnstile && widgetId != null) {
    try {
      window.turnstile.reset(widgetId);
    } catch (_) {}
  }
}

function build() {
  overlay = document.createElement("div");
  overlay.className = "suggest-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="suggest-card" role="dialog" aria-modal="true" aria-labelledby="suggestTitle">' +
    '<h2 id="suggestTitle" class="suggest-title">Шинэ үг санал болгох</h2>' +
    '<p class="suggest-hint">Толинд бүртгэгдээгүй зөв үгийг илгээнэ үү. Хянаж үзсэний дараа толинд нэмэгдэнэ.</p>' +
    '<label class="suggest-label" for="suggestWord">Үг</label>' +
    '<input id="suggestWord" class="suggest-input" type="text" maxlength="50" autocomplete="off" autocapitalize="off" spellcheck="false" />' +
    '<label class="suggest-label" for="suggestNote">Тайлбар (заавал биш)</label>' +
    '<textarea id="suggestNote" class="suggest-input suggest-textarea" maxlength="500" rows="2"></textarea>' +
    '<div class="suggest-turnstile"></div>' +
    '<p class="suggest-note" aria-live="polite"></p>' +
    '<div class="suggest-actions">' +
    '<button type="button" class="tbtn suggest-cancel">Болих</button>' +
    '<button type="button" class="tbtn suggest-send">Илгээх</button>' +
    "</div>" +
    "</div>";
  document.body.appendChild(overlay);

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) closeForm();
  });
  overlay.querySelector(".suggest-cancel").addEventListener("click", closeForm);
  overlay.querySelector(".suggest-send").addEventListener("click", submit);
  overlay
    .querySelector("#suggestWord")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeForm();
  });
}

async function openForm(prefill) {
  if (!overlay) build();
  overlay.hidden = false;
  note("");
  const wordEl = overlay.querySelector("#suggestWord");
  if (prefill) wordEl.value = prefill;
  wordEl.focus();
  try {
    await loadTurnstile();
  } catch (_) {
    note("Баталгаажуулалт ачаалагдсангүй — интернетээ шалгана уу", "err");
    return;
  }
  if (widgetId == null) {
    const theme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    widgetId = window.turnstile.render(
      overlay.querySelector(".suggest-turnstile"),
      { sitekey: SITEKEY, theme },
    );
  } else {
    try {
      window.turnstile.reset(widgetId);
    } catch (_) {}
  }
}

async function submit() {
  if (busy) return;
  const wordEl = overlay.querySelector("#suggestWord");
  const noteEl = overlay.querySelector("#suggestNote");
  const sendBtn = overlay.querySelector(".suggest-send");
  const word = wordEl.value.trim();

  if (!WORD_RE.test(word)) {
    note("Үг кирилл үсгээр, 2–50 тэмдэгт байна", "err");
    wordEl.focus();
    return;
  }
  if (!navigator.onLine) {
    note("Сүлжээгүй байна — холбогдсоны дараа дахин оролдоно уу", "err");
    return;
  }
  const token =
    window.turnstile && widgetId != null
      ? window.turnstile.getResponse(widgetId)
      : "";
  if (!token) {
    note("Баталгаажуулалт дуусаагүй — хэсэг хүлээгээд дахин дарна уу", "err");
    return;
  }

  busy = true;
  sendBtn.disabled = true;
  note("Илгээж байна…");
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word,
        note: noteEl.value.trim(),
        turnstileToken: token,
      }),
    });
    if (r.status === 201) {
      note("Илгээгдлээ, баярлалаа!", "ok");
      wordEl.value = "";
      noteEl.value = "";
      setTimeout(closeForm, 1400);
    } else if (r.status === 429) {
      note("Цагийн хязгаарт хүрлээ — дараа дахин оролдоно уу", "err");
    } else {
      note("Илгээхэд алдаа гарлаа — дахин оролдоно уу", "err");
      try {
        window.turnstile.reset(widgetId);
      } catch (_) {}
    }
  } catch (_) {
    note("Сүлжээний алдаа — дахин оролдоно уу", "err");
  } finally {
    busy = false;
    sendBtn.disabled = false;
  }
}

export function initSuggest() {
  document
    .querySelectorAll("a.suggestctl, a.suggest-word")
    .forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        openForm();
      });
    });
}
