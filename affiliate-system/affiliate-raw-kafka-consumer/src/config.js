import 'dotenv/config';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optionalEnv(name, defaultValue) {
  return process.env[name] ?? defaultValue;
}

// Topic naming is a convention, not a setting: <system>.<stream>.<slug>.v<n>,
// matching affiliate.raw.events.v1 and ludora.raw.events.v1 already on the
// broker. Deriving the name from the slug means it cannot be misspelled in one
// place and not another — the producer's topic, the consumer's subscription
// and the ACL all come from this one function.
export function rawEventsTopic(slug) {
  return `affiliate.raw.events.${slug}.v1`;
}

// Slugs become part of a topic name, so: no dots (that would silently create a
// deeper namespace) and no underscores (Kafka warns they collide with dots in
// metric names).
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}$/;

function parseTenants(raw) {
  const map = new Map();
  for (const pair of String(raw).split(',')) {
    const entry = pair.trim();
    if (!entry) continue;
    const idx = entry.indexOf('=');
    if (idx < 1) {
      throw new Error(`KAFKA_TENANTS entry must be slug=tenantId, got: ${entry}`);
    }
    const slug = entry.slice(0, idx).trim();
    const tenantId = entry.slice(idx + 1).trim();
    if (!SLUG_RE.test(slug)) {
      throw new Error(
        `KAFKA_TENANTS slug must be lowercase letters, digits or dashes: ${slug}`,
      );
    }
    if (!tenantId) throw new Error(`KAFKA_TENANTS tenantId is empty for slug: ${slug}`);
    map.set(rawEventsTopic(slug), tenantId);
  }
  return map;
}

export const config = {
  kafka: {
    brokers: requireEnv('KAFKA_BROKERS').split(',').map((b) => b.trim()),
    // The shared topic every existing integration already produces to. It is
    // not going anywhere: splitting a tenant out is opt-in, per tenant.
    topic: optionalEnv('KAFKA_TOPIC', 'affiliate.raw.events.v1'),
    groupId: optionalEnv('KAFKA_GROUP_ID', 'affiliar-raw-event-consumer'),
    // Tenants that have been split onto their own topic:
    //   KAFKA_TENANTS=betroxy=<tenantId>,betamericano=<tenantId>
    //
    // Kafka ACLs stop a producer writing to someone else's topic, but they
    // cannot see inside the message — nothing at the broker stops a producer
    // putting another operator's tenantId in a payload on its own topic. The
    // topic it arrived on is the part the broker actually authenticated, so
    // that is what we trust, and events that disagree are dropped.
    //
    // The shared topic is deliberately not listed here: it carries every
    // tenant, so there is nothing to cross-check it against.
    topicTenants: parseTenants(optionalEnv('KAFKA_TENANTS', '')),
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
