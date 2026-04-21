import { MongoClient, ObjectId } from 'mongodb';
import { config } from './config.js';

let affiliateClient;
let hexoraClient;
let profilesCol;
let playersCol;
let codeToUserId = new Map();
let refreshTimer;

export async function connectMongo() {
  affiliateClient = new MongoClient(config.mongo.uri);
  await affiliateClient.connect();
  const affiliateDb = affiliateClient.db(config.mongo.database);
  profilesCol = affiliateDb.collection('affiliateprofiles');

  hexoraClient = new MongoClient(config.hexoraMongo.uri, {
    directConnection: true,
  });
  await hexoraClient.connect();
  const hexoraDb = hexoraClient.db(config.hexoraMongo.database);
  playersCol = hexoraDb.collection('players');

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
  const _id = toObjectId(playerId);
  if (!_id) return '';
  const player = await playersCol.findOne(
    { _id },
    { projection: { affiliateReferralCode: 1 } },
  );
  const code = player?.affiliateReferralCode;
  if (!code) return '';
  return resolveAffiliateIdByCode(code);
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
