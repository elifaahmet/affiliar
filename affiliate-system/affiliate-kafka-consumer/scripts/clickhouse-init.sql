CREATE DATABASE IF NOT EXISTS affiliate;

-- activity_hourly: canonical reporting table for aggregated casino activity events.
-- One row per tenant + brand + player + currency + period.
-- Amounts are stored as integers (cents) for precision.
-- ReplacingMergeTree deduplicates by (tenant_id, brand_id, from_ts, to_ts, player_id, currency)
-- on merge — source_event_id is the version column (latest wins).

CREATE TABLE IF NOT EXISTS affiliate.activity_hourly
(
    -- Identity
    source_event_id             String,
    tenant_id                   LowCardinality(String),
    brand_id                    LowCardinality(String),
    operator_id                 LowCardinality(String),

    -- Period
    from_ts                     DateTime64(0, 'UTC'),
    to_ts                       DateTime64(0, 'UTC'),
    granularity                 LowCardinality(String),

    -- Player
    player_id                   String,
    currency                    LowCardinality(String),
    country                     LowCardinality(String),

    -- Affiliate
    affiliate_id                String,
    affiliate_code              String,
    campaign                    String,
    sub_id                      String,

    -- Registrations & FTD
    registrations               UInt32,
    ftd_count                   UInt32,
    ftd_sum_cents               UInt64,

    -- Deposits & cashouts
    deposits_count              UInt32,
    deposits_sum_cents          UInt64,
    cashouts_count              UInt32,
    cashouts_sum_cents          UInt64,

    -- Chargebacks
    chargebacks_count           UInt32,
    chargebacks_sum_cents       UInt64,

    -- Bets & wins
    bets_sum_cents                      UInt64,
    wins_sum_cents                      UInt64,
    casino_bets_rollbacks_sum_cents     UInt64,
    casino_wins_rollbacks_sum_cents     UInt64,

    -- Fee deductions
    bonus_issues_sum_cents              UInt64,
    additional_deductions_sum_cents     UInt64,
    payment_system_fees_sum_cents       UInt64,
    jackpot_fees_sum_cents              UInt64,
    game_provider_fees_sum_cents        UInt64,
    casino_taxes_sum_cents              UInt64,

    -- Engagement
    rounds_count    UInt32,
    wager_cents     UInt64,

    -- Never written by this consumer; present so the activity view's UNION ALL
    -- matches the delta branch, which does carry them.
    provider                    LowCardinality(String) DEFAULT '',
    corrections_up_sum_cents    Int64 DEFAULT 0,
    corrections_down_sum_cents  Int64 DEFAULT 0,

    -- Derived metrics (server-computed)
    casino_ggr_cents    Int64,
    casino_ngr_cents    Int64,

    -- Mismatch flags (1 = producer value differed from server-computed)
    ggr_mismatch    UInt8 DEFAULT 0,
    ngr_mismatch    UInt8 DEFAULT 0,

    -- Player statuses (1 = true)
    is_duplicate        UInt8 DEFAULT 0,
    is_disabled         UInt8 DEFAULT 0,
    is_self_excluded    UInt8 DEFAULT 0,
    is_verified         UInt8 DEFAULT 0,

    -- Source metadata
    source_system       LowCardinality(String),
    source_trace_id     String,
    source_produced_at  DateTime64(0, 'UTC'),

    INDEX idx_affiliate_id  affiliate_id    TYPE bloom_filter(0.01) GRANULARITY 8,
    INDEX idx_player_id     player_id       TYPE bloom_filter(0.01) GRANULARITY 8,
    INDEX idx_affiliate_code affiliate_code TYPE bloom_filter(0.01) GRANULARITY 8,
    INDEX idx_campaign      campaign        TYPE bloom_filter(0.01) GRANULARITY 8
)
ENGINE = ReplacingMergeTree(source_produced_at)
PARTITION BY toYYYYMM(from_ts)
ORDER BY (tenant_id, brand_id, from_ts, to_ts, player_id, currency)
SETTINGS index_granularity = 8192;
