/**
 * Test Kafka producer for affiliate.casino.activity.aggregated.v1 events.
 *
 * Usage:
 *   node scripts/test-producer.js                  # send 1 event with random IDs
 *   node scripts/test-producer.js --count 5        # send 5 events
 *   node scripts/test-producer.js --tenant t1 --brand b1 --affiliate aff1 --player p1
 *   node scripts/test-producer.js --count 10 --interval 500   # 10 events, 500ms apart
 *
 * Partition key: tenantId:brandId:playerId:currency
 */

import { Kafka, logLevel, CompressionTypes } from 'kafkajs';
import { randomUUID } from 'crypto';
import 'dotenv/config';

// --- CLI args ---
const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const COUNT       = parseInt(getArg('--count', '1'), 10);
const INTERVAL_MS = parseInt(getArg('--interval', '0'), 10);
const TENANT_ID   = getArg('--tenant', 'tenant_test');
const BRAND_ID    = getArg('--brand', 'brand_001');
const AFFILIATE_ID   = getArg('--affiliate', 'aff_test');
const AFFILIATE_CODE = getArg('--affiliateCode', 'TESTCODE');
const PLAYER_ID   = getArg('--player', `player_${Math.floor(Math.random() * 10000)}`);
const CURRENCY    = getArg('--currency', 'EUR');
const GRANULARITY = getArg('--granularity', 'hour');

const BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map(b => b.trim());
const TOPIC   = process.env.KAFKA_TOPIC || 'affiliate.casino.activity.aggregated.v1';

// --- Helpers ---

/**
 * Build a valid hourly period starting at the top of the hour N hours ago.
 * @param {number} hoursAgo
 */
function buildHourlyPeriod(hoursAgo = 1) {
  const now = new Date();
  const from = new Date(now);
  from.setUTCMinutes(0, 0, 0);
  from.setUTCHours(from.getUTCHours() - hoursAgo);
  const to = new Date(from);
  to.setUTCHours(to.getUTCHours() + 1);
  return { from: from.toISOString(), to: to.toISOString(), granularity: 'hour' };
}

/**
 * Build a valid daily period for yesterday.
 */
function buildDailyPeriod() {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  return { from: from.toISOString(), to: to.toISOString(), granularity: 'day' };
}

/**
 * Generate a random realistic aggregated casino activity event.
 * @param {number} index - used to offset period for multi-event sends
 */
function buildEvent(index = 0) {
  const bets    = Math.floor(Math.random() * 200000) + 10000;  // 100–2000 EUR
  const wins    = Math.floor(bets * (0.3 + Math.random() * 0.5)); // 30–80% return
  const betRb   = Math.floor(bets * Math.random() * 0.05);
  const winRb   = Math.floor(wins * Math.random() * 0.03);
  const bonus   = Math.floor(Math.random() * 5000);
  const provFee = Math.floor(Math.random() * 2000);
  const taxes   = Math.floor(Math.random() * 1000);

  const ggr = bets - betRb - wins + winRb;
  const ngr = ggr - bonus - provFee - taxes;

  const deposits = Math.floor(Math.random() * 3) + 1;
  const depSum   = deposits * Math.floor(Math.random() * 20000 + 5000);
  const isFtd    = Math.random() > 0.7;

  const period = GRANULARITY === 'day'
    ? buildDailyPeriod()
    : buildHourlyPeriod(index + 1);

  const eventId = randomUUID().replace(/-/g, '').toUpperCase();

  return {
    eventId,
    eventType: 'affiliate.casino.activity.aggregated.v1',
    eventVersion: 1,

    tenantId:   TENANT_ID,
    operatorId: 'op_test',
    brandId:    BRAND_ID,

    period,

    player: {
      playerId: PLAYER_ID,
      currency: CURRENCY,
      country: 'DE',
    },

    affiliate: {
      affiliateId:   AFFILIATE_ID,
      affiliateCode: AFFILIATE_CODE,
      campaign: 'spring_2026',
      subId: 'tg_channel_1',
    },

    metrics: {
      registrations: isFtd ? 1 : 0,
      ftdCount:      isFtd ? 1 : 0,
      ftdSumCents:   isFtd ? depSum : 0,

      depositsCount:    deposits,
      depositsSumCents: depSum,

      cashoutsCount:    Math.random() > 0.5 ? 1 : 0,
      cashoutsSumCents: Math.random() > 0.5 ? Math.floor(depSum * 0.3) : 0,

      chargebacksCount:    0,
      chargebacksSumCents: 0,

      betsSumCents: bets,
      winsSumCents: wins,
      casinoBetsRollbacksSumCents: betRb,
      casinoWinsRollbacksSumCents: winRb,

      bonusIssuesSumCents:             bonus,
      additionalDeductionsSumCents:    0,
      paymentSystemFeesSumCents:       0,
      jackpotFeesSumCents:             0,
      gameProviderFeesSumCents:        provFee,
      casinoTaxesSumCents:             taxes,

      roundsCount: Math.floor(Math.random() * 80) + 5,
      wagerCents:  bets,

      casinoGgrCents: ggr,
      casinoNgrCents: ngr < 0 ? 0 : ngr,
    },

    playerStatuses: {
      isDuplicate:    false,
      isDisabled:     false,
      isSelfExcluded: false,
      isVerified:     Math.random() > 0.2,
    },

    source: {
      system:     'test-producer',
      traceId:    `trace_${eventId.slice(0, 8)}`,
      producedAt: new Date().toISOString(),
    },
  };
}

// --- Main ---
async function main() {
  const kafka = new Kafka({
    clientId: 'affiliar-test-producer',
    brokers:  BROKERS,
    logLevel: logLevel.WARN,
  });

  const producer = kafka.producer();
  await producer.connect();
  console.log(`[producer] Connected to brokers: ${BROKERS.join(', ')}`);
  console.log(`[producer] Topic: ${TOPIC}`);
  console.log(`[producer] Sending ${COUNT} event(s) | tenant=${TENANT_ID} brand=${BRAND_ID} player=${PLAYER_ID} currency=${CURRENCY}\n`);

  for (let i = 0; i < COUNT; i++) {
    const event = buildEvent(i);
    const partitionKey = `${event.tenantId}:${event.brandId}:${event.player.playerId}:${event.player.currency}`;

    await producer.send({
      topic: TOPIC,
      compression: CompressionTypes.None,
      messages: [
        {
          key: partitionKey,
          value: JSON.stringify(event),
        },
      ],
    });

    console.log(
      `[producer] Sent event ${i + 1}/${COUNT} | eventId=${event.eventId} ` +
      `period=${event.period.from} → ${event.period.to} ` +
      `ngr=${event.metrics.casinoNgrCents}c ftd=${event.metrics.ftdCount}`
    );

    if (INTERVAL_MS > 0 && i < COUNT - 1) {
      await new Promise(r => setTimeout(r, INTERVAL_MS));
    }
  }

  await producer.disconnect();
  console.log('\n[producer] Done. Disconnected.');
}

main().catch((err) => {
  console.error('[producer] Fatal error:', err);
  process.exit(1);
});
