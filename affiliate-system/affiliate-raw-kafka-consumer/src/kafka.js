import { Kafka, logLevel } from 'kafkajs';
import { config } from './config.js';

const kafka = new Kafka({
  clientId: 'affiliate-raw-kafka-consumer',
  brokers: config.kafka.brokers,
  logLevel: logLevel.INFO,
});

export const consumer = kafka.consumer({ groupId: config.kafka.groupId });

// The shared topic plus any tenant that has been split onto its own. Both are
// consumed the same way; the only difference is that a split topic gets its
// tenantId cross-checked in the consumer.
export function subscribedTopics() {
  const topics = new Set(config.kafka.topicTenants.keys());
  if (config.kafka.topic) topics.add(config.kafka.topic);
  return [...topics];
}

export async function connectConsumer() {
  await consumer.connect();
  const topics = subscribedTopics();
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }
  console.log(
    `[kafka] Subscribed to ${topics.length} topic(s), ` +
      `${config.kafka.topicTenants.size} tenant-scoped (group: ${config.kafka.groupId})`,
  );
}

export async function disconnectConsumer() {
  await consumer.disconnect();
  console.log('[kafka] Consumer disconnected');
}
