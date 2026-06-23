#!/usr/bin/env sh
set -e
cd "$(dirname "$0")/public/dict"

rm -f ./*.gz dict-manifest.json

entries=""
for id in mn_MN en_GB en_US; do
  [ -f "$id.aff" ] && [ -f "$id.dic" ] || continue

  ver=$(grep -m1 '^#\?[[:space:]]*Version:' "$id.aff" | sed 's/^#\?[[:space:]]*Version:[[:space:]]*//')
  slug=""
  if [ -n "$ver" ]; then
    slug=$(printf '%s' "$ver" | tr -c 'A-Za-z0-9.' '-' | sed 's/-\{2,\}/-/g; s/^-//; s/-$//')
  fi
  if [ -z "$slug" ]; then
    ver=$(cat "$id.aff" "$id.dic" | sha256sum | cut -c1-12)
    slug="$ver"
  fi

  aff_out="$id.$slug.aff.gz"
  dic_out="$id.$slug.dic.gz"
  gzip -9 -c "$id.aff" > "$aff_out"
  gzip -9 -c "$id.dic" > "$dic_out"

  ver_json=$(printf '%s' "$ver" | sed 's/\\/\\\\/g; s/"/\\"/g')
  entry="{\"id\":\"$id\",\"version\":\"$ver_json\",\"aff\":\"$aff_out\",\"dic\":\"$dic_out\"}"
  entries="$entries${entries:+,}$entry"
  echo "Үүсгэв: $aff_out, $dic_out (v$ver)"
done

[ -z "$entries" ] && { echo "Толь олдсонгүй. Эхлээд .aff/.dic-ээ public/dict/-д хийнэ үү."; exit 1; }

printf '{"dicts":[%s]}\n' "$entries" > dict-manifest.json
echo "Үүсгэв: dict-manifest.json"
