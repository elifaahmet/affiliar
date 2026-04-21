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
  hexoraMongo: {
    uri: requireEnv('HEXORA_MONGODB_URI'),
    database: requireEnv('HEXORA_MONGODB_DATABASE'),
  },
};
