"use strict";

// What this job puts on the wire is a published contract (WEBHOOK.md), and its
// failure handling decides whether a reward is retried or written off. Both are
// easy to break without any visible symptom, so they're pinned here.

const crypto = require("crypto");
process.env.DATA_ENCRYPTION_KEY =
  process.env.DATA_ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

jest.mock("axios", () => ({ post: jest.fn() }));
jest.mock("../middlewares/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
// Pulled in only for the model registrations the job requires; the tests below
// never touch the database.
jest.mock("../models/RewardDelivery", () => ({ find: jest.fn() }));
jest.mock("../models/ReferAFriendConfig", () => ({ find: jest.fn() }));
jest.mock("../engine/referralEngine", () => ({ applyDeliveryAck: jest.fn() }));

const axios = require("axios");
const { encrypt } = require("../utils/fieldEncryption");
const { generateSecret } = require("../utils/webhookSignature");
const { deliverOne, BACKOFF_MS, MAX_ATTEMPTS } = require("../jobs/rewardCallbackJob");

const SECRET = generateSecret();

function makeDelivery() {
  return {
    _id: "d1",
    eventType: "referral.reward.issued",
    payload: { id: "evt_1", type: "referral.reward.issued", data: { rewardCents: 500 } },
    attempts: 0,
    lastAttemptAt: null,
    lastResponse: null,
    attemptHistory: [],
  };
}

const CONFIG = {
  webhook: {
    url: "https://casino.example/hooks/affiliar",
    secrets: [{ secret: encrypt(SECRET.plain), hint: SECRET.hint, createdAt: new Date(), retiredAt: null }],
  },
};

beforeEach(() => jest.clearAllMocks());

describe("reward webhook delivery", () => {
  test("sends the documented headers and a signature over the exact body", async () => {
    axios.post.mockResolvedValue({ status: 200, data: "ok" });
    const delivery = makeDelivery();

    await deliverOne(delivery, CONFIG);

    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toBe(CONFIG.webhook.url);

    const h = opts.headers;
    expect(h["X-Affiliar-Event"]).toBe("referral.reward.issued");
    expect(h["X-Affiliar-Delivery"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(h["X-Affiliar-Timestamp"]).toMatch(/^\d+$/);

    // The receiver verifies against the raw bytes we sent, so the digest must
    // be over `body` itself — not a re-serialization of the payload object.
    const expected = crypto
      .createHmac("sha256", SECRET.plain)
      .update(`${h["X-Affiliar-Timestamp"]}.${body}`, "utf8")
      .digest("hex");
    expect(h["X-Affiliar-Signature"]).toBe(`t=${h["X-Affiliar-Timestamp"]},v1=${expected}`);
  });

  test("does not let axios re-serialize the signed body", async () => {
    axios.post.mockResolvedValue({ status: 200, data: "ok" });
    const delivery = makeDelivery();

    await deliverOne(delivery, CONFIG);

    const [, body, opts] = axios.post.mock.calls[0];
    expect(typeof body).toBe("string");
    // identity transform — anything else would change the bytes we signed
    expect(opts.transformRequest[0](body)).toBe(body);
  });

  test("2xx counts as delivered", async () => {
    axios.post.mockResolvedValue({ status: 202, data: "" });
    const delivery = makeDelivery();

    await expect(deliverOne(delivery, CONFIG)).resolves.toBe(true);
    expect(delivery.attempts).toBe(1);
    expect(delivery.lastResponse.statusCode).toBe(202);
  });

  test("non-2xx is a failed attempt, not a crash", async () => {
    axios.post.mockResolvedValue({ status: 500, data: "boom" });
    const delivery = makeDelivery();

    await expect(deliverOne(delivery, CONFIG)).resolves.toBe(false);
    expect(delivery.attempts).toBe(1);
    expect(delivery.lastResponse.statusCode).toBe(500);
    expect(delivery.attemptHistory).toHaveLength(1);
  });

  test("a 4xx is retried rather than written off — a deploy bug shouldn't burn a reward", async () => {
    axios.post.mockResolvedValue({ status: 404, data: "not found" });
    const delivery = makeDelivery();

    await expect(deliverOne(delivery, CONFIG)).resolves.toBe(false);
    expect(delivery.attempts).toBeLessThan(MAX_ATTEMPTS);
  });

  test("a network error is recorded as an attempt", async () => {
    axios.post.mockRejectedValue(new Error("ECONNREFUSED"));
    const delivery = makeDelivery();

    await expect(deliverOne(delivery, CONFIG)).resolves.toBe(false);
    expect(delivery.attempts).toBe(1);
    expect(delivery.lastResponse.errorMessage).toMatch(/ECONNREFUSED/);
    expect(delivery.lastResponse.statusCode).toBeNull();
  });

  test("retry ladder matches the published schedule", () => {
    // WEBHOOK.md §5: 1m, 5m, 30m, 2h, 12h, 24h — then give up.
    expect(BACKOFF_MS).toEqual([60e3, 300e3, 1800e3, 7200e3, 43200e3, 86400e3]);
    expect(MAX_ATTEMPTS).toBe(7);
  });
});
