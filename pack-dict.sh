#!/usr/bin/env sh
# public/dict/ доторх .aff/.dic-ийг public/dict/dictionaries.zip болгоно.
set -e
cd "$(dirname "$0")/public/dict"
files=""
for id in mn_MN en_GB en_US; do
  [ -f "$id.aff" ] && [ -f "$id.dic" ] && files="$files $id.aff $id.dic"
done
[ -z "$files" ] && { echo "Толь олдсонгүй. Эхлээд .aff/.dic-ээ public/dict/-д хийнэ үү."; exit 1; }
rm -f dictionaries.zip
zip -j -9 dictionaries.zip $files
echo "Үүсгэв: public/dict/dictionaries.zip ($(wc -c < dictionaries.zip) bytes)"
