#!/usr/bin/env bash
set -euo pipefail

PROD_BUCKET="${HN42_SCREENSHOT_BUCKET:-hn42-screenshots}"
RULE_ID="${HN42_SCREENSHOT_LIFECYCLE_RULE:-delete-screenshots-v3-after-180-days}"
PREFIX="${HN42_SCREENSHOT_PREFIX:-screenshots/v3/}"
EXPIRE_DAYS="${HN42_SCREENSHOT_EXPIRE_DAYS:-180}"

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

get_lifecycle_rule() {
  local bucket_name="$1"

  "${WRANGLER[@]}" r2 bucket lifecycle list "$bucket_name" | awk -v rule_id="$RULE_ID" '
    BEGIN { RS = "" }
    $0 ~ ("name:[[:space:]]+" rule_id "([[:space:]]|$)") { print }
  '
}

lifecycle_rule_matches() {
  local bucket_name="$1"
  local rule

  rule="$(get_lifecycle_rule "$bucket_name")"

  [[ -n "$rule" ]] \
    && printf '%s\n' "$rule" | grep -Eq '^enabled:[[:space:]]+Yes$' \
    && printf '%s\n' "$rule" | grep -Fq "prefix:   ${PREFIX}" \
    && printf '%s\n' "$rule" | grep -Fq "action:   Expire objects after ${EXPIRE_DAYS} days"
}

ensure_lifecycle_rule() {
  local bucket_name="$1"

  if lifecycle_rule_matches "$bucket_name"; then
    echo "Lifecycle rule already exists on ${bucket_name}: ${RULE_ID}"
    return
  fi

  if [[ -n "$(get_lifecycle_rule "$bucket_name")" ]]; then
    echo "Lifecycle rule ${RULE_ID} exists but does not match prefix ${PREFIX} and ${EXPIRE_DAYS}-day expiry." >&2
    echo "Remove or repair the drifted rule before rerunning this script." >&2
    return 1
  fi

  echo "Adding lifecycle rule to ${bucket_name}: ${PREFIX} expires after ${EXPIRE_DAYS} days"
  "${WRANGLER[@]}" r2 bucket lifecycle add \
    "$bucket_name" \
    "$RULE_ID" \
    "$PREFIX" \
    --expire-days "$EXPIRE_DAYS" \
    --force

  if ! lifecycle_rule_matches "$bucket_name"; then
    echo "Lifecycle rule verification failed for ${bucket_name}: ${RULE_ID}" >&2
    return 1
  fi
}

ensure_bucket "$PROD_BUCKET"
ensure_lifecycle_rule "$PROD_BUCKET"

echo "Cloudflare screenshot storage is ready."
