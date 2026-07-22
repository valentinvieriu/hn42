#!/usr/bin/env bash
set -euo pipefail

PROD_BUCKET="${HN_GLANCE_SCREENSHOT_BUCKET:-hn-glance-screenshots}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIFECYCLE_CONFIG="${SCRIPT_DIR}/cloudflare-screenshots-lifecycle.json"
EXPECTED_LIFECYCLE_RULES="3"

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
  local lifecycle_config="$1"
  local rule_id="$2"

  printf '%s\n' "$lifecycle_config" | awk -v rule_id="$rule_id" '
    BEGIN { RS = "" }
    $0 ~ ("name:[[:space:]]+" rule_id "([[:space:]]|$)") { print }
  '
}

lifecycle_rule_matches() {
  local lifecycle_config="$1"
  local rule_id="$2"
  local prefix="$3"
  local action="$4"
  local rule

  rule="$(get_lifecycle_rule "$lifecycle_config" "$rule_id")"

  [[ -n "$rule" ]] \
    && printf '%s\n' "$rule" | grep -Eq '^enabled:[[:space:]]+Yes$' \
    && printf '%s\n' "$rule" | grep -Fq "prefix:   ${prefix}" \
    && printf '%s\n' "$rule" | grep -Fq "action:   ${action}"
}

lifecycles_match() {
  local lifecycle_config="$1"
  local rule_count

  rule_count="$(printf '%s\n' "$lifecycle_config" | awk '/^name:/ { count += 1 } END { print count + 0 }')"

  [[ "$rule_count" == "$EXPECTED_LIFECYCLE_RULES" ]] \
    && lifecycle_rule_matches \
      "$lifecycle_config" \
      "abort-incomplete-multipart-uploads-after-7-days" \
      "(all prefixes)" \
      "Abort incomplete multipart uploads after 7 days" \
    && lifecycle_rule_matches \
      "$lifecycle_config" \
      "delete-screenshots-v9-after-28-days" \
      "screenshots/v9/" \
      "Expire objects after 28 days" \
    && lifecycle_rule_matches \
      "$lifecycle_config" \
      "delete-screenshot-jobs-v1-v9-after-7-days" \
      "screenshot-jobs/v1/v9/" \
      "Expire objects after 7 days"
}

ensure_lifecycles() {
  local bucket_name="$1"
  local lifecycle_config

  lifecycle_config="$("${WRANGLER[@]}" r2 bucket lifecycle list "$bucket_name")"

  if lifecycles_match "$lifecycle_config"; then
    echo "Active v9 lifecycle configuration already matches on ${bucket_name}."
    return
  fi

  echo "Replacing lifecycle configuration on ${bucket_name} with the active v9 policy."
  "${WRANGLER[@]}" r2 bucket lifecycle set \
    "$bucket_name" \
    --file "$LIFECYCLE_CONFIG" \
    --force

  lifecycle_config="$("${WRANGLER[@]}" r2 bucket lifecycle list "$bucket_name")"

  if ! lifecycles_match "$lifecycle_config"; then
    echo "Active v9 lifecycle configuration verification failed for ${bucket_name}." >&2
    return 1
  fi
}

ensure_bucket "$PROD_BUCKET"
ensure_lifecycles "$PROD_BUCKET"

echo "Cloudflare screenshot storage is ready."
