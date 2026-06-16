# Монгол үгийн алдаа шалгагч (bundled hunspell)

Engine: Ап эхлээд **hunspell-wasm**-ийг ажиллуулж үзээд, амжилтгүй бол
**nspell** (JS) уруу шилжинэ. Гаралт нь статик тул GitHub Pages дээр
Service Worker-ээр офлайн ажиллана.

## 1. Толинуудаа нэмэх

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

Толь татах:
- Монгол — https://github.com/bataak/dict-mn
- Англи — https://github.com/LibreOffice/dictionaries

## 2. Локалоор ажиллуулах

```bash
npm install
npm run dev       # хөгжүүлэлт
npm run build     # -> dist/ (статик)
npm run preview   # build-ийг шалгах
```

## 3. GitHub Pages

**Автомат тохиргоо:** `main` уруу push → `Settings → Pages → Source = GitHub Actions`.
`base`-ийг repo нэрээр автоматаар тааруулна.

**Гар тохиргоо:** `npm run build` → `dist/`-ийг `gh-pages` салбарт тавина. Энэ тохиолдолд
`vite.config.js` доторх `base`-ийг repo нэрээр солино (`/REPO/`).

base: project page → `/REPO/`; user/org page эсвэл custom domain → `/`.

## Ажиллагаа

- Үг бичих явцад шалгахгүй — **зай/таслал/Enter** дарж үг дуусгахад л шалгана.
- Алдаатай үгийн доор улаан долгионт зураас тэмдэглэнэ (CSS Highlight API; DOM-д юу ч нэмэхгүй).
- Улаанаар зурсан үгэн дээр курсор аваачиж дарахад үгийн зөв бичлэг харагдана.
- hunspell-asm-ийн wasm нь JS дотроо суусан (SINGLE_FILE) тул нэмэлт тохиргоо
  шаардлагагүй.
