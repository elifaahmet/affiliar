-- affiliate.activity: unified view over the aggregated table + raw-event delta table.
--
-- - activity_hourly (aggregated consumer) already stores ggr/ngr directly.
-- - activity_hourly_delta (raw consumer) stores only the ingredient columns
--   (bets_sum_cents, wins_sum_cents, rollbacks, bonus_issues, ...) so we
--   compute ggr/ngr on the fly here.
--
-- Keep the canonical formula in one place: this view and the read-side SQL
-- in reportController/affiliatePlayerController must stay in sync.
--
-- Provider-scoped NGR formula:
--   GGR = (bets - bet_rollbacks) - (wins - win_rollbacks)
--   NGR = GGR
--       - bonus_issues - chargebacks
--       - corrections_down + corrections_up
--       - additional_deductions - casino_taxes
--       - payment_system_fees - jackpot_fees - game_provider_fees
--       - deposit_fees - withdrawal_fees
--
-- `payment_system_fees_sum_cents` is the legacy aggregated-path bucket; the
-- raw-events pipeline splits it into the deposit/withdrawal pair. Both flow
-- into NGR so operators can migrate gradually without double-counting (a
-- legacy sender won't populate the new columns, and the new cron won't write
-- to the legacy column anymore).
--
-- Fee columns are written by affiliate-be's daily fees job.

DROP VIEW IF EXISTS affiliate.activity;

CREATE VIEW affiliate.activity AS
SELECT
    tenant_id, brand_id, player_id, currency, country, from_ts,
    affiliate_id, affiliate_code, campaign, sub_id, provider,
    registrations, ftd_count, ftd_sum_cents,
    deposits_count, deposits_sum_cents,
    cashouts_count, cashouts_sum_cents,
    chargebacks_count, chargebacks_sum_cents,
    bets_sum_cents, wins_sum_cents,
    casino_bets_rollbacks_sum_cents, casino_wins_rollbacks_sum_cents,
    bonus_issues_sum_cents, additional_deductions_sum_cents,
    payment_system_fees_sum_cents, jackpot_fees_sum_cents,
    game_provider_fees_sum_cents, casino_taxes_sum_cents,
    corrections_up_sum_cents, corrections_down_sum_cents,
    rounds_count, wager_cents,
    0 AS deposit_fees_sum_cents,
    0 AS withdrawal_fees_sum_cents,
    0 AS deposits_fee_attributed_sum_cents,
    0 AS cashouts_fee_attributed_sum_cents,
    casino_ggr_cents, casino_ngr_cents
FROM affiliate.activity_hourly FINAL

UNION ALL

SELECT
    tenant_id, brand_id, player_id, currency, country,
    hour_bucket AS from_ts,
    affiliate_id, affiliate_code, campaign, sub_id, provider,
    registrations, ftd_count, ftd_sum_cents,
    deposits_count, deposits_sum_cents,
    cashouts_count, cashouts_sum_cents,
    chargebacks_count, chargebacks_sum_cents,
    bets_sum_cents, wins_sum_cents,
    casino_bets_rollbacks_sum_cents, casino_wins_rollbacks_sum_cents,
    bonus_issues_sum_cents, additional_deductions_sum_cents,
    payment_system_fees_sum_cents, jackpot_fees_sum_cents,
    game_provider_fees_sum_cents, casino_taxes_sum_cents,
    corrections_up_sum_cents, corrections_down_sum_cents,
    rounds_count, wager_cents,
    deposit_fees_sum_cents,
    withdrawal_fees_sum_cents,
    deposits_fee_attributed_sum_cents,
    cashouts_fee_attributed_sum_cents,
    ((bets_sum_cents - casino_bets_rollbacks_sum_cents)
     - (wins_sum_cents - casino_wins_rollbacks_sum_cents)) AS casino_ggr_cents,
    (((bets_sum_cents - casino_bets_rollbacks_sum_cents)
      - (wins_sum_cents - casino_wins_rollbacks_sum_cents))
     - bonus_issues_sum_cents
     - chargebacks_sum_cents
     - corrections_down_sum_cents
     + corrections_up_sum_cents
     - additional_deductions_sum_cents
     - casino_taxes_sum_cents
     - payment_system_fees_sum_cents
     - jackpot_fees_sum_cents
     - game_provider_fees_sum_cents
     - deposit_fees_sum_cents
     - withdrawal_fees_sum_cents) AS casino_ngr_cents
FROM affiliate.activity_hourly_delta;
