-- 2026-04-24: split payment fees into deposit/withdrawal and support
-- event-level feeCents override with rate-based fallback for the rest.
--
-- Adds four columns on activity_hourly_delta:
--   deposit_fees_sum_cents               : fee paid to processors on deposits
--   withdrawal_fees_sum_cents            : fee paid to processors on withdrawals
--   deposits_fee_attributed_sum_cents    : sum of deposit amounts whose
--                                          event carried feeCents (so the
--                                          daily cron knows what NOT to apply
--                                          the configured rate to)
--   cashouts_fee_attributed_sum_cents    : same, for withdrawals
--
-- Run after deploying the updated consumer + cron so old rows keep the
-- default value of 0 and new rows populate correctly.

ALTER TABLE affiliate.activity_hourly_delta
  ADD COLUMN IF NOT EXISTS deposit_fees_sum_cents            UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withdrawal_fees_sum_cents         UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposits_fee_attributed_sum_cents UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashouts_fee_attributed_sum_cents UInt64 DEFAULT 0;

-- Re-run scripts/clickhouse-activity-view.sql afterward so the view includes
-- the new columns in the NGR formula.
