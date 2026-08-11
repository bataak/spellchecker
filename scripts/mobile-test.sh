#!/bin/sh
set -e

echo "== Ажлын модны хувилбар =="
grep '"version"' package.json
git log --oneline -1

if [ -n "$(git status --porcelain)" ]; then
  echo
  echo "== Хадгалагдаагүй өөрчлөлт =="
  git status --short
fi

echo
rm -rf dist
VITE_BASE=/ npm run build
rm -f dist/sw.js dist/registerSW.js
rm -f dist/workbox-*.js 2>/dev/null || true

echo
echo "Туннелийг өөр терминалд ажиллуулна:"
echo "  cloudflared tunnel --url http://localhost:4173"
echo
npx serve dist -l 4173
