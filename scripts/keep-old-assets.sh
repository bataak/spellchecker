#!/bin/sh
# Өмнөх хувилбаруудын assets/ файлыг шинэ build-д хуулна. Шинэ хувилбар
# суусны дараа хуучин код ажиллаж буй таб lazy chunk-аа (баримт уншигч,
# PDF, экспорт г.м.) ачаалж чадахгүй болохоос сэргийлнэ.
#
# Хэрэглээ: keep-old-assets.sh <амьд сайтын URL> [dist] [хоног]
#
# dist/assets-kept.txt нь "огноо зам" мөрүүдтэй: огноо нь тухайн файл
# хамгийн сүүлд амьд хувилбарт байсан өдөр. Хугацаа хэтэрсэн файлыг хаяна.
set -e

site=${1%/}
dist=${2:-dist}
days=${3:-7}
manifest=assets-kept.txt

today=$(date -u +%F)
cutoff=$(date -u -d "$days days ago" +%F)
prev=$(mktemp)
next=$(mktemp)
trap 'rm -f "$prev" "$next"' EXIT

# CDN-ийн кэшийг тойрч хамгийн сүүлийн жагсаалтыг авна.
if ! curl -fsS "$site/$manifest?t=$(date +%s)" -o "$prev"; then
  # Жагсаалтгүй анхны deploy: амьд sw.js-ийн precache-ээс авна.
  echo "keep-old-assets: өмнөх жагсаалт олдсонгүй, sw.js-ээс уншина"
  curl -fsS "$site/sw.js?t=$(date +%s)" 2>/dev/null |
    grep -o 'url:"assets/[^"]*"' |
    sed "s/^url:\"\(.*\)\"$/$today \1/" >"$prev" || : >"$prev"
fi

(cd "$dist" && find assets -type f) | while read -r path; do
  echo "$today $path"
done >"$next"

kept=0
dropped=0
while read -r seen path; do
  case "$path" in
    assets/*) ;;
    *) continue ;;
  esac
  case "$path" in
    *..*) continue ;;
  esac
  [ -e "$dist/$path" ] && continue
  if [ "$seen" \< "$cutoff" ]; then
    dropped=$((dropped + 1))
    continue
  fi
  mkdir -p "$dist/$(dirname "$path")"
  if curl -fsS "$site/$path" -o "$dist/$path"; then
    echo "$seen $path" >>"$next"
    kept=$((kept + 1))
  else
    rm -f "$dist/$path"
    dropped=$((dropped + 1))
  fi
done <"$prev"

sort -k2 "$next" >"$dist/$manifest"
echo "keep-old-assets: $kept хуучин файл хадгалав, $dropped хаяв"
