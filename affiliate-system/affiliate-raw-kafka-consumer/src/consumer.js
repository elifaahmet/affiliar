import { consumer } from './kafka.js';
import { parseRawEvent } from './schema.js';
import { addEvent } from './clickhouse.js';
import {
  resolveAffiliateIdByCode,
  resolveAffiliateIdByPlayer,
  upsertAffiliatePlayer,
  updatePlayerFlag,
} from './affiliateResolver.js';

async function processMessage(rawValue) {
  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch (err) {
    console.error('[consumer] Failed to parse JSON:', err.message, '| raw:', rawValue.slice(0, 200));
    return;
  }

  const { success, event, data, error } = parseRawEvent(parsed);
  if (!success) {
    console.error('[consumer] Validation failed:', error, '| eventId:', parsed?.eventId);
    return;
  }

  // player.registered carries the affiliateCode inline. Other event types
  // don't include it, so we look the player up in hexora-db.players to get
  // their stored affiliateReferralCode.
  const affiliateId = data.affiliateCode
    ? resolveAffiliateIdByCode(data.affiliateCode)
    : await resolveAffiliateIdByPlayer(event.playerId);

  console.log(
    `[consumer] ${event.eventType} | player=${event.playerId} tenant=${event.tenantId} affiliate=${affiliateId || '-'}`
  );

  addEvent(event, data, affiliateId);

  if (event.eventType === 'player.registered') {
    try {
      await upsertAffiliatePlayer(event, data, affiliateId);
    } catch (err) {
      console.error(
        '[consumer] Failed to upsert affiliatePlayer:',
        err?.message || err,
      );
    }
  }

  if (event.eventType === 'player.flagged') {
    try {
      await updatePlayerFlag(event.playerId, data.flag);
    } catch (err) {
      console.error(
        '[consumer] Failed to update player flag:',
        err?.message || err,
      );
    }
  }
}

export async function startConsuming() {
  await consumer.run({
    eachMessage: async ({ message }) => {
      const rawValue = message.value?.toString();
      if (!rawValue) return;
      await processMessage(rawValue);
    },
  });
  console.log('[consumer] Listening for raw events...');
}
