"use strict";

// Password reset used to look up an exact, lowercased email. That silently
// found nothing for anyone who signs in with a username — and the endpoint
// answers "if an account exists…" either way, so the failure was invisible
// from the outside. These tests pin the lookup to the same rule login uses.

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "0123456789abcdef0123456789abcdef0123456789abcdef";

const mockFindOne = jest.fn();
jest.mock("../models/User", () => ({ findOne: (...a) => mockFindOne(...a) }));
jest.mock("../models/PasswordResetToken", () => ({ create: jest.fn() }));
jest.mock("../utils/mailer", () => ({
  sendPasswordReset: jest.fn(),
  sendBillingUpcoming: jest.fn(),
  sendBillingDueToday: jest.fn(),
  sendBillingPastDueReminder: jest.fn(),
  sendBillingSuspendedNotice: jest.fn(),
}));

const { sendPasswordReset } = require("../utils/mailer");
const { forgotPassword } = require("../controllers/authController");

const USER = { _id: "u1", email: "Test.Affiliate@Hexora.bet", name: "Test", isDeleted: false };

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

/** Resolve the mocked query against a fixed user list, honouring the $or regexes. */
function respondWith(users) {
  mockFindOne.mockImplementation((query) => {
    const found = users.find((u) =>
      query.$or.some(({ email, username }) => {
        const rx = email || username;
        const field = email ? u.email : u.username;
        return typeof field === "string" && rx.test(field);
      }),
    );
    return Promise.resolve(found || null);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  respondWith([{ ...USER, username: "test.affiliate" }]);
});

describe("forgot password lookup", () => {
  test("finds the account by username", async () => {
    const res = mockRes();
    await forgotPassword({ body: { identifier: "test.affiliate" } }, res);

    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
    // The link always goes to the account's email, however they were found.
    expect(sendPasswordReset.mock.calls[0][0].to).toBe(USER.email);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("finds the account when the stored email has uppercase", async () => {
    const res = mockRes();
    await forgotPassword({ body: { identifier: "test.affiliate@hexora.bet" } }, res);
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  test("still accepts the legacy `email` body key", async () => {
    const res = mockRes();
    await forgotPassword({ body: { email: "test.affiliate" } }, res);
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  test("a dot in the identifier is a literal, not a wildcard", async () => {
    respondWith([{ ...USER, username: "test.affiliate" }]);
    const res = mockRes();
    // Would match "test.affiliate" if the dot were left as a regex wildcard.
    await forgotPassword({ body: { identifier: "testxaffiliate" } }, res);

    expect(sendPasswordReset).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("the identifier is anchored — a substring must not match", async () => {
    const res = mockRes();
    await forgotPassword({ body: { identifier: "affiliate" } }, res);
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  test("an unknown identifier still gets the generic reply, not a 404", async () => {
    const res = mockRes();
    await forgotPassword({ body: { identifier: "nobody@example.test" } }, res);

    expect(sendPasswordReset).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    // Answering differently here would turn the endpoint into an account oracle.
    expect(res.json.mock.calls[0][0]).toHaveProperty("message");
    expect(res.json.mock.calls[0][0]).not.toHaveProperty("error");
  });

  test("an empty identifier is rejected", async () => {
    const res = mockRes();
    await forgotPassword({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });
});
