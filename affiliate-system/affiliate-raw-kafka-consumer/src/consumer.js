import { consumer } from './kafka.js';
import { parseRawEvent } from './schema.js';
import { addEvent } from './clickhouse.js';
import { resolveAffiliateId } from './affiliateResolver.js';

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

  const affiliateId = resolveAffiliateId(data.affiliateCode);

  console.log(
    `[consumer] ${event.eventType} | player=${event.playerId} tenant=${event.tenantId} code=${data.affiliateCode || '-'} affiliate=${affiliateId || '-'}`
  );

  addEvent(event, data, affiliateId);
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
