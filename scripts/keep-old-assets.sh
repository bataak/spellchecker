#!/bin/sh
set -e

site=${1%/}
dist=${2:-dist}
days=${3:-7}
manifest=assets-kept.txt

today=$(date -u +%F)
cutoff=$(date -u -d "$days days ago" +%Y%m%d)
prev=$(mktemp)
next=$(mktemp)
trap 'rm -f "$prev" "$next"' EXIT

if ! curl -fsS "$site/$manifest?t=$(date +%s)" -o "$prev"; then
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
  case "$seen" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
    *) continue ;;
  esac
  if [ "$(echo "$seen" | tr -d -)" -lt "$cutoff" ]; then
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
