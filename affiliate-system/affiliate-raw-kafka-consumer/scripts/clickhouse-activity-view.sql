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
-- Product scoping (casino / sportsbook / combined)
-- ----------------------------------------------------------------------
-- Bonus attribution uses three buckets:
--   - bonus_issues_sum_cents            (legacy, untagged)   → casino + combined
--   - casino_bonus_issues_sum_cents     (product='casino')   → casino + combined
--   - sb_bonus_issues_sum_cents         (product='sportsbook') → sportsbook + combined
--   - generic_bonus_issues_sum_cents    (product='generic')  → combined only
--
-- Corrections:
--   - corrections_up/down_sum_cents     (casino)             → casino + combined
--   - sb_balance_corrections_sum_cents  (sportsbook)         → sportsbook + combined
--
-- Wallet-shared fees (deposit/withdrawal/payment_system, chargebacks)
-- subtract from casino_ngr for backward compatibility. sb_ngr leaves them
-- out. combined_ngr = casino_ngr + sb_ngr − generic_bonus (no double count;
-- wallet-shared fees come through casino_ngr, sb_ngr adds sb-specific
-- deductions, generic bonus is the only leftover).
--
-- Formulas:
--   casino_ggr = (bets - bet_rollbacks) - (wins - win_rollbacks)
--   casino_ngr = casino_ggr
--              - bonus_issues - casino_bonus_issues
--              - chargebacks
--              - corrections_down + corrections_up
--              - additional_deductions - casino_taxes
--              - payment_system_fees - jackpot_fees - game_provider_fees
--              - deposit_fees - withdrawal_fees
--
--   sb_ggr = sb_bets
--          - sb_cancelled_bets - sb_rejected_bets
--          - (sb_wins - sb_win_rollbacks)
--   sb_ngr = sb_ggr
--          - sb_bonus_issues - sb_balance_corrections
--          - sb_third_party_fees
--
--   combined_ngr = casino_ngr + sb_ngr - generic_bonus_issues
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
    -- Sportsbook + product-attributed bonus buckets: not populated by the
    -- legacy aggregated table.
    0 AS sb_bets_sum_cents,
    0 AS sb_settled_bets_sum_cents,
    0 AS sb_cancelled_bets_sum_cents,
    0 AS sb_rejected_bets_sum_cents,
    0 AS sb_wins_sum_cents,
    0 AS sb_win_rollbacks_sum_cents,
    0 AS sb_bonus_issues_sum_cents,
    0 AS sb_balance_corrections_sum_cents,
    0 AS sb_third_party_fees_sum_cents,
    0 AS sb_gifts_sum_cents,
    0 AS casino_bonus_issues_sum_cents,
    0 AS generic_bonus_issues_sum_cents,
    casino_ggr_cents, casino_ngr_cents,
    -- On the aggregated path the pre-sportsbook NGR IS the casino NGR,
    -- so combined_ngr collapses to it and sb_ngr is 0.
    toInt64(0)               AS sb_ggr_cents,
    toInt64(0)               AS sb_ngr_cents,
    toInt64(casino_ngr_cents) AS combined_ngr_cents
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
    sb_bets_sum_cents,
    sb_settled_bets_sum_cents,
    sb_cancelled_bets_sum_cents,
    sb_rejected_bets_sum_cents,
    sb_wins_sum_cents,
    sb_win_rollbacks_sum_cents,
    sb_bonus_issues_sum_cents,
    sb_balance_corrections_sum_cents,
    sb_third_party_fees_sum_cents,
    sb_gifts_sum_cents,
    casino_bonus_issues_sum_cents,
    generic_bonus_issues_sum_cents,
    -- casino_ggr: net casino stake minus net payouts
    ((toInt64(bets_sum_cents) - toInt64(casino_bets_rollbacks_sum_cents))
     - (toInt64(wins_sum_cents) - toInt64(casino_wins_rollbacks_sum_cents))) AS casino_ggr_cents,
    -- casino_ngr: standard deduction set plus both bonus buckets that
    -- feed into casino (legacy untagged + product='casino').
    (((toInt64(bets_sum_cents) - toInt64(casino_bets_rollbacks_sum_cents))
      - (toInt64(wins_sum_cents) - toInt64(casino_wins_rollbacks_sum_cents)))
     - toInt64(bonus_issues_sum_cents)
     - toInt64(casino_bonus_issues_sum_cents)
     - toInt64(chargebacks_sum_cents)
     - toInt64(corrections_down_sum_cents)
     + toInt64(corrections_up_sum_cents)
     - toInt64(additional_deductions_sum_cents)
     - toInt64(casino_taxes_sum_cents)
     - toInt64(payment_system_fees_sum_cents)
     - toInt64(jackpot_fees_sum_cents)
     - toInt64(game_provider_fees_sum_cents)
     - toInt64(deposit_fees_sum_cents)
     - toInt64(withdrawal_fees_sum_cents)) AS casino_ngr_cents,
    -- sb_ggr: sportsbook stake minus operator-rejected/cancelled stake
    -- and net payouts.
    (toInt64(sb_bets_sum_cents)
     - toInt64(sb_cancelled_bets_sum_cents)
     - toInt64(sb_rejected_bets_sum_cents)
     - (toInt64(sb_wins_sum_cents) - toInt64(sb_win_rollbacks_sum_cents))) AS sb_ggr_cents,
    -- sb_ngr: sportsbook-specific deductions only. Shared wallet fees are
    -- carried by casino_ngr / combined_ngr so sb-only plans aren't
    -- double-charged.
    ((toInt64(sb_bets_sum_cents)
      - toInt64(sb_cancelled_bets_sum_cents)
      - toInt64(sb_rejected_bets_sum_cents)
      - (toInt64(sb_wins_sum_cents) - toInt64(sb_win_rollbacks_sum_cents)))
     - toInt64(sb_bonus_issues_sum_cents)
     - toInt64(sb_balance_corrections_sum_cents)
     - toInt64(sb_third_party_fees_sum_cents)) AS sb_ngr_cents,
    -- combined_ngr: casino + sb minus the generic bonus bucket that
    -- didn't feed either product-scoped NGR. Wallet-shared fees already
    -- flow through casino_ngr so no double-counting.
    ((((toInt64(bets_sum_cents) - toInt64(casino_bets_rollbacks_sum_cents))
       - (toInt64(wins_sum_cents) - toInt64(casino_wins_rollbacks_sum_cents)))
      - toInt64(bonus_issues_sum_cents)
      - toInt64(casino_bonus_issues_sum_cents)
      - toInt64(chargebacks_sum_cents)
      - toInt64(corrections_down_sum_cents)
      + toInt64(corrections_up_sum_cents)
      - toInt64(additional_deductions_sum_cents)
      - toInt64(casino_taxes_sum_cents)
      - toInt64(payment_system_fees_sum_cents)
      - toInt64(jackpot_fees_sum_cents)
      - toInt64(game_provider_fees_sum_cents)
      - toInt64(deposit_fees_sum_cents)
      - toInt64(withdrawal_fees_sum_cents))
     +
     ((toInt64(sb_bets_sum_cents)
       - toInt64(sb_cancelled_bets_sum_cents)
       - toInt64(sb_rejected_bets_sum_cents)
       - (toInt64(sb_wins_sum_cents) - toInt64(sb_win_rollbacks_sum_cents)))
      - toInt64(sb_bonus_issues_sum_cents)
      - toInt64(sb_balance_corrections_sum_cents)
      - toInt64(sb_third_party_fees_sum_cents))
     - toInt64(generic_bonus_issues_sum_cents)) AS combined_ngr_cents
FROM affiliate.activity_hourly_delta;
