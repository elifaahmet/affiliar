"use strict";

// Topic names are a contract between three places that never see each other:
// the producer's config, the consumer's subscription and the broker ACL. They
// are derived rather than typed for exactly that reason.

describe("without a public broker configured", () => {
  it("plans nothing rather than half-built settings", () => {
    jest.resetModules();
    delete process.env.KAFKA_PUBLIC_BROKERS;
    const { planKafkaAccess } = require("../utils/kafkaProvision");
    // An operator who asked for Kafka gets working REST credentials and a
    // warning, not a broker address that points nowhere.
    expect(planKafkaAccess({ operatorName: "Acme", operatorId: "x", mode: "raw" })).toBeNull();
  });
});

describe("with a broker configured", () => {
  const load = () => {
    jest.resetModules();
    process.env.KAFKA_PUBLIC_BROKERS = "kafka.affiliar.co:9094";
    return require("../utils/kafkaProvision");
  };

  it("derives a slug safe for a topic name", () => {
    const { slugFor } = load();
    expect(slugFor("Acme Gaming Ltd.")).toBe("acme-gaming-ltd");
    // Dots would create a deeper namespace; underscores collide with dots in
    // Kafka's metric names. Neither survives.
    expect(slugFor("bet.roxy_2")).toBe("bet-roxy-2");
    expect(slugFor("  Spaces  ")).toBe("spaces");
  });

  it("routes raw and aggregated to different topics", () => {
    const { topicFor } = load();
    expect(topicFor("acme", "raw")).toBe("affiliate.raw.events.acme.v1");
    expect(topicFor("acme", "aggregated")).toBe("affiliate.casino.activity.aggregated.acme.v1");
  });

  it("names the ACL principal after the same slug as the topic", () => {
    const { planKafkaAccess } = load();
    const p = planKafkaAccess({ operatorName: "Acme Gaming", operatorId: "x", mode: "raw" });
    expect(p.credentials.username).toBe("acme-gaming-producer");
    expect(p.credentials.topic).toContain("acme-gaming");
    expect(p.commands.join(" ")).toContain(p.credentials.username);
    expect(p.commands.join(" ")).toContain(p.credentials.topic);
  });

  it("generates a distinct password each time", () => {
    const { planKafkaAccess } = load();
    const a = planKafkaAccess({ operatorName: "Acme", operatorId: "x", mode: "raw" });
    const b = planKafkaAccess({ operatorName: "Acme", operatorId: "x", mode: "raw" });
    expect(a.credentials.password).not.toBe(b.credentials.password);
    expect(a.credentials.password.length).toBeGreaterThanOrEqual(24);
  });

  it("falls back to the operator id when the name has no usable characters", () => {
    const { planKafkaAccess } = load();
    const p = planKafkaAccess({ operatorName: "!!!", operatorId: "abcdef123456", mode: "raw" });
    expect(p.slug).toBe("ef123456");
  });
});
