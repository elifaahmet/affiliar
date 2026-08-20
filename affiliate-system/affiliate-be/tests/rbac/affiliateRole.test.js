const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

// Set before requiring the middleware: utils/jwtSecret reads JWT_SECRET at
// require time and throws when it is missing, which is what stops the app
// booting without a real key in production.
const SECRET_KEY = process.env.JWT_SECRET || "a".repeat(64);
process.env.JWT_SECRET = SECRET_KEY;

const authorize = require("../../middlewares/auth");
const AffiliateUser = require("../../models/AffiliateUser");
const Role = require("../../models/Role");

const affiliateRole = {
  roleName: "affiliate",
  permissions: [
    "bonuses.list.view",
    "bonuses.list.create",
    "bonuses.list.edit",
    "bonuses.list.delete",
    "bonuses.reports.view",
  ],
};

let originalFindById;
let originalFindOne;

beforeEach(() => {
  originalFindById = AffiliateUser.findById;
  originalFindOne = Role.findOne;

  AffiliateUser.findById = async () => ({
    _id: "user-1",
    role: "affiliate",
    isDeleted: false,
  });

  Role.findOne = async () => affiliateRole;
});

afterEach(() => {
  AffiliateUser.findById = originalFindById;
  Role.findOne = originalFindOne;
});

const makeReqRes = () => {
  const token = jwt.sign({ sub: "user-1" }, SECRET_KEY);
  const req = {
    headers: { authorization: `Bearer ${token}` },
    header(key) {
      return this.headers[key.toLowerCase()];
    },
  };

  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return { req, res };
};

test("affiliate cannot access global user list", async () => {
  const { req, res } = makeReqRes();
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  await authorize(["players.list.view"])(req, res, next);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("affiliate cannot access operator settings", async () => {
  const { req, res } = makeReqRes();
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  await authorize(["management.casino.settings.view"])(req, res, next);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});
