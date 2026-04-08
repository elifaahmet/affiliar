import { config } from './config.js';
import { connectConsumer, disconnectConsumer } from './kafka.js';
import { connectMongo, closeMongo } from './mongodb.js';
import { connectClickHouse, closeClickHouse } from './clickhouse.js';
import { startConsuming } from './consumer.js';

async function main() {
  console.log('[index] Starting affiliar-kafka-consumer...');
  console.log(`[index] Kafka brokers: ${config.kafka.brokers.join(', ')}`);
  console.log(`[index] Kafka topic: ${config.kafka.topic}`);
  console.log(`[index] Kafka group: ${config.kafka.groupId}`);

  await connectMongo();
  connectClickHouse();
  await connectConsumer();
  await startConsuming();

  console.log('[index] Service started successfully');
}

async function shutdown(signal) {
  console.log(`\n[index] Received ${signal}, shutting down gracefully...`);

  try {
    await disconnectConsumer();
  } catch (err) {
    console.error('[index] Error disconnecting Kafka consumer:', err);
  }

  try {
    await closeClickHouse();
  } catch (err) {
    console.error('[index] Error closing ClickHouse client:', err);
  }

  try {
    await closeMongo();
  } catch (err) {
    console.error('[index] Error closing MongoDB connection:', err);
  }

  console.log('[index] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('[index] Fatal startup error:', err);
  process.exit(1);
});
