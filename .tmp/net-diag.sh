#!/usr/bin/env bash
out=.tmp/net-diag.txt
: > "$out"
echo "== curl version" >> "$out"
curl --version >> "$out" 2>&1
echo "== env proxies" >> "$out"
env | grep -i proxy >> "$out" 2>&1
for u in "https://example.com" "https://www.gutenberg.org/cache/epub/9253/pg9253.txt" "https://gutenberg.org/cache/epub/9253/pg9253.txt" "http://www.gutenberg.org/cache/epub/9253/pg9253.txt"; do
  echo "== $u" >> "$out"
  curl -sS --ssl-no-revoke -o /dev/null -w "code=%{http_code} size=%{size_download} t=%{time_total}\n" --max-time 20 "$u" >> "$out" 2>&1
  echo "exit=$?" >> "$out"
done
echo "== verbose gutenberg" >> "$out"
curl -sS --ssl-no-revoke -v -o /dev/null --max-time 20 "https://www.gutenberg.org/cache/epub/9253/pg9253.txt" >> "$out" 2>&1
echo "DONE" >> "$out"