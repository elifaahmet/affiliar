import 'dotenv/config';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optionalEnv(name, defaultValue) {
  return process.env[name] ?? defaultValue;
}

export const config = {
  kafka: {
    brokers: requireEnv('KAFKA_BROKERS').split(',').map((b) => b.trim()),
    topic: optionalEnv('KAFKA_TOPIC', 'affiliate.raw.events.v1'),
    groupId: optionalEnv('KAFKA_GROUP_ID', 'affiliar-raw-event-consumer'),
  },
  clickhouse: {
    host: requireEnv('CLICKHOUSE_HOST'),
    database: requireEnv('CLICKHOUSE_DATABASE'),
    username: requireEnv('CLICKHOUSE_USERNAME'),
    password: requireEnv('CLICKHOUSE_PASSWORD'),
  },
  batch: {
    size: parseInt(optionalEnv('BATCH_SIZE', '200'), 10),
    intervalMs: parseInt(optionalEnv('SEND_INTERVAL_MS', '5000'), 10),
  },
  mongo: {
    uri: requireEnv('MONGODB_URI'),
    database: requireEnv('MONGODB_DATABASE'),
    refreshMs: parseInt(optionalEnv('AFFILIATE_CACHE_REFRESH_MS', '60000'), 10),
  },
  // Optional back-fill only. This is a second platform's production database,
  // and reaching into it is not how attribution is meant to work: the
  // registration event carries affiliateCode, and upsertAffiliatePlayer()
  // records it in our own affiliateplayers collection, which is the path
  // resolvePlayerAffiliate() takes first. The lookup here only ever covered
  // players who registered before Affiliar was integrated.
  //
  // Left unset, the back-fill is skipped and those players resolve to no
  // affiliate — the same answer we would give if the platform were
  // unreachable, except the consumer keeps running instead of refusing to
  // start. Requiring it meant losing that platform took this pipeline with it.
  hexoraMongo: {
    uri: optionalEnv('HEXORA_MONGODB_URI', ''),
    database: optionalEnv('HEXORA_MONGODB_DATABASE', ''),
  },
  playerCache: {
    maxSize: parseInt(optionalEnv('PLAYER_CACHE_MAX_SIZE', '10000'), 10),
    ttlMs: parseInt(optionalEnv('PLAYER_CACHE_TTL_MS', '3600000'), 10),
  },
  fx: {
    baseCurrency: optionalEnv('FX_BASE_CURRENCY', 'USD'),
    refreshMs: parseInt(optionalEnv('FX_REFRESH_MS', '300000'), 10),
  },
};
