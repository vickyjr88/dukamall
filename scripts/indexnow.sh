#!/usr/bin/env bash
#
# Tells Bing (and other IndexNow search engines: Yandex, Seznam, Naver) which of a shop's pages exist or changed, so
# new and updated pages are crawled in minutes instead of whenever the engine next visits. Bing's index also feeds
# ChatGPT search and Copilot, so this matters for AI visibility too. Google does not use IndexNow (submit the sitemap
# in Search Console).
#
# Every shop domain serves the same key at /indexnow-key.txt (web/app/indexnow-key.txt/route.ts), so it works for any
# shop without a per-shop file. Safe to run repeatedly; run it after a deploy that adds pages, or weekly from cron:
#   0 5 * * 1 /root/shops-platform/scripts/indexnow.sh >> /var/log/indexnow.log 2>&1
#
# Usage: scripts/indexnow.sh [https://shop.example ...]   (default: every live shop below)

set -Eeuo pipefail

SITES=("$@")
[[ ${#SITES[@]} -gt 0 ]] || SITES=(https://nairobigents.com https://msa.dripemporium.store)

submit() {
  local site="$1" key payload code
  key="$(curl -fsS "${site}/indexnow-key.txt")" || { echo "${site}: key file is not live yet (deploy first)." >&2; return 1; }
  payload="$(curl -fsS "${site}/sitemap.xml" | python3 -c '
import json, re, sys
site, key = sys.argv[1], sys.argv[2]
urls = re.findall(r"<loc>([^<]+)</loc>", sys.stdin.read())
print(json.dumps({"host": site.split("//", 1)[1], "key": key, "keyLocation": f"{site}/indexnow-key.txt", "urlList": urls}))
' "${site}" "${key}")"

  echo "${site}: submitting $(echo "${payload}" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["urlList"]))') URLs to IndexNow"
  # A brand-new key is validated lazily: the first submission can come back 403 until IndexNow has fetched the key file.
  for attempt in 1 2 3; do
    code="$(curl -sS -o /dev/null -w "%{http_code}" -X POST "https://api.indexnow.org/indexnow" \
      -H "Content-Type: application/json; charset=utf-8" -d "${payload}")"
    echo "${site}: IndexNow responded HTTP ${code} (200 or 202 = accepted)"
    [[ "${code}" == "200" || "${code}" == "202" ]] && return 0
    [[ "${code}" == "403" && "${attempt}" -lt 3 ]] || break
    echo "403 usually means the new key has not been validated yet; retrying in 30 seconds (attempt ${attempt} of 3)"
    sleep 30
  done
  return 1
}

status=0
for site in "${SITES[@]}"; do submit "${site%/}" || status=1; done
exit "${status}"
