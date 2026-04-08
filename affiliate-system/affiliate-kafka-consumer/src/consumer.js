import { consumer } from './kafka.js';
import { parseEvent } from './schema.js';
import { validateBusinessRules } from './validator.js';
import { saveToInbox, markInboxProcessed, markInboxFailed, insertActivityHourly, resolveAffiliateId } from './mongodb.js';
import { addToBatch } from './clickhouse.js';
import { buildCommissionInput, calculateCommission } from './commission.js';

/**
 * Process a single Kafka message through the full pipeline:
 *
 * 1. Parse JSON
 * 2. Schema validate (Zod)
 * 3. Save to inbox (audit, deduplication at envelope level)
 * 4. Business rule validation (period, metrics, derived metrics check)
 * 5. Insert into activityHourly (strict — rejects duplicate business key)
 * 6. Trigger commission calculation
 * 7. Add to ClickHouse batch
 * 8. Mark inbox as processed
 *
 * On any error after inbox save: marks inbox as failed and re-throws
 * so Kafka does not commit the offset.
 *
 * @param {string} rawValue
 */
async function processMessage(rawValue) {
  // Step 1 — Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch (err) {
    console.error('[consumer] Failed to parse message JSON:', err.message, '| raw:', rawValue.slice(0, 200));
    // Unparseable message: log and discard (cannot save to inbox without eventId)
    return;
  }

  // Step 2 — Schema validation (Zod)
  const schemaResult = parseEvent(parsed);
  if (!schemaResult.success) {
    console.error(
      '[consumer] Schema validation failed:',
      JSON.stringify(schemaResult.error.flatten(), null, 2)
    );
    // Invalid schema: discard (cannot safely save to inbox)
    return;
  }

  let event = schemaResult.data;
  const { eventId, tenantId, brandId } = event;

  console.log(
    `[consumer] Received event ${eventId} | tenant=${tenantId} brand=${brandId} ` +
    `player=${event.player.playerId} currency=${event.player.currency} ` +
    `period=${event.period.from} → ${event.period.to}`
  );

  // Step 3 — Save to inbox (returns false if duplicate eventId)
  const isNew = await saveToInbox(event);
  if (!isNew) {
    // Duplicate event — already processed or in progress, skip
    return;
  }

  try {
    // Step 4 — Business rule validation
    const derived = validateBusinessRules(event);

    // Step 4b — Resolve affiliateId from code if not provided by producer
    const resolvedAffiliateId = await resolveAffiliateId(event.affiliate);
    if (resolvedAffiliateId !== (event.affiliate?.affiliateId ?? '')) {
      event = {
        ...event,
        affiliate: { ...event.affiliate, affiliateId: resolvedAffiliateId },
      };
    }

    // Step 5 — Insert into activityHourly (strict — skips if duplicate business key)
    const inserted = await insertActivityHourly(event, {
      computedGgrCents: derived.computed.computedGgrCents,
      computedNgrCents: derived.computed.computedNgrCents,
      ggrMismatch: derived.ggrMismatch,
      ngrMismatch: derived.ngrMismatch,
    });

    if (inserted) {
      // Step 6 — Commission calculation
      const commissionInput = buildCommissionInput(event, derived.computed);
      await calculateCommission(commissionInput);

      // Step 7 — Add to ClickHouse batch
      await addToBatch(event, {
        computedGgrCents: derived.computed.computedGgrCents,
        computedNgrCents: derived.computed.computedNgrCents,
        ggrMismatch: derived.ggrMismatch,
        ngrMismatch: derived.ngrMismatch,
      });
    }

    // Step 8 — Mark inbox as processed
    await markInboxProcessed(eventId);
    console.log(`[consumer] Event ${eventId} processed successfully`);
  } catch (err) {
    console.error(`[consumer] Processing failed for event ${eventId}:`, err.message);
    await markInboxFailed(eventId, err.message);
    // Re-throw so Kafka does not commit the offset for this message
    throw err;
  }
}

/**
 * Start consuming messages from the Kafka topic.
 */
export async function startConsuming() {
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const rawValue = message.value?.toString();
      if (!rawValue) {
        console.warn('[consumer] Received empty message, skipping');
        return;
      }

      await processMessage(rawValue);
    },
  });

  console.log('[consumer] Message handler registered, waiting for events...');
}
