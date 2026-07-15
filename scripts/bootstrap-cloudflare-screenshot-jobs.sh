#!/usr/bin/env bash
set -euo pipefail

QUEUE="${HN42_SCREENSHOT_QUEUE:-hn42-screenshot-jobs}"
DLQ="${HN42_SCREENSHOT_DLQ:-hn42-screenshot-jobs-dlq}"
WRANGLER=(npx wrangler)

queue_exists() {
  local queue_name="$1"

  "${WRANGLER[@]}" queues info "$queue_name" >/dev/null 2>&1
}

ensure_queue() {
  local queue_name="$1"

  if queue_exists "$queue_name"; then
    echo "Queue already exists: ${queue_name}"
    return
  fi

  echo "Creating queue: ${queue_name}"
  "${WRANGLER[@]}" queues create "$queue_name"
}

has_pull_consumer() {
  "${WRANGLER[@]}" queues info "$QUEUE" | grep -Eiq 'http[ _-]*pull|pull consumer'
}

ensure_queue "$DLQ"
ensure_queue "$QUEUE"

if has_pull_consumer; then
  echo "HTTP pull consumer already exists: ${QUEUE}"
else
  echo "Adding HTTP pull consumer: ${QUEUE}"
  "${WRANGLER[@]}" queues consumer http add "$QUEUE" \
    --batch-size 4 \
    --message-retries 5 \
    --dead-letter-queue "$DLQ" \
    --visibility-timeout-secs 180 \
    --retry-delay-secs 60
fi

echo "Cloudflare screenshot queue is ready."
