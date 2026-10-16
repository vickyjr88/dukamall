#!/usr/bin/env bash
# Read-only checks for "my new domain shows 502/404". Changes nothing.
#
#   bash scripts/diagnose-domain.sh nairobigents.com            # web slot ports 3203/3204, API 3211/3212
#
# Prints, in order: what the web app says for the domain (bypassing nginx), whether the
# backend knows the domain, the nginx site + upstream + extension setup, and the site's
# recent error log. Paste the output back if you need help reading it.
set -u
DOMAIN="${1:?usage: diagnose-domain.sh <domain>}"
WEB_PORTS="${WEB_PORTS:-3203 3204}"
API_PORTS="${API_PORTS:-3211 3212}"
VHOST_DIR="${VHOST_DIR:-/www/server/panel/vhost/nginx}"
LOG_DIR="${LOG_DIR:-/www/wwwlogs}"
hr() { printf '\n== %s\n' "$1"; }

hr "1. Web app, asked directly (bypasses nginx): Host=$DOMAIN and www.$DOMAIN"
for p in $WEB_PORTS; do
  for h in "$DOMAIN" "www.$DOMAIN"; do
    code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -H "Host: $h" "http://127.0.0.1:$p/" 2>/dev/null)
    printf '  port %s  Host=%-28s -> %s\n' "$p" "$h" "$code"
  done
done
echo "  (404 = the platform does not know this domain; 200 = the app is fine, look at nginx)"

hr "2. Backend: does it know the domain? (prints only slug + primary domain)"
for p in $API_PORTS; do
  body=$(curl -s -m 10 "http://127.0.0.1:$p/resolve-shop/$DOMAIN" 2>/dev/null)
  code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$p/resolve-shop/$DOMAIN" 2>/dev/null)
  printf '  api %s -> %s  %s %s\n' "$p" "$code" "$(echo "$body" | grep -o '"slug":"[^"]*"')" "$(echo "$body" | grep -o '"customDomain":[^,}]*')"
done
echo "  (404 here = domain not connected/verified for any shop: Portal -> Domain -> Verify)"

hr "3. nginx site config for $DOMAIN"
FILES=$(grep -ls "server_name.*$DOMAIN" "$VHOST_DIR"/*.conf 2>/dev/null)
if [ -z "$FILES" ]; then echo "  no site file found under $VHOST_DIR mentioning $DOMAIN"; fi
for f in $FILES; do
  echo "  file: $f"
  grep -nE "server_name|proxy_pass|proxy_set_header|proxy_next_upstream|include .*extension|listen " "$f" | sed 's/^/    /'
done
SITE=$(basename "${FILES%%$'\n'*}" .conf 2>/dev/null)
echo "  extension dir: $VHOST_DIR/extension/$SITE/"
ls -la "$VHOST_DIR/extension/$SITE/" 2>&1 | sed 's/^/    /'
for e in "$VHOST_DIR/extension/$SITE"/*.conf; do [ -f "$e" ] && { echo "    --- $e"; sed 's/^/    /' "$e"; }; done

# aaPanel keeps a site's reverse-proxy settings (proxy_pass, the Host header sent to
# the app) in their own file, outside the site file above.
hr "3b. Reverse-proxy settings for $DOMAIN (aaPanel proxy/ dir)"
for d in "$VHOST_DIR/proxy/$SITE" "$VHOST_DIR/proxy/$DOMAIN"; do
  [ -d "$d" ] || continue
  for f in "$d"/*.conf; do [ -f "$f" ] && { echo "  --- $f"; sed 's/^/    /' "$f"; }; done
done
echo
echo "  Test: what the app answers if nginx sent the WRONG Host header (404 here would explain a 502):"
printf '    Host=shops_web -> %s\n' "$(curl -s -m 10 -o /dev/null -w '%{http_code}' -H 'Host: shops_web' http://127.0.0.1:3204/ 2>/dev/null)"

hr "4. Upstream definitions"
grep -rn -A4 "upstream shops_web" "$VHOST_DIR" /www/server/nginx/conf 2>/dev/null | sed 's/^/  /' | head -12

hr "5. nginx config test"
nginx -t 2>&1 | sed 's/^/  /'

hr "6. Last error-log lines for the site"
for l in "$LOG_DIR/$DOMAIN.error.log" "$LOG_DIR/$SITE.error.log"; do
  [ -f "$l" ] && { echo "  $l"; tail -n 12 "$l" | sed 's/^/    /'; break; }
done

hr "7. Containers"
docker ps --format '  {{.Names}}  {{.Status}}  {{.Ports}}' 2>/dev/null | grep -i "shops-platform" | head -12
