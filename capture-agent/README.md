# HN Glance screenshot capture agent

This stateless service pulls screenshot jobs from Cloudflare Queues, asks the
HN Glance Worker to validate each story, captures eligible HTML pages or the first
page of PDF documents through the local Browserless screenshot API, and uploads
only validated WebP results to HN Glance.
The Browserless service owns publisher routing: both its direct and Ladder
results are accepted when their outcome and bounded image metadata validate.

Run multiple identical instances to increase capture capacity. Queue leases
divide work between instances. Deterministic skips and terminal target failures
are acknowledged individually; temporary network or capacity failures are
retried with delay and eventually move to the configured dead-letter queue.
Structured stdout records skipped reasons and terminal target details without
adding Cloudflare storage writes.

Required environment variables:

- `CF_ACCOUNT_ID`
- `CF_QUEUE_ID`
- `CF_QUEUES_API_TOKEN` with read and write access to the queue
- `HN_GLANCE_BASE_URL`
- `HN_GLANCE_SCREENSHOT_AGENT_TOKEN`
- `SCREENSHOT_API_URL`
- `SCREENSHOT_API_TOKEN`

Optional tuning variables are `CAPTURE_CONCURRENCY`, `QUEUE_BATCH_SIZE`,
`QUEUE_VISIBILITY_TIMEOUT_MS`, `QUEUE_IDLE_POLL_MS`, and `PORT`.
Copy `capture-agent/.env.example` when configuring the container; keep the
filled file outside version control.
