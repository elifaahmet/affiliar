-- affiliate.activity: unified view over the aggregated table + raw-event delta table.
--
-- - activity_hourly (aggregated consumer) already stores ggr/ngr directly.
-- - activity_hourly_delta (raw consumer) stores only the ingredient columns
--   (bets_sum_cents, wins_sum_cents, rollbacks, bonus_issues, ...) so we
--   compute ggr/ngr on the fly here.
--
-- Keep the canonical formula in one place: this view and the read-side SQL
-- in reportController/affiliatePlayerController must stay in sync.

DROP VIEW IF EXISTS affiliate.activity;

CREATE VIEW affiliate.activity AS
SELECT
    tenant_id, brand_id, player_id, currency, country, from_ts,
    affiliate_id, affiliate_code, campaign, sub_id,
    registrations, ftd_count, ftd_sum_cents,
    deposits_count, deposits_sum_cents,
    cashouts_count, cashouts_sum_cents,
    chargebacks_count, chargebacks_sum_cents,
    bets_sum_cents, wins_sum_cents,
    casino_bets_rollbacks_sum_cents, casino_wins_rollbacks_sum_cents,
    bonus_issues_sum_cents, additional_deductions_sum_cents,
    payment_system_fees_sum_cents, jackpot_fees_sum_cents,
    game_provider_fees_sum_cents, casino_taxes_sum_cents,
    rounds_count, wager_cents,
    casino_ggr_cents, casino_ngr_cents
FROM affiliate.activity_hourly FINAL

UNION ALL

SELECT
    tenant_id, brand_id, player_id, currency, country,
    hour_bucket AS from_ts,
    affiliate_id, affiliate_code, campaign, sub_id,
    registrations, ftd_count, ftd_sum_cents,
    deposits_count, deposits_sum_cents,
    cashouts_count, cashouts_sum_cents,
    chargebacks_count, chargebacks_sum_cents,
    bets_sum_cents, wins_sum_cents,
    casino_bets_rollbacks_sum_cents, casino_wins_rollbacks_sum_cents,
    bonus_issues_sum_cents, additional_deductions_sum_cents,
    payment_system_fees_sum_cents, jackpot_fees_sum_cents,
    game_provider_fees_sum_cents, casino_taxes_sum_cents,
    rounds_count, wager_cents,
    -- GGR = (bets - bet_rollbacks) - (wins - win_rollbacks)
    ((bets_sum_cents - casino_bets_rollbacks_sum_cents)
     - (wins_sum_cents - casino_wins_rollbacks_sum_cents)) AS casino_ggr_cents,
    -- NGR = GGR - bonus_issues - additional_deductions - casino_taxes
    (((bets_sum_cents - casino_bets_rollbacks_sum_cents)
      - (wins_sum_cents - casino_wins_rollbacks_sum_cents))
     - bonus_issues_sum_cents
     - additional_deductions_sum_cents
     - casino_taxes_sum_cents) AS casino_ngr_cents
FROM affiliate.activity_hourly_delta;
