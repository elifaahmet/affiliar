const { createClient } = require("@clickhouse/client");
require("dotenv").config();

const clickhouse = createClient({
  url:      process.env.CLICKHOUSE_URL      || "http://localhost:8123",
  database: process.env.CLICKHOUSE_DB       || "affiliar",
  username: process.env.CLICKHOUSE_USER     || "affiliar",
  password: process.env.CLICKHOUSE_PASSWORD || "affiliar123",
});

module.exports = clickhouse;
