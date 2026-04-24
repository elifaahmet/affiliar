-- 2026-04-24: sportsbook support on the raw-events pipeline.
--
-- Adds two families of columns to activity_hourly_delta:
--
-- 1. Sportsbook metric columns (10) mirror the casino bucket set, scoped
--    to sportsbook events:
--      sb_bets_sum_cents               total stake placed
--      sb_settled_bets_sum_cents       stake on bets that eventually settled
--                                      (display-only, NOT used in NGR)
--      sb_cancelled_bets_sum_cents     stake on operator-cancelled bets
--      sb_rejected_bets_sum_cents      stake on operator-rejected bets
--      sb_wins_sum_cents               payouts to players
--      sb_win_rollbacks_sum_cents      payouts that were later reversed
--      sb_bonus_issues_sum_cents       sportsbook-tagged bonus issues/revokes
--      sb_balance_corrections_sum_cents admin adjustments (single bucket;
--                                       the Affilka spec doesn't split up/down)
--      sb_third_party_fees_sum_cents   bookmaker / data-feed fees
--      sb_gifts_sum_cents              free-bet gifts (display-only, not in NGR)
--
-- 2. Product-attributed bonus columns (2) add fan-out to the existing
--    generic bonus bucket:
--      casino_bonus_issues_sum_cents   bonus.granted with data.product='casino'
--      generic_bonus_issues_sum_cents  bonus.granted with data.product='generic'
--
-- The legacy `bonus_issues_sum_cents` keeps its current semantics —
-- untagged bonuses land there and feed casino_ngr (backward compat).
-- Only explicitly tagged bonuses use the new columns. See the activity
-- view for which NGR formulas subtract which bucket.
--
-- Apply order:
--   1. Run this file.
--   2. Re-run clickhouse-activity-view.sql so the view exposes the new
--      columns (including the sb_ngr_cents + combined_ngr_cents computed
--      fields).

ALTER TABLE affiliate.activity_hourly_delta
  ADD COLUMN IF NOT EXISTS sb_bets_sum_cents                UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sb_settled_bets_sum_cents        UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sb_cancelled_bets_sum_cents      UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sb_rejected_bets_sum_cents       UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sb_wins_sum_cents                UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sb_win_rollbacks_sum_cents       UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sb_bonus_issues_sum_cents        Int64  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sb_balance_corrections_sum_cents Int64  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sb_third_party_fees_sum_cents    UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sb_gifts_sum_cents               UInt64 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS casino_bonus_issues_sum_cents    Int64  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generic_bonus_issues_sum_cents   Int64  DEFAULT 0;
