-- ClickHouse DDL for the transactions table used by affiliate-kafka-consumer.
--
-- Engine: ReplacingMergeTree
--   Duplicates keyed on (createdAt, transaction_id) are eventually deduplicated
--   by ClickHouse background merges. Until a merge occurs, duplicate rows may
--   appear in query results. Use `SELECT ... FINAL` to force deduplication at
--   query time when exact counts are required.
--
-- Run this once against your ClickHouse database before starting the consumer.

CREATE TABLE IF NOT EXISTS transactions
(
    createdAt                       DateTime64(3),
    aggregator                      LowCardinality(String),
    provider                        LowCardinality(String),
    currency                        LowCardinality(String),
    type                            LowCardinality(String),
    source                          LowCardinality(String),
    wallet_id                       String,
    player_id                       String,
    game_code                       String,
    is_live                         Bool,
    amount                          Decimal(38, 8),
    real_money_amount               Decimal(38, 8),
    bonus_money_amount              Decimal(38, 8),
    bet_rollback_amount             Decimal(38, 8),
    bet_rollback_real_amount        Decimal(38, 8),
    bet_rollback_bonus_amount       Decimal(38, 8),
    result_rollback_amount          Decimal(38, 8),
    result_rollback_real_amount     Decimal(38, 8),
    result_rollback_bonus_amount    Decimal(38, 8),
    mainc_amount                    Decimal(38, 8),
    mainc_real_money_amount         Decimal(38, 8),
    mainc_bonus_money_amount        Decimal(38, 8),
    mainc_bet_rollback_amount       Decimal(38, 8),
    mainc_bet_rollback_real_amount  Decimal(38, 8),
    mainc_bet_rollback_bonus_amount Decimal(38, 8),
    mainc_result_rollback_amount    Decimal(38, 8),
    mainc_result_rollback_real_amount  Decimal(38, 8),
    mainc_result_rollback_bonus_amount Decimal(38, 8),
    gamification_point              Decimal(38, 8),
    usd_amount                      Decimal(38, 8),
    usd_real_amount                 Decimal(38, 8),
    usd_bonus_amount                Decimal(38, 8),
    usd_bet_rollback_amount         Decimal(38, 8),
    usd_bet_rollback_real_amount    Decimal(38, 8),
    usd_bet_rollback_bonus_amount   Decimal(38, 8),
    usd_result_rollback_amount      Decimal(38, 8),
    usd_result_rollback_real_amount Decimal(38, 8),
    usd_result_rollback_bonus_amount Decimal(38, 8),
    eur_amount                      Decimal(38, 8),
    eur_real_amount                 Decimal(38, 8),
    eur_bonus_amount                Decimal(38, 8),
    eur_bet_rollback_amount         Decimal(38, 8),
    eur_bet_rollback_real_amount    Decimal(38, 8),
    eur_bet_rollback_bonus_amount   Decimal(38, 8),
    eur_result_rollback_amount      Decimal(38, 8),
    eur_result_rollback_real_amount Decimal(38, 8),
    eur_result_rollback_bonus_amount Decimal(38, 8),
    transaction_id                  String,
    referral_code_used              String,
    req_id                          String,
    round_id                        String,
    session_id                      String,
    session_transaction_id          String,
    status                          String DEFAULT '',
    commission_base_amount          Decimal(38, 8) DEFAULT 0,
    commission_amount               Decimal(38, 8) DEFAULT 0,
    commission_model                String DEFAULT '',
    INDEX `aggregator.idx` aggregator TYPE set(100) GRANULARITY 4,
    INDEX `provider.idx` provider TYPE set(100) GRANULARITY 4,
    INDEX `currency.idx` currency TYPE set(100) GRANULARITY 4,
    INDEX `type.idx` type TYPE set(100) GRANULARITY 4,
    INDEX `source.idx` source TYPE set(100) GRANULARITY 4,
    INDEX `wallet_id.idx` wallet_id TYPE bloom_filter(0.01) GRANULARITY 8,
    INDEX `player_id.idx` player_id TYPE bloom_filter(0.01) GRANULARITY 8,
    INDEX `game_code.idx` game_code TYPE bloom_filter(0.01) GRANULARITY 8,
    INDEX `is_live.idx` is_live TYPE set(100) GRANULARITY 4
)
ENGINE = ReplacingMergeTree
ORDER BY (createdAt, transaction_id)
SETTINGS index_granularity = 8192;
