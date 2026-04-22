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

  hexoraClient = new MongoClient(config.hexoraMongo.uri, {
    directConnection: true,
  });
  await hexoraClient.connect();
  const hexoraDb = hexoraClient.db(config.hexoraMongo.database);
  playersCol = hexoraDb.collection('players');
  // Cache the db on the module so other files (fxRates) can reuse the
  // connection without opening a second client.
  _hexoraDb = hexoraDb;

  await refreshCache();
  refreshTimer = setInterval(() => {
    refreshCache().catch((err) =>
      console.error('[resolver] Cache refresh failed:', err.message),
    );
  }, config.mongo.refreshMs);
  console.log(
    `[resolver] Connected (affiliate + hexora), ${codeToUserId.size} codes cached`,
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
}

export function resolveAffiliateIdByCode(code) {
  if (!code) return '';
  return codeToUserId.get(String(code).toUpperCase()) || '';
}

export async function resolveAffiliateIdByPlayer(playerId) {
  if (!playerId) return '';
  const key = String(playerId);
  const now = Date.now();

  const cached = playerCache.get(key);
  if (cached && cached.expiresAt > now) {
    // Refresh LRU recency
    playerCache.delete(key);
    playerCache.set(key, cached);
    return cached.affiliateId;
  }

  const _id = toObjectId(playerId);
  if (!_id) return '';
  const player = await playersCol.findOne(
    { _id },
    { projection: { affiliateReferralCode: 1 } },
  );
  const code = player?.affiliateReferralCode;
  const affiliateId = code ? resolveAffiliateIdByCode(code) : '';

  playerCache.set(key, { affiliateId, expiresAt: now + PLAYER_CACHE_TTL_MS });
  if (playerCache.size > PLAYER_CACHE_MAX) {
    const oldest = playerCache.keys().next().value;
    playerCache.delete(oldest);
  }
  return affiliateId;
}

// Update the affiliateplayers doc's status/flag when a player.flagged
// event arrives. No-op if the player isn't in our registry.
export async function updatePlayerFlag(playerId, flag) {
  if (!playerId || !flag) return;
  await affiliatePlayersCol.updateOne(
    { playerId: String(playerId) },
    { $set: { status: flag, statusUpdatedAt: new Date() } },
  );
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
