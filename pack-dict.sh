#!/usr/bin/env sh
set -e
root="$(dirname "$0")"
src="$root/public/dict"
out="${1:-$root/dist}/dict"

mkdir -p "$out"
rm -f "$out"/*.gz "$out/dict-manifest.json"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

entries=""
for id in mn_MN en_GB en_US; do
  [ -f "$src/$id.aff" ] && [ -f "$src/$id.dic" ] || continue

  ver=$(grep -m1 -E '^#?[[:space:]]*Version:' "$src/$id.aff" | sed -E 's/^#?[[:space:]]*Version:[[:space:]]*//')
  [ -z "$ver" ] && ver="0"

  slug=$(printf '%s' "$ver" | sed 's/[^A-Za-z0-9._-]/-/g; s/-\{2,\}/-/g; s/^-//; s/-$//')
  [ -z "$slug" ] && slug="0"

  sum=$(cat "$src/$id.aff" "$src/$id.dic" | sha256sum | cut -c1-10)
  aff_out="$id.$slug.$sum.aff.gz"
  dic_out="$id.$slug.$sum.dic.gz"
  gzip -9 -c "$src/$id.aff" > "$out/$aff_out"
  gzip -9 -c "$src/$id.dic" > "$out/$dic_out"
  rm -f "$out/$id.aff" "$out/$id.dic"

  entry="{\"id\":\"$id\",\"version\":\"$(json_escape "$ver")\",\"aff\":\"$aff_out\",\"dic\":\"$dic_out\"}"
  entries="$entries${entries:+,}$entry"
  echo "Үүсгэв: $out/$aff_out, $out/$dic_out (v$ver)"
done
 
[ -z "$entries" ] && { echo "Толь олдсонгүй. public/dict/-д .aff/.dic байгаа эсэхээ шалга."; exit 1; }

printf '{"dicts":[%s]}\n' "$entries" > "$out/dict-manifest.json"
echo "Үүсгэв: $out/dict-manifest.json"
