"use strict";

// Provisioning a Kafka producer identity for an operator.
//
// Creating a SCRAM user, its ACL and its topic means running broker admin
// commands, which the API process cannot do on its own — and giving it
// standing broker-admin rights so it can would trade a rare operation for a
// permanent, much larger blast radius if the API is ever compromised.
//
// So this module does not touch the broker. It derives the values a human (or
// a deploy script) applies, and returns the exact commands to run. The
// operator's credentials are generated here so they can go straight into the
// one-time grant without anyone reading them off a terminal.

const crypto = require("crypto");

const BROKERS = process.env.KAFKA_PUBLIC_BROKERS || "";
const SECURITY_PROTOCOL = "SASL_SSL";
const SASL_MECHANISM = "SCRAM-SHA-512";

// Topic naming is a convention, mirroring the consumer's rawEventsTopic():
// <system>.<stream>.<slug>.v<n>. Deriving it in one place keeps the producer's
// topic, the consumer's subscription and the ACL from drifting apart.
function slugFor(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function topicFor(slug, mode) {
  return mode === "aggregated"
    ? `affiliate.casino.activity.aggregated.${slug}.v1`
    : `affiliate.raw.events.${slug}.v1`;
}

// Returns null when no public broker is configured — an operator who asked for
// Kafka then gets REST credentials and a note, rather than half-built Kafka
// settings that point nowhere.
function planKafkaAccess({ operatorName, operatorId, mode }) {
  if (!BROKERS) return null;

  const slug = slugFor(operatorName) || String(operatorId).slice(-8);
  const username = `${slug}-producer`;
  const password = crypto.randomBytes(24).toString("base64url");
  const topic = topicFor(slug, mode);

  return {
    credentials: {
      brokers: BROKERS,
      topic,
      username,
      password,
      securityProtocol: SECURITY_PROTOCOL,
      saslMechanism: SASL_MECHANISM,
    },
    // Run on the broker to make the above real. Kept alongside the credentials
    // so provisioning is one copy-paste rather than a remembered sequence.
    commands: [
      `kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic ${topic} --partitions 3 --replication-factor 1`,
      `kafka-configs.sh --bootstrap-server localhost:9092 --alter --add-config 'SCRAM-SHA-512=[password=<password>]' --entity-type users --entity-name ${username}`,
      `kafka-acls.sh --bootstrap-server localhost:9092 --add --allow-principal User:${username} --operation Write --operation Describe --topic ${topic}`,
    ],
    slug,
  };
}

module.exports = { planKafkaAccess, slugFor, topicFor };
