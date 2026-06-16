# Монгол үгийн алдаа шалгагч (bundled hunspell)

Engine: эхлээд **hunspell-wasm** (жинхэнэ Hunspell, Монгол нийлмэл үг бүрэн)-ийг
оролдоод, амжилтгүй бол **nspell** (цэвэр JS) руу автоматаар шилжинэ — апп
гарцаагүй ажиллана. Хоёулаа bundler-ээр (CDN биш) орох тул найдвартай. Гаралт нь
статик тул GitHub Pages дээр ажиллана; Service Worker-ээр офлайн.

Статус мөрөнд аль engine идэвхтэйг харуулна:
- `· hunspell-wasm` -> жинхэнэ Hunspell амжилттай.
- `· nspell ...` -> нөөц engine (Монгол нийлмэл үгийн нарийвчлал бага).

## 1. Толиудаа нэмэх

`public/dict/` дотор (UTF-8):

```
public/dict/mn_MN.aff   public/dict/mn_MN.dic
public/dict/en_GB.aff   public/dict/en_GB.dic
public/dict/en_US.aff   public/dict/en_US.dic
```

эсвэл ZIP-ээр (татах хэмжээ бага):

```bash
./pack-dict.sh        # public/dict/dictionaries.zip үүсгэнэ
```

Толь авах:
- Монгол — https://github.com/bataak/dict-mn
- Англи — https://github.com/wooorm/dictionaries (`en-GB`/`en-US` доторх
  `index.aff`/`index.dic`-ийг `en_GB.*`/`en_US.*` болгож нэрлэнэ)

## 2. Локалд ажиллуулах

```bash
npm install
npm run dev       # хөгжүүлэлт
npm run build     # -> dist/ (статик)
npm run preview   # build-ийг шалгах
```

## 3. GitHub Pages

**Автомат:** `main` руу push → `Settings → Pages → Source = GitHub Actions`.
`base`-ийг repo нэрээр автоматаар тааруулна.

**Гар:** `npm run build` → `dist/`-ийг `gh-pages` салбарт тавина. Энэ тохиолдолд
`vite.config.js` доторх `base`-ийг repo нэрээрээ солино (`/REPO/`).

base: project page → `/REPO/`; user/org page эсвэл custom domain → `/`.

## Ажиллагаа

- Үг бичих явцад шалгахгүй — **зай/таслал/Enter** дарж үг дуусгахад л шалгана (хурдан).
- Алдаатай үгийн доор улаан долгионт зураас (CSS Highlight API; DOM-д юу ч нэмэхгүй).
- Улаан үг рүү курсор аваачихад засах санал гарч, дарахад орлуулна.
- hunspell-asm-ийн wasm нь JS дотроо шигтгээстэй (SINGLE_FILE) тул нэмэлт тохиргоо
  шаардлагагүй.
