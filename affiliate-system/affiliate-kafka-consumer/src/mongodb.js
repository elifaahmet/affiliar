import { MongoClient, ObjectId } from 'mongodb';
import { config } from './config.js';

let client;
let db;

export async function connectMongo() {
  client = new MongoClient(config.mongo.uri);
  await client.connect();
  db = client.db(config.mongo.database);

  await ensureIndexes();

  console.log(`[mongodb] Connected to database "${config.mongo.database}"`);
}

export async function closeMongo() {
  if (client) {
    await client.close();
    console.log('[mongodb] Connection closed');
  }
}

/**
 * Create required indexes on startup if they don't exist yet.
 */
async function ensureIndexes() {
  const inbox = db.collection('affiliateAggregatedEventInbox');
  const activity = db.collection('activityHourly');

  // Inbox: unique on eventId for deduplication at the envelope level
  await inbox.createIndex({ eventId: 1 }, { unique: true, name: 'eventId_unique' });
  await inbox.createIndex(
    { tenantId: 1, processingStatus: 1, receivedAt: -1 },
    { name: 'tenant_status_time' }
  );

  // activityHourly: unique business key — one record per player/period/currency
  await activity.createIndex(
    { tenantId: 1, brandId: 1, from: 1, to: 1, playerId: 1, currency: 1 },
    { unique: true, name: 'business_key_unique' }
  );
  await activity.createIndex({ tenantId: 1, affiliateId: 1, from: -1 }, { name: 'tenant_affiliate_time' });
  await activity.createIndex({ tenantId: 1, playerId: 1, from: -1 }, { name: 'tenant_player_time' });
  await activity.createIndex({ tenantId: 1, brandId: 1, from: -1 }, { name: 'tenant_brand_time' });

  console.log('[mongodb] Indexes ensured');
}

/**
 * Write the raw event to the inbox collection (audit trail).
 * Uses the eventId as a unique key — silently ignores true duplicates.
 *
 * @param {import('./types.d.ts').AffiliateCasinoActivityAggregatedEvent} event
 * @returns {Promise<boolean>} false if duplicate was detected (already in inbox)
 */
export async function saveToInbox(event) {
  const col = db.collection('affiliateAggregatedEventInbox');

  const doc = {
    _id: new ObjectId(),
    eventId: event.eventId,
    eventType: event.eventType,
    tenantId: event.tenantId,
    brandId: event.brandId,
    payload: event,
    receivedAt: new Date(),
    processingStatus: 'pending',
    errorMessage: null,
  };

  try {
    await col.insertOne(doc);
    return true;
  } catch (err) {
    if (err.code === 11000) {
      console.log(`[mongodb] Duplicate inbox event ${event.eventId}, skipping`);
      return false;
    }
    throw err;
  }
}

/**
 * Mark an inbox record as processed.
 *
 * @param {string} eventId
 */
export async function markInboxProcessed(eventId) {
  await db.collection('affiliateAggregatedEventInbox').updateOne(
    { eventId },
    { $set: { processingStatus: 'processed' } }
  );
}

/**
 * Mark an inbox record as failed with an error message.
 *
 * @param {string} eventId
 * @param {string} errorMessage
 */
export async function markInboxFailed(eventId, errorMessage) {
  await db.collection('affiliateAggregatedEventInbox').updateOne(
    { eventId },
    { $set: { processingStatus: 'failed', errorMessage } }
  );
}

/**
 * Resolve the affiliate's User._id from the event's affiliate block.
 *
 * Priority:
 *   1. affiliateId is present → use it directly (producer already resolved)
 *   2. affiliateCode only → look up affiliateprofiles by referralCodes array
 *   3. Neither → return ''
 *
 * Result is cached in memory for the process lifetime to avoid repeated lookups
 * for the same code across high-volume event streams.
 *
 * @param {{ affiliateId?: string, affiliateCode?: string }} affiliate
 * @returns {Promise<string>} User._id string, or '' if unresolvable
 */
const _codeToIdCache = new Map();

export async function resolveAffiliateId(affiliate) {
  if (!affiliate) return '';

  if (affiliate.affiliateId) return affiliate.affiliateId;

  const code = affiliate.affiliateCode;
  if (!code) return '';

  if (_codeToIdCache.has(code)) return _codeToIdCache.get(code);

  const profile = await db
    .collection('affiliateprofiles')
    .findOne({ referralCodes: code }, { projection: { user: 1 } });

  const resolved = profile?.user?.toString() ?? '';

  if (resolved) {
    _codeToIdCache.set(code, resolved);
    console.log(`[mongodb] Resolved affiliateCode "${code}" → affiliateId "${resolved}"`);
  } else {
    console.warn(`[mongodb] Could not resolve affiliateCode "${code}" — no matching profile`);
  }

  return resolved;
}

/**
 * Insert into the canonical activityHourly collection.
 * Strict insert — rejects duplicate business key (no upsert in v1).
 * Returns false if the business key already exists.
 *
 * @param {import('./types.d.ts').AffiliateCasinoActivityAggregatedEvent} event
 * @param {{ computedGgrCents: number, computedNgrCents: number, ggrMismatch: boolean, ngrMismatch: boolean }} derived
 * @returns {Promise<boolean>}
 */
export async function insertActivityHourly(event, derived) {
  const col = db.collection('activityHourly');

  const now = new Date();
  const doc = {
    tenantId: event.tenantId,
    brandId: event.brandId,
    operatorId: event.operatorId ?? '',

    from: new Date(event.period.from),
    to: new Date(event.period.to),
    granularity: event.period.granularity,

    playerId: event.player.playerId,
    currency: event.player.currency,
    country: event.player.country ?? '',

    affiliateId: event.affiliate?.affiliateId ?? '',
    affiliateCode: event.affiliate?.affiliateCode ?? '',
    campaign: event.affiliate?.campaign ?? '',
    subId: event.affiliate?.subId ?? '',

    metrics: {
      ...event.metrics,
      computedGgrCents: derived.computedGgrCents,
      computedNgrCents: derived.computedNgrCents,
      ggrMismatch: derived.ggrMismatch,
      ngrMismatch: derived.ngrMismatch,
    },

    playerStatuses: {
      isDuplicate: event.playerStatuses?.isDuplicate ?? false,
      isDisabled: event.playerStatuses?.isDisabled ?? false,
      isSelfExcluded: event.playerStatuses?.isSelfExcluded ?? false,
      isVerified: event.playerStatuses?.isVerified ?? false,
    },

    sourceEventId: event.eventId,
    sourceSystem: event.source.system,
    sourceProducedAt: new Date(event.source.producedAt),

    createdAt: now,
    updatedAt: now,
  };

  try {
    await col.insertOne(doc);
    console.log(
      `[mongodb] Inserted activityHourly: tenant=${event.tenantId} player=${event.player.playerId} ` +
      `currency=${event.player.currency} from=${event.period.from}`
    );
    return true;
  } catch (err) {
    if (err.code === 11000) {
      console.log(
        `[mongodb] Duplicate activityHourly business key for event ${event.eventId}, skipping`
      );
      return false;
    }
    throw err;
  }
}
