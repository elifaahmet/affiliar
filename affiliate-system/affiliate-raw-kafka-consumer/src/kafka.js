import { Kafka, logLevel } from 'kafkajs';
import { config } from './config.js';

const kafka = new Kafka({
  clientId: 'affiliate-raw-kafka-consumer',
  brokers: config.kafka.brokers,
  logLevel: logLevel.INFO,
});

export const consumer = kafka.consumer({ groupId: config.kafka.groupId });

export async function connectConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafka.topic, fromBeginning: false });
  console.log(`[kafka] Subscribed to "${config.kafka.topic}" (group: ${config.kafka.groupId})`);
}

export async function disconnectConsumer() {
  await consumer.disconnect();
  console.log('[kafka] Consumer disconnected');
}
