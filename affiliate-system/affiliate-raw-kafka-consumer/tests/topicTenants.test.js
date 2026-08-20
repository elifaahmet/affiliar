import { test } from 'node:test';
import assert from 'node:assert/strict';

// config.js reads the environment at import time, so each case sets what it
// needs and then imports a fresh copy via a cache-busting query string.
const BASE = {
  KAFKA_BROKERS: 'localhost:9092',
  CLICKHOUSE_HOST: 'http://localhost:8123',
  CLICKHOUSE_DATABASE: 'affiliate',
  CLICKHOUSE_USERNAME: 'affiliate',
  CLICKHOUSE_PASSWORD: 'x',
  MONGODB_URI: 'mongodb://localhost:27017/affiliate',
  MONGODB_DATABASE: 'affiliate',
};

let counter = 0;
async function loadConfig(extra = {}) {
  Object.assign(process.env, BASE, extra);
  return import(`../src/config.js?case=${counter++}`);
}

test('topic name is derived from the slug, not configured', async () => {
  const { rawEventsTopic } = await loadConfig();
  assert.equal(rawEventsTopic('betroxy'), 'affiliate.raw.events.betroxy.v1');
  assert.equal(rawEventsTopic('betamericano'), 'affiliate.raw.events.betamericano.v1');
});

test('KAFKA_TENANTS maps derived topics to tenant ids', async () => {
  const { config } = await loadConfig({
    KAFKA_TENANTS: 'betroxy=tenant-a,betamericano=tenant-b',
  });
  assert.equal(config.kafka.topicTenants.get('affiliate.raw.events.betroxy.v1'), 'tenant-a');
  assert.equal(config.kafka.topicTenants.get('affiliate.raw.events.betamericano.v1'), 'tenant-b');
});

test('the shared topic stays out of the tenant map', async () => {
  // It carries every tenant, so cross-checking it would drop everything.
  const { config } = await loadConfig({ KAFKA_TENANTS: 'betroxy=tenant-a' });
  assert.equal(config.kafka.topicTenants.has('affiliate.raw.events.v1'), false);
  assert.equal(config.kafka.topic, 'affiliate.raw.events.v1');
});

test('malformed slugs are rejected rather than silently renaming a topic', async () => {
  for (const bad of ['Betroxy=t', 'bet.roxy=t', 'bet_roxy=t', '-betroxy=t']) {
    await assert.rejects(
      () => loadConfig({ KAFKA_TENANTS: bad }),
      /slug must be lowercase/,
      `expected rejection for: ${bad}`,
    );
  }
});

test('an entry without a tenant id is rejected', async () => {
  await assert.rejects(
    () => loadConfig({ KAFKA_TENANTS: 'betroxy=' }),
    /tenantId is empty/,
  );
  await assert.rejects(
    () => loadConfig({ KAFKA_TENANTS: 'betroxy' }),
    /must be slug=tenantId/,
  );
});

test('no KAFKA_TENANTS means the shared topic alone, unchanged', async () => {
  const { config } = await loadConfig({ KAFKA_TENANTS: '' });
  assert.equal(config.kafka.topicTenants.size, 0);
  assert.equal(config.kafka.topic, 'affiliate.raw.events.v1');
});
