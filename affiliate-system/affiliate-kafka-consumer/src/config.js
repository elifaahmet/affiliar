import 'dotenv/config';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, defaultValue) {
  return process.env[name] ?? defaultValue;
}

export const config = {
  kafka: {
    brokers: requireEnv('KAFKA_BROKERS').split(',').map((b) => b.trim()),
    // Topic for aggregated casino activity events (one per player/period/currency)
    topic: optionalEnv('KAFKA_TOPIC', 'affiliate.casino.activity.aggregated.v1'),
    groupId: optionalEnv('KAFKA_GROUP_ID', 'affiliar-casino-activity-consumer'),
  },
  mongo: {
    uri: requireEnv('MONGO_URI'),
    database: requireEnv('MONGO_DATABASE'),
  },
  clickhouse: {
    host: requireEnv('CLICKHOUSE_HOST'),
    database: requireEnv('CLICKHOUSE_DATABASE'),
    username: requireEnv('CLICKHOUSE_USERNAME'),
    password: requireEnv('CLICKHOUSE_PASSWORD'),
  },
  batch: {
    size: parseInt(optionalEnv('BATCH_SIZE', '100'), 10),
    intervalMs: parseInt(optionalEnv('SEND_INTERVAL_MS', '10000'), 10),
  },
};
