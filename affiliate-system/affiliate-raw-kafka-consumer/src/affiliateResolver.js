import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client;
let profilesCol;
let codeToUserId = new Map();
let refreshTimer;

export async function connectMongo() {
  client = new MongoClient(config.mongo.uri);
  await client.connect();
  const db = client.db(config.mongo.database);
  profilesCol = db.collection('affiliateprofiles');
  await refreshCache();
  refreshTimer = setInterval(() => {
    refreshCache().catch((err) =>
      console.error('[resolver] Cache refresh failed:', err.message),
    );
  }, config.mongo.refreshMs);
  console.log(
    `[resolver] Connected to Mongo ${config.mongo.database}, ${codeToUserId.size} codes cached`,
  );
}

export async function closeMongo() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (client) await client.close();
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

export function resolveAffiliateId(code) {
  if (!code) return '';
  return codeToUserId.get(String(code).toUpperCase()) || '';
}
