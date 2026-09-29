#!/bin/sh
# The page's absolute URLs (canonical, Open Graph) are written as __SITE_URL__ so the
# image names no domain. Set SITE_URL (e.g. https://example.org) and nginx fills it in
# on every HTML response; leave it unset and the URLs become site-relative, which is
# fine for everything except link-preview crawlers.
#
# Runs from the nginx image's /docker-entrypoint.d/ on every container start.
set -eu

url="${SITE_URL:-}"
conf=/etc/nginx/conf.d/site-url.conf

# Only what a bare origin needs: it ends up inside an nginx string.
case "$url" in
  "") ;;
  https://*)
    url="${url%/}"
    if printf '%s' "$url" | grep -q "[\"'<>[:space:];{}\\\\]"; then
      echo "30-site-url: SITE_URL contains a character that is not allowed — using relative URLs" >&2
      url=""
    fi
    ;;
  *)
    echo "30-site-url: SITE_URL must be an https:// URL — using relative URLs" >&2
    url=""
    ;;
esac

cat >"$conf" <<EOF
sub_filter '__SITE_URL__' '$url';
EOF
echo "30-site-url: absolute URLs ${url:-relative}"
