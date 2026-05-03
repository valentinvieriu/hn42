#!/usr/bin/env bash
set -euo pipefail

PROD_BUCKET="${HN42_SCREENSHOT_BUCKET:-hn42-screenshots}"
PREVIEW_BUCKET="${HN42_SCREENSHOT_PREVIEW_BUCKET:-hn42-screenshots-dev}"
RULE_ID="${HN42_SCREENSHOT_LIFECYCLE_RULE:-delete-screenshots-v2-after-30-days}"
PREFIX="${HN42_SCREENSHOT_PREFIX:-screenshots/v2/}"
EXPIRE_DAYS="${HN42_SCREENSHOT_EXPIRE_DAYS:-30}"

WRANGLER=(npx wrangler)

bucket_exists() {
  local bucket_name="$1"

  "${WRANGLER[@]}" r2 bucket list | grep -Eq "^name:[[:space:]]+${bucket_name}$"
}

ensure_bucket() {
  local bucket_name="$1"

  if bucket_exists "$bucket_name"; then
    echo "R2 bucket already exists: ${bucket_name}"
    return
  fi

  echo "Creating R2 bucket: ${bucket_name}"
  "${WRANGLER[@]}" r2 bucket create "$bucket_name"
}

lifecycle_rule_exists() {
  local bucket_name="$1"

  "${WRANGLER[@]}" r2 bucket lifecycle list "$bucket_name" | grep -Eq "^name:[[:space:]]+${RULE_ID}$"
}

ensure_lifecycle_rule() {
  local bucket_name="$1"

  if lifecycle_rule_exists "$bucket_name"; then
    echo "Lifecycle rule already exists on ${bucket_name}: ${RULE_ID}"
    return
  fi

  echo "Adding lifecycle rule to ${bucket_name}: ${PREFIX} expires after ${EXPIRE_DAYS} days"
  "${WRANGLER[@]}" r2 bucket lifecycle add \
    "$bucket_name" \
    "$RULE_ID" \
    "$PREFIX" \
    --expire-days "$EXPIRE_DAYS" \
    --force
}

ensure_bucket "$PROD_BUCKET"
ensure_bucket "$PREVIEW_BUCKET"
ensure_lifecycle_rule "$PROD_BUCKET"
ensure_lifecycle_rule "$PREVIEW_BUCKET"

echo "Cloudflare screenshot storage is ready."
