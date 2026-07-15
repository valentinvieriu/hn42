# HN42 screenshot capture agent

This stateless service pulls screenshot jobs from Cloudflare Queues, asks the
HN42 Worker to validate each story, captures eligible pages through the local
Browserless screenshot API, and uploads only validated WebP results to HN42.

Run multiple identical instances to increase capture capacity. Queue leases
divide work between instances. Deterministic skips and terminal target failures
are acknowledged individually; temporary network or capacity failures are
retried with delay and eventually move to the configured dead-letter queue.

Required environment variables:

- `CF_ACCOUNT_ID`
- `CF_QUEUE_ID`
- `CF_QUEUES_API_TOKEN` with read and write access to the queue
- `HN42_BASE_URL`
- `HN42_SCREENSHOT_AGENT_TOKEN`
- `SCREENSHOT_API_URL`
- `SCREENSHOT_API_TOKEN`

Optional tuning variables are `CAPTURE_CONCURRENCY`, `QUEUE_BATCH_SIZE`,
`QUEUE_VISIBILITY_TIMEOUT_MS`, `QUEUE_IDLE_POLL_MS`, and `PORT`.
Copy `capture-agent/.env.example` when configuring the container; keep the
filled file outside version control.
