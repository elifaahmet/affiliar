const connectDB = require("../config/db");
const Permission = require("../models/Permission");
const {
  getBrandFromEnv,
  filterPermissionsByBrand,
} = require("../config/permissionsConfig");
const { logger } = require("../middlewares/logger");

const permissions = [
  {
    category: "players",
    rules: [
      { resource: "players.list", action: "view" },
      { resource: "players.list", action: "create" },
      { resource: "players.list.editColumns", action: "view" },
      { resource: "players.list.downloadCsv", action: "view" },
      { resource: "players.list.detail", action: "view" },
      { resource: "players.list.detail", action: "edit" },
      { resource: "players.list.detail", action: "create" },
      { resource: "players.list.detail", action: "delete" },
      { resource: "players.list.detail.info", action: "view" },
      { resource: "players.list.detail.info", action: "edit" },
      { resource: "players.list.detail.info", action: "delete" },
      { resource: "players.list.detail.info.playerInfo", action: "view" },
      { resource: "players.list.detail.info.playerInfo", action: "edit" },
      { resource: "players.list.detail.info.changePassword", action: "view" },
      { resource: "players.list.detail.info.changePassword", action: "edit" },
      { resource: "players.list.detail.info.privacyInfo", action: "view" },
      { resource: "players.list.detail.info.privacyInfo", action: "edit" },
      { resource: "players.list.detail.info.messages", action: "view" },
      { resource: "players.list.detail.info.messages", action: "edit" },
      { resource: "players.list.detail.info.messages", action: "delete" },
      {
        resource: "players.list.detail.info.messages.editColumns",
        action: "view",
      },
      {
        resource: "players.list.detail.info.messages.downloadCsv",
        action: "view",
      },
      { resource: "players.list.detail.info.emails", action: "view" },
      {
        resource: "players.list.detail.info.emails.editColumns",
        action: "view",
      },
      {
        resource: "players.list.detail.info.emails.downloadCsv",
        action: "view",
      },
      { resource: "players.list.detail.payment", action: "view" },
      { resource: "players.list.detail.payment", action: "create" },
      { resource: "players.list.detail.payment", action: "delete" },
      { resource: "players.list.detail.payment.deposit", action: "view" },
      { resource: "players.list.detail.payment.deposit", action: "create" },
      { resource: "players.list.detail.payment.withdrawal", action: "view" },
      { resource: "players.list.detail.payment.withdrawal", action: "create" },
      { resource: "players.list.detail.payment.wallet", action: "view" },
      { resource: "players.list.detail.payment.wallet", action: "delete" },
      {
        resource: "players.list.detail.payment.wallet.editColumns",
        action: "view",
      },
      {
        resource: "players.list.detail.payment.wallet.downloadCsv",
        action: "view",
      },
      {
        resource: "players.list.detail.payment.withdrawalRequests",
        action: "view",
      },
      {
        resource: "players.list.detail.payment.withdrawalRequests",
        action: "create",
      },
      {
        resource: "players.list.detail.payment.depositTransactions",
        action: "view",
      },
      { resource: "players.list.detail.bonus", action: "view" },
      { resource: "players.list.detail.bonus", action: "create" },
      { resource: "players.list.detail.bonus", action: "edit" },
      { resource: "players.list.detail.bonus", action: "delete" },
      { resource: "players.list.detail.bonus.editColumns", action: "view" },
      { resource: "players.list.detail.bonus.downloadCsv", action: "view" },
      { resource: "players.list.detail.notes", action: "view" },
      { resource: "players.list.detail.notes", action: "create" },
      { resource: "players.list.detail.notes", action: "edit" },
      { resource: "players.list.detail.notes", action: "delete" },
      { resource: "players.list.detail.notes.editColumns", action: "view" },
      { resource: "players.list.detail.notes.downloadCsv", action: "view" },
      { resource: "players.list.detail.settings", action: "view" },
      { resource: "players.list.detail.settings", action: "create" },
      { resource: "players.list.detail.settings", action: "edit" },
      { resource: "players.list.detail.settings", action: "delete" },
      {
        resource: "players.list.detail.settings.sportsbookLimits",
        action: "view",
      },
      {
        resource: "players.list.detail.settings.sportsbookLimits",
        action: "create",
      },
      {
        resource: "players.list.detail.settings.sportsbookLimits",
        action: "edit",
      },
      {
        resource: "players.list.detail.settings.sportsbookLimits",
        action: "delete",
      },
      {
        resource: "players.list.detail.settings.sportsbookLimits.editColumns",
        action: "view",
      },
      {
        resource: "players.list.detail.settings.sportsbookLimits.downloadCsv",
        action: "view",
      },
      { resource: "players.list.detail.settings.casinoLimits", action: "view" },
      {
        resource: "players.list.detail.settings.casinoLimits",
        action: "create",
      },
      { resource: "players.list.detail.settings.casinoLimits", action: "edit" },
      {
        resource: "players.list.detail.settings.casinoLimits",
        action: "delete",
      },
      {
        resource: "players.list.detail.settings.casinoLimits.editColumns",
        action: "view",
      },
      {
        resource: "players.list.detail.settings.casinoLimits.downloadCsv",
        action: "view",
      },
      {
        resource: "players.list.detail.settings.exchangeLimits",
        action: "view",
      },
      {
        resource: "players.list.detail.settings.exchangeLimits",
        action: "create",
      },
      {
        resource: "players.list.detail.settings.exchangeLimits",
        action: "edit",
      },
      {
        resource: "players.list.detail.settings.exchangeLimits",
        action: "delete",
      },
      {
        resource: "players.list.detail.settings.exchangeLimits.editColumns",
        action: "view",
      },
      {
        resource: "players.list.detail.settings.exchangeLimits.downloadCsv",
        action: "view",
      },
      { resource: "players.group", action: "view" },
      { resource: "players.group", action: "create" },
      { resource: "players.group.editColumns", action: "view" },
      { resource: "players.group.downloadCsv", action: "view" },
    ],
  },
  {
    category: "financial",
    rules: [
      { resource: "financial.payment", action: "view" },
      { resource: "financial.payment.editColumns", action: "view" },
      { resource: "financial.payment.downloadCsv", action: "view" },
      { resource: "financial.deposit", action: "view" },
      { resource: "financial.deposit.editColumns", action: "view" },
      { resource: "financial.deposit.downloadCsv", action: "view" },
      { resource: "financial.withdrawal", action: "view" },
      { resource: "financial.withdrawal.editColumns", action: "view" },
      { resource: "financial.withdrawal.downloadCsv", action: "view" },
      { resource: "financial.withdrawalRequests", action: "view" },
      { resource: "financial.withdrawalRequests.editColumns", action: "view" },
      { resource: "financial.withdrawalRequests.downloadCsv", action: "view" },
      { resource: "financial.accountBalance", action: "view" },
      { resource: "financial.accountBalance.editColumns", action: "view" },
      { resource: "financial.accountBalance.downloadCsv", action: "view" },
      { resource: "financial.balance", action: "view" },
      { resource: "financial.balance.editColumns", action: "view" },
      { resource: "financial.balance.downloadCsv", action: "view" },
    ],
  },
  {
    category: "bonuses",
    rules: [
      { resource: "bonuses.list", action: "view" },
      { resource: "bonuses.list", action: "create" },
      { resource: "bonuses.list", action: "edit" },
      { resource: "bonuses.list", action: "delete" },
      { resource: "bonuses.list.editColumns", action: "view" },
      { resource: "bonuses.list.downloadCsv", action: "view" },
      { resource: "bonuses.reports", action: "view" },
    ],
  },
  {
    category: "games",
    rules: [
      { resource: "games.list", action: "view" },
      { resource: "games.list", action: "edit" },
      { resource: "games.list.editColumns", action: "view" },
      { resource: "games.list.downloadCsv", action: "view" },
      { resource: "games.priority", action: "view" },
      { resource: "games.priority", action: "edit" },
      { resource: "games.category", action: "view" },
      { resource: "games.category", action: "create" },
      { resource: "games.category", action: "edit" },
      { resource: "games.category", action: "delete" },
      { resource: "games.category.editColumns", action: "view" },
      { resource: "games.category.downloadCsv", action: "view" },
      { resource: "games.category.multiCategory", action: "view" },
      { resource: "games.category.multiCategory.editColumns", action: "view" },
      { resource: "games.category.multiCategory.downloadCsv", action: "view" },
    ],
  },
  {
    category: "management",
    rules: [
      { resource: "management.casino", action: "view" },
      { resource: "management.casino", action: "create" },
      { resource: "management.casino", action: "edit" },
      { resource: "management.casino", action: "delete" },
      { resource: "management.casino.limits", action: "view" },
      { resource: "management.casino.limits", action: "create" },
      { resource: "management.casino.limits", action: "edit" },
      { resource: "management.casino.limits", action: "delete" },
      { resource: "management.casino.limits.editColumns", action: "view" },
      { resource: "management.casino.limits.downloadCsv", action: "view" },
      { resource: "management.casino.limitTest", action: "view" },
      { resource: "management.casino.limitPriority", action: "view" },
      { resource: "management.casino.restrictions", action: "view" },
      { resource: "management.casino.restrictions", action: "create" },
      { resource: "management.casino.restrictions", action: "edit" },
      { resource: "management.casino.restrictions", action: "delete" },
      {
        resource: "management.casino.restrictions.editColumns",
        action: "view",
      },
      {
        resource: "management.casino.restrictions.downloadCsv",
        action: "view",
      },
      { resource: "management.casino.settings", action: "view" },
      { resource: "management.casino.settings", action: "create" },
      { resource: "management.casino.settings", action: "delete" },
      { resource: "management.sportsbook", action: "view" },
      { resource: "management.sportsbook", action: "edit" },
      { resource: "management.sportsbook", action: "delete" },
      { resource: "management.sportsbook.editColumns", action: "view" },
      { resource: "management.sportsbook.downloadCsv", action: "view" },
      { resource: "management.exchange", action: "view" },
      { resource: "management.exchange", action: "edit" },
      { resource: "management.exchange", action: "delete" },
      { resource: "management.exchange.editColumns", action: "view" },
      { resource: "management.exchange.downloadCsv", action: "view" },
      { resource: "management.vipclub", action: "view" },
      { resource: "management.vipclub", action: "create" },
      { resource: "management.vipclub", action: "edit" },
      { resource: "management.vipclub", action: "delete" },
      { resource: "management.payment", action: "view" },
      { resource: "management.payment", action: "create" },
      { resource: "management.payment", action: "edit" },
      { resource: "management.payment", action: "delete" },
      { resource: "management.payment.editColumns", action: "view" },
      { resource: "management.payment.downloadCsv", action: "view" },
    ],
  },
  {
    category: "userManagement",
    rules: [
      { resource: "userManagement.users", action: "view" },
      { resource: "userManagement.users", action: "create" },
      { resource: "userManagement.users", action: "edit" },
      { resource: "userManagement.users", action: "delete" },
      { resource: "userManagement.users.editColumns", action: "view" },
      { resource: "userManagement.users.downloadCsv", action: "view" },
      { resource: "userManagement.roles", action: "view" },
      { resource: "userManagement.roles", action: "create" },
      { resource: "userManagement.roles", action: "edit" },
      { resource: "userManagement.roles", action: "delete" },
      { resource: "userManagement.roles.editColumns", action: "view" },
      { resource: "userManagement.roles.downloadCsv", action: "view" },
      {
        resource: "userManagement.roles.superadminPasswordChange",
        action: "edit",
      },
      { resource: "userManagement.roles.adminPasswordChange", action: "edit" },
    ],
  },
  {
    category: "tools",
    rules: [
      { resource: "tools.cms", action: "view" },
      { resource: "tools.theme", action: "view" },
    ],
  },
  {
    category: "notifications",
    rules: [
      { resource: "notifications.list", action: "view" },
      { resource: "notifications.list", action: "delete" },
      { resource: "notifications.list.editColumns", action: "view" },
      { resource: "notifications.list.downloadCsv", action: "view" },
    ],
  },
];

const seed = async () => {
  try {
    await connectDB();
    const brand = getBrandFromEnv();
    const effectivePermissions = filterPermissionsByBrand(permissions, brand);

    await Permission.deleteMany({});
    const bulk = effectivePermissions.flatMap((group) =>
      (group.rules || []).map((rule) => ({
        ...rule,
        category: group.category,
        description: `${rule.resource}.${rule.action}`,
        condition: true,
      })),
    );
    await Permission.insertMany(bulk);
    logger.info("seed.permissions.success", { brand, total: bulk.length });
  } catch (error) {
    logger.error("seed.permissions.failure", { error });
  }
};

seed();
