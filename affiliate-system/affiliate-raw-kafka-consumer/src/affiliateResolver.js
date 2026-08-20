import { MongoClient, ObjectId } from 'mongodb';
import { config } from './config.js';

let affiliateClient;
let hexoraClient;
let profilesCol;
let affiliatePlayersCol;
let playersCol;
let _hexoraDb;
let _affiliateDb;
let codeToUserId = new Map();
// userId -> { url, events:[...] } for affiliates with postback turned on.
let postbackByUser = new Map();
let refreshTimer;

export function getHexoraDb() {
  return _hexoraDb;
}

export function getAffiliateDb() {
  return _affiliateDb;
}

// LRU + TTL cache for playerId → affiliate_id. Attributions are immutable
// after registration, so TTL is mostly a self-healing safety net.
const PLAYER_CACHE_MAX = config.playerCache.maxSize;
const PLAYER_CACHE_TTL_MS = config.playerCache.ttlMs;
const playerCache = new Map(); // playerId -> { affiliateId, expiresAt }

export async function connectMongo() {
  affiliateClient = new MongoClient(config.mongo.uri);
  await affiliateClient.connect();
  const affiliateDb = affiliateClient.db(config.mongo.database);
  profilesCol = affiliateDb.collection('affiliateprofiles');
  affiliatePlayersCol = affiliateDb.collection('affiliateplayers');
  _affiliateDb = affiliateDb;

  // Optional: see config.hexoraMongo. Without it playersCol stays undefined
  // and resolvePlayerAffiliate()'s back-fill branch already returns '' on its
  // own guard, so the consumer runs on our own registry alone.
  if (config.hexoraMongo.uri && config.hexoraMongo.database) {
    hexoraClient = new MongoClient(config.hexoraMongo.uri, {
      directConnection: true,
    });
    await hexoraClient.connect();
    const hexoraDb = hexoraClient.db(config.hexoraMongo.database);
    playersCol = hexoraDb.collection('players');
    _hexoraDb = hexoraDb;
  }

  await refreshCache();
  refreshTimer = setInterval(() => {
    refreshCache().catch((err) =>
      console.error('[resolver] Cache refresh failed:', err.message),
    );
  }, config.mongo.refreshMs);
  console.log(
    `[resolver] Connected (affiliate${playersCol ? ' + platform back-fill' : ', no back-fill'}), ` +
      `${codeToUserId.size} codes cached`,
  );
}

export async function closeMongo() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (affiliateClient) await affiliateClient.close();
  if (hexoraClient) await hexoraClient.close();
}

async function refreshCache() {
  const cursor = profilesCol.find(
    { referralCodes: { $exists: true, $ne: [] } },
    { projection: { user: 1, referralCodes: 1 } },
  );
  const next = new Map();
  for await (const doc of cursor) {
    const userId = doc.user?.toString?.();
    if (!userId) continue;
    for (const code of doc.referralCodes) {
      if (typeof code === 'string' && code.length) {
        next.set(code.toUpperCase(), userId);
      }
    }
  }
  codeToUserId = next;

  // Postback config for affiliates who turned it on (small set).
  const pbCursor = profilesCol.find(
    { postbackEnabled: true, postbackUrl: { $nin: [null, ''] } },
    { projection: { user: 1, postbackUrl: 1, postbackEvents: 1 } },
  );
  const pbNext = new Map();
  for await (const doc of pbCursor) {
    const userId = doc.user?.toString?.();
    if (userId && doc.postbackUrl) {
      pbNext.set(userId, { url: doc.postbackUrl, events: doc.postbackEvents || [] });
    }
  }
  postbackByUser = pbNext;
}

// Postback config for an affiliate (or null). Cached + refreshed on the same
// timer as the code map, so toggling postback in the portal takes effect
// within one refresh cycle.
export function getPostbackConfig(userId) {
  if (!userId) return null;
  return postbackByUser.get(String(userId)) || null;
}

// Stored attribution meta for a player — used to fill click_id/code/brand on
// deposit events, which don't carry the affiliate code/subId inline.
export async function getAffiliatePlayerMeta(playerId) {
  if (!playerId || !affiliatePlayersCol) return null;
  return affiliatePlayersCol.findOne(
    { playerId: String(playerId) },
    { projection: { subId: 1, clickId: 1, affiliateCode: 1, brandId: 1 } },
  );
}

// Exact per-click attribution: mark the click that produced this registration
// as converted. Idempotent (won't re-stamp an already-converted click).
export async function markClickConverted(clickId, playerId) {
  if (!clickId || !_affiliateDb) return;
  await _affiliateDb.collection('clicks').updateOne(
    { clickId: String(clickId), converted: { $ne: true } },
    { $set: { converted: true, convertedPlayerId: String(playerId), convertedAt: new Date() } },
  );
}

// Insert a pending outbound postback. affiliate-be's postbackDeliveryJob picks
// it up and delivers. Native insert into the same collection the Mongoose
// PostbackDelivery model maps to ('postbackdeliveries').
export async function enqueuePostback(ctx) {
  if (!_affiliateDb) return;
  const now = new Date();
  await _affiliateDb.collection('postbackdeliveries').insertOne({
    operatorId:    toObjectId(ctx.tenantId),
    affiliateId:   toObjectId(ctx.affiliateId),
    affiliateCode: ctx.affiliateCode ? String(ctx.affiliateCode).toUpperCase() : null,
    event:         ctx.event,
    playerId:      ctx.playerId != null ? String(ctx.playerId) : null,
    clickId:       ctx.clickId || null,
    amountCents:   Number(ctx.amountCents) || 0,
    currency:      ctx.currency || null,
    brandId:       ctx.brandId || null,
    occurredAt:    ctx.occurredAt ? new Date(ctx.occurredAt) : now,
    urlTemplate:   ctx.urlTemplate,
    status:        'pending',
    attempts:      0,
    maxAttempts:   5,
    nextAttemptAt: now,
    finalUrl:       null,
    responseStatus: null,
    lastError:      null,
    sentAt:         null,
    createdAt:     now,
    updatedAt:     now,
  });
}

export function resolveAffiliateIdByCode(code) {
  if (!code) return '';
  return codeToUserId.get(String(code).toUpperCase()) || '';
}

function cachePlayerAffiliate(key, affiliateId, now) {
  playerCache.set(key, { affiliateId, expiresAt: now + PLAYER_CACHE_TTL_MS });
  if (playerCache.size > PLAYER_CACHE_MAX) {
    const oldest = playerCache.keys().next().value;
    playerCache.delete(oldest);
  }
}

// Resolve the affiliate for an event that doesn't carry the code inline
// (deposits, bets, cashouts…). Primary source is Affiliar's OWN
// `affiliateplayers` registry, which is populated at registration
// (upsertAffiliatePlayer) with the already-resolved affiliateId. That makes
// attribution work for EVERY tenant regardless of which casino DB the player
// lives in — the raw consumer no longer needs to reach the casino's players
// collection. The casino-DB lookup is kept only as a fallback for the rare
// case where a non-register event lands before its registration (or a
// pre-integration player), and only resolves for the casino this consumer is
// wired to.
export async function resolveAffiliateIdByPlayer(playerId, tenantId) {
  if (!playerId) return '';
  const operatorId = tenantId ? toObjectId(tenantId) : null;
  const key = `${operatorId ? operatorId.toString() : '*'}:${String(playerId)}`;
  const now = Date.now();

  const cached = playerCache.get(key);
  if (cached && cached.expiresAt > now) {
    // Refresh LRU recency
    playerCache.delete(key);
    playerCache.set(key, cached);
    return cached.affiliateId;
  }

  // Primary: our own registry. Scoped by operator so a playerId shared across
  // operators can't cross-attribute.
  if (affiliatePlayersCol) {
    const q = { playerId: String(playerId) };
    if (operatorId) q.operatorId = operatorId;
    const ap = await affiliatePlayersCol.findOne(q, {
      projection: { affiliateId: 1 },
    });
    if (ap) {
      // A doc exists → attribution is settled (affiliateId may be null when the
      // player registered without a code). Cache and return definitively.
      const affiliateId = ap.affiliateId ? ap.affiliateId.toString() : '';
      cachePlayerAffiliate(key, affiliateId, now);
      return affiliateId;
    }
  }

  // Fallback: no registry doc yet. Look the code up on the casino player
  // record (only the casino this consumer connects to). Don't cache a negative
  // here so the next event picks up the registry doc once registration lands.
  const _id = toObjectId(playerId);
  if (!_id || !playersCol) return '';
  const player = await playersCol.findOne(
    { _id },
    { projection: { affiliateReferralCode: 1 } },
  );
  const code = player?.affiliateReferralCode;
  const affiliateId = code ? resolveAffiliateIdByCode(code) : '';
  if (affiliateId) cachePlayerAffiliate(key, affiliateId, now);
  return affiliateId;
}

// Update the affiliateplayers doc's status/flag when a player.flagged
// event arrives. No-op if the player isn't in our registry. Scoped by operator
// (tenantId) so a shared playerId can't cross-flag another operator's player.
// Test accounts are NOT handled here — they're reconciled from the casino via
// the operator's "Sync test accounts" (see affiliatePlayerController).
export async function updatePlayerFlag(playerId, flag, tenantId) {
  if (!playerId || !flag) return;
  const filter = { playerId: String(playerId) };
  const operatorId = tenantId ? toObjectId(tenantId) : null;
  if (operatorId) filter.operatorId = operatorId;
  await affiliatePlayersCol.updateOne(filter, { $set: { status: flag, statusUpdatedAt: new Date() } });
}

export async function upsertAffiliatePlayer(event, data, affiliateId) {
  const operatorId = toObjectId(event.tenantId);
  if (!operatorId) return;
  const affiliateObj = affiliateId ? toObjectId(affiliateId) : null;
  const code =
    typeof data.affiliateCode === 'string' && data.affiliateCode.length
      ? data.affiliateCode.trim().toUpperCase()
      : null;

  const doc = {
    operatorId,
    brandId: event.brandId || null,
    playerId: String(event.playerId),
    affiliateId: affiliateObj,
    affiliateCode: code,
    campaign: data.campaign || null,
    subId: data.subId || null,
    clickId: data.clickId || null,
    ...(data.ipHash ? { ipHash: data.ipHash } : {}),
    ...(data.deviceHash ? { deviceHash: data.deviceHash } : {}),
    country: data.country || null,
    currency: event.currency || null,
    registeredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
    source: 'realtime',
    importedAt: new Date(),
  };

  await affiliatePlayersCol.updateOne(
    { operatorId, playerId: String(event.playerId) },
    { $set: doc, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}
