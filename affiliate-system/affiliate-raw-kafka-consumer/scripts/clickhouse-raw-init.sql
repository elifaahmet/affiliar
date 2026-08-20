-- Base schema for the raw-events pipeline.
--
-- Reconstructed 2026-08-20 after the original hexora server was lost: these
-- two tables were created by hand there and their DDL was never committed,
-- unlike activity_hourly (see affiliate-kafka-consumer/scripts/clickhouse-init.sql).
-- Column names and shapes come from src/clickhouse.js — buildRawRow() and
-- buildDeltaRow() are the definitive list of what the consumer writes.
--
-- The sportsbook and payment-fee columns are deliberately NOT here; they are
-- added by the two migration scripts alongside this file, so the migration
-- path stays the documented one.

CREATE TABLE IF NOT EXISTS affiliate.raw_events
(
    event_id        String,
    event_type      LowCardinality(String),
    tenant_id       LowCardinality(String),
    brand_id        LowCardinality(String),
    player_id       String,
    currency        LowCardinality(String),
    occurred_at     DateTime,
    -- Whole event payload as JSON, kept verbatim so a mis-mapped event can be
    -- replayed into the delta table without going back to Kafka.
    data            String,
    source_system   LowCardinality(String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (tenant_id, brand_id, occurred_at, event_id)
SETTINGS index_granularity = 8192;

-- One row per event, summed on merge into one row per dimension tuple.
-- SummingMergeTree is not a guess: src/clickhouse.js documents `provider` as
-- "part of the SummingMergeTree sort key".
--
-- source_event_id is intentionally OUT of the sort key. In it, every row would
-- be unique and nothing would ever collapse, which is the whole point of the
-- engine. It stays as a payload column for tracing a row back to its event.
--
-- Cents are Int64 rather than UInt64: the consumer converts through
-- toBaseCents() and a negative correction would silently wrap on an unsigned
-- column, turning a small refund into an astronomical credit.
CREATE TABLE IF NOT EXISTS affiliate.activity_hourly_delta
(
    tenant_id       LowCardinality(String),
    brand_id        LowCardinality(String),
    player_id       String,
    currency        LowCardinality(String),
    hour_bucket     DateTime,
    affiliate_id    String,
    provider        LowCardinality(String),

    -- Set only on player.registered; every other event leaves them empty.
    country         LowCardinality(String) DEFAULT '',
    affiliate_code  String DEFAULT '',
    campaign        String DEFAULT '',
    sub_id          String DEFAULT '',

    source_system   LowCardinality(String) DEFAULT '',
    source_event_id String DEFAULT '',

    registrations                       UInt32 DEFAULT 0,
    ftd_count                           UInt32 DEFAULT 0,
    ftd_sum_cents                       Int64  DEFAULT 0,
    deposits_count                      UInt32 DEFAULT 0,
    deposits_sum_cents                  Int64  DEFAULT 0,
    cashouts_count                      UInt32 DEFAULT 0,
    cashouts_sum_cents                  Int64  DEFAULT 0,
    chargebacks_count                   UInt32 DEFAULT 0,
    chargebacks_sum_cents               Int64  DEFAULT 0,
    bets_sum_cents                      Int64  DEFAULT 0,
    wins_sum_cents                      Int64  DEFAULT 0,
    casino_bets_rollbacks_sum_cents     Int64  DEFAULT 0,
    casino_wins_rollbacks_sum_cents     Int64  DEFAULT 0,
    bonus_issues_sum_cents              Int64  DEFAULT 0,
    additional_deductions_sum_cents     Int64  DEFAULT 0,
    payment_system_fees_sum_cents       Int64  DEFAULT 0,
    jackpot_fees_sum_cents              Int64  DEFAULT 0,
    game_provider_fees_sum_cents        Int64  DEFAULT 0,
    casino_taxes_sum_cents              Int64  DEFAULT 0,
    corrections_up_sum_cents            Int64  DEFAULT 0,
    corrections_down_sum_cents          Int64  DEFAULT 0,
    rounds_count                        UInt32 DEFAULT 0,
    wager_cents                         Int64  DEFAULT 0,

    INDEX idx_affiliate_id   affiliate_id   TYPE bloom_filter(0.01) GRANULARITY 8,
    INDEX idx_player_id      player_id      TYPE bloom_filter(0.01) GRANULARITY 8,
    INDEX idx_affiliate_code affiliate_code TYPE bloom_filter(0.01) GRANULARITY 8
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(hour_bucket)
ORDER BY (tenant_id, brand_id, hour_bucket, player_id, currency, affiliate_id, provider)
SETTINGS index_granularity = 8192;
