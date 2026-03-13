#!/usr/bin/env bash
set -e

if [ -z "$BRAVE_API_KEY" ]; then
  echo "Usage: BRAVE_API_KEY=your_token ./test-brave.sh [query]"
  exit 1
fi

QUERY="${1:-test}"

curl -s "https://api.search.brave.com/res/v1/web/search?q=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$QUERY'))")&count=3" \
  -H "Accept: application/json" \
  -H "X-Subscription-Token: $BRAVE_API_KEY" | jq '.web.results[] | {title, url}'
