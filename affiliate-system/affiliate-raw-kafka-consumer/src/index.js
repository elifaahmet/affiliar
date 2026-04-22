import { config } from './config.js';
import { connectConsumer, disconnectConsumer } from './kafka.js';
import { connectClickHouse, closeClickHouse } from './clickhouse.js';
import { startConsuming } from './consumer.js';
import { connectMongo, closeMongo, getAffiliateDb } from './affiliateResolver.js';
import { connectFxRates, closeFxRates } from './fxRates.js';

async function main() {
  console.log('[index] Starting affiliate-raw-kafka-consumer...');
  console.log(`[index] Kafka brokers: ${config.kafka.brokers.join(', ')}`);
  console.log(`[index] Kafka topic:   ${config.kafka.topic}`);
  console.log(`[index] Kafka group:   ${config.kafka.groupId}`);

  connectClickHouse();
  await connectMongo();
  await connectFxRates(getAffiliateDb());
  await connectConsumer();
  await startConsuming();

  console.log('[index] Service started successfully');
}

async function shutdown(signal) {
  console.log(`\n[index] Received ${signal}, shutting down...`);
  try { await disconnectConsumer(); } catch (e) { console.error(e); }
  try { await closeClickHouse(); } catch (e) { console.error(e); }
  try { closeFxRates(); } catch (e) { console.error(e); }
  try { await closeMongo(); } catch (e) { console.error(e); }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('[index] Fatal:', err);
  process.exit(1);
});
