import { consumer } from './kafka.js';
import { parseRawEvent } from './schema.js';
import { addEvent } from './clickhouse.js';
import {
  resolveAffiliateIdByCode,
  resolveAffiliateIdByPlayer,
  upsertAffiliatePlayer,
  updatePlayerFlag,
  getPostbackConfig,
  getAffiliatePlayerMeta,
  enqueuePostback,
  markClickConverted,
} from './affiliateResolver.js';

// Map a raw event to the postback event name (or null if not postback-worthy).
function postbackEventOf(eventType, data) {
  if (eventType === 'player.registered') return { event: 'registration', amountCents: 0 };
  if (eventType === 'wallet.deposit.confirmed') {
    return { event: data.isFirstDeposit ? 'ftd' : 'deposit', amountCents: data.amountCents || 0 };
  }
  return null;
}

// Fire-and-forget: queue an outbound postback if this affiliate has one
// configured for this event. Never throws into the ingest path.
async function maybeEnqueuePostback(event, data, affiliateId) {
  if (!affiliateId) return;
  const cfg = getPostbackConfig(affiliateId);
  if (!cfg || !cfg.url) return;
  const mapped = postbackEventOf(event.eventType, data);
  if (!mapped || !(cfg.events || []).includes(mapped.event)) return;

  try {
    // Registration carries code/subId inline; deposits don't — pull stored
    // attribution meta for those.
    // Prefer the exact click_id; fall back to subId for older/direct traffic.
    let clickId = data.clickId || data.subId || null;
    let affiliateCode = data.affiliateCode || null;
    let brandId = event.brandId || null;
    if (mapped.event !== 'registration') {
      const meta = await getAffiliatePlayerMeta(event.playerId);
      clickId = clickId || meta?.clickId || meta?.subId || null;
      affiliateCode = affiliateCode || meta?.affiliateCode || null;
      brandId = brandId || meta?.brandId || null;
    }
    await enqueuePostback({
      tenantId: event.tenantId,
      affiliateId,
      affiliateCode,
      event: mapped.event,
      playerId: event.playerId,
      clickId,
      amountCents: mapped.amountCents,
      currency: event.currency || null,
      brandId,
      occurredAt: event.occurredAt,
      urlTemplate: cfg.url,
    });
  } catch (err) {
    console.error('[consumer] postback enqueue failed:', err?.message || err);
  }
}

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
    // Exact click→registration attribution when the casino echoed click_id.
    if (data.clickId) {
      try {
        await markClickConverted(data.clickId, event.playerId);
      } catch (err) {
        console.error('[consumer] Failed to mark click converted:', err?.message || err);
      }
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

  // Outbound affiliate postback (after the registration upsert above, so a
  // first-touch registration postback can rely on stored attribution).
  await maybeEnqueuePostback(event, data, affiliateId);
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
