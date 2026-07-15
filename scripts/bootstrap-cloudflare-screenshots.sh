#!/usr/bin/env bash
set -euo pipefail

PROD_BUCKET="${HN42_SCREENSHOT_BUCKET:-hn42-screenshots}"
LEGACY_RULE_ID="delete-screenshots-v3-after-180-days"
LEGACY_PREFIX="screenshots/v3/"
PREVIOUS_V4_RULE_ID="delete-screenshots-v4-after-180-days"
PREVIOUS_V4_PREFIX="screenshots/v4/"
PREVIOUS_V5_RULE_ID="delete-screenshots-v5-after-180-days"
PREVIOUS_V5_PREFIX="screenshots/v5/"
PREVIOUS_V6_RULE_ID="delete-screenshots-v6-after-180-days"
PREVIOUS_V6_PREFIX="screenshots/v6/"
PREVIOUS_V7_RULE_ID="delete-screenshots-v7-after-180-days"
PREVIOUS_V7_PREFIX="screenshots/v7/"
LEGACY_EXPIRE_DAYS="180"
RULE_ID="${HN42_SCREENSHOT_LIFECYCLE_RULE:-delete-screenshots-v8-after-30-days}"
PREFIX="${HN42_SCREENSHOT_PREFIX:-screenshots/v8/}"
EXPIRE_DAYS="${HN42_SCREENSHOT_EXPIRE_DAYS:-30}"
ADMISSION_RULE_ID="delete-screenshot-jobs-v1-after-7-days"
ADMISSION_PREFIX="screenshot-jobs/v1/"
ADMISSION_EXPIRE_DAYS="7"

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
  local rule_id="$2"

  "${WRANGLER[@]}" r2 bucket lifecycle list "$bucket_name" | awk -v rule_id="$rule_id" '
    BEGIN { RS = "" }
    $0 ~ ("name:[[:space:]]+" rule_id "([[:space:]]|$)") { print }
  '
}

lifecycle_rule_matches() {
  local bucket_name="$1"
  local rule_id="$2"
  local prefix="$3"
  local expire_days="$4"
  local rule

  rule="$(get_lifecycle_rule "$bucket_name" "$rule_id")"

  [[ -n "$rule" ]] \
    && printf '%s\n' "$rule" | grep -Eq '^enabled:[[:space:]]+Yes$' \
    && printf '%s\n' "$rule" | grep -Fq "prefix:   ${prefix}" \
    && printf '%s\n' "$rule" | grep -Fq "action:   Expire objects after ${expire_days} days"
}

ensure_lifecycle_rule() {
  local bucket_name="$1"
  local rule_id="$2"
  local prefix="$3"
  local expire_days="$4"

  if lifecycle_rule_matches "$bucket_name" "$rule_id" "$prefix" "$expire_days"; then
    echo "Lifecycle rule already exists on ${bucket_name}: ${rule_id}"
    return
  fi

  if [[ -n "$(get_lifecycle_rule "$bucket_name" "$rule_id")" ]]; then
    echo "Lifecycle rule ${rule_id} exists but does not match prefix ${prefix} and ${expire_days}-day expiry." >&2
    echo "Remove or repair the drifted rule before rerunning this script." >&2
    return 1
  fi

  echo "Adding lifecycle rule to ${bucket_name}: ${prefix} expires after ${expire_days} days"
  "${WRANGLER[@]}" r2 bucket lifecycle add \
    "$bucket_name" \
    "$rule_id" \
    "$prefix" \
    --expire-days "$expire_days" \
    --force

  if ! lifecycle_rule_matches "$bucket_name" "$rule_id" "$prefix" "$expire_days"; then
    echo "Lifecycle rule verification failed for ${bucket_name}: ${rule_id}" >&2
    return 1
  fi
}

ensure_bucket "$PROD_BUCKET"
ensure_lifecycle_rule "$PROD_BUCKET" "$LEGACY_RULE_ID" "$LEGACY_PREFIX" "$LEGACY_EXPIRE_DAYS"
ensure_lifecycle_rule "$PROD_BUCKET" "$PREVIOUS_V4_RULE_ID" "$PREVIOUS_V4_PREFIX" "$LEGACY_EXPIRE_DAYS"
ensure_lifecycle_rule "$PROD_BUCKET" "$PREVIOUS_V5_RULE_ID" "$PREVIOUS_V5_PREFIX" "$LEGACY_EXPIRE_DAYS"
ensure_lifecycle_rule "$PROD_BUCKET" "$PREVIOUS_V6_RULE_ID" "$PREVIOUS_V6_PREFIX" "$LEGACY_EXPIRE_DAYS"
ensure_lifecycle_rule "$PROD_BUCKET" "$PREVIOUS_V7_RULE_ID" "$PREVIOUS_V7_PREFIX" "$LEGACY_EXPIRE_DAYS"
ensure_lifecycle_rule "$PROD_BUCKET" "$RULE_ID" "$PREFIX" "$EXPIRE_DAYS"
ensure_lifecycle_rule "$PROD_BUCKET" "$ADMISSION_RULE_ID" "$ADMISSION_PREFIX" "$ADMISSION_EXPIRE_DAYS"

echo "Cloudflare screenshot storage is ready."
