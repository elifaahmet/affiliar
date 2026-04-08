const MSG = {
  PERM_GETALL_OK: {
    key: "perm.getall.ok",
    text: "Fetched all permissions successfully",
  },
  PERM_GETALL_ERR: {
    key: "perm.getall.err",
    text: "Failed to fetch permissions",
  }, // Backfill player dashboard
  BACKFILL_START: {
    key: "backfill.start",
    text: "Backfill: starting 63-day player dashboards",
  },
  PLAYER_LIMITS_ERR: {
    key: "player.limits.error",
    text: "Player limits controller error",
  },
  MESSAGES_ERR: {
    key: "messages.error",
    text: "Messages controller error",
  },
  LANGUAGE_ERR: {
    key: "language.error",
    text: "Language controller error",
  },
  BACKFILL_PLAYER_SCAN_OK: {
    key: "backfill.player_scan_ok",
    text: "Backfill: active players loaded",
  },
  BACKFILL_PLAYER_DAY_OK: {
    key: "backfill.player_day_ok",
    text: "Backfill: player day cached",
  },
  BACKFILL_PLAYER_DAY_ERR: {
    key: "backfill.player_day_err",
    text: "Backfill: player day failed",
  },
  BACKFILL_DONE: {
    key: "backfill.done",
    text: "Backfill: finished 63-day run",
  },

  CRON_DELETE_INACTIVE_PLAYERS_SUCCESS: {
    key: "cron.deleteInactivePlayers.success",
    text: "Successfully completed inactive players cleanup",
  },
  CRON_DELETE_INACTIVE_PLAYERS_NOACTION: {
    key: "cron.deleteInactivePlayers.noaction",
    text: "No inactive players found for cleanup",
  },
  CRON_DELETE_INACTIVE_PLAYERS_ERROR: {
    key: "cron.deleteInactivePlayers.error",
    text: "Error during inactive players cleanup",
  },
  DB_CONNECT_SUCCESS: "MongoDB connection established successfully",
  DB_CONNECT_ERR: "MongoDB connection failed",
  WALLET_TX_LIST_BY_WALLET_ERR: "Failed to fetch transactions by walletId",
  WALLET_TX_ALL_ERR: "Failed to fetch all transactions",
  WALLET_TX_LIST_CASINO_BY_WALLET_ERR:
    "Failed to fetch casino transactions by walletId",
  WALLET_TX_DEPOSIT_GENERAL_ERR: "Failed to fetch general deposit transactions",
  WALLET_TX_WITHDRAW_GENERAL_ERR:
    "Failed to fetch general withdrawal transactions",
  WALLET_TX_GET_BY_WALLET_ERR: "Failed to fetch transactions by walletId",
  WALLET_TX_DEPOSITS_BY_USER_ERR: "Failed to fetch deposits by userId",
  WALLET_DEPOSIT_ERR: {
    key: "wallet.deposit.err",
    text: "Wallet deposit error",
  },
  WALLET_WITHDRAW_ERR: {
    key: "wallet.withdraw.err",
    text: "Wallet withdrawal error",
  },
  CLICKHOUSE_DISABLED: {
    key: "clickhouse.disabled",
    text: "ClickHouse ingestion disabled",
  },
  CLICKHOUSE_INGEST_OK: {
    key: "clickhouse.ingest.ok",
    text: "ClickHouse ingest succeeded",
  },
  CLICKHOUSE_INGEST_ERR: {
    key: "clickhouse.ingest.err",
    text: "ClickHouse ingest failed",
  },
  REDIS_ADD_ERR: {
    key: "redis.add.err",
    text: "Failed to add item to Redis",
  },
  DASHBOARD_FETCH_ERR: {
    key: "dashboard.fetch.error",
    text: "Error fetching dashboard data",
  },
  DASHBOARD_BACKFILL_ERR: {
    key: "dashboard.backfill.error",
    text: "Error during dashboard backfill",
  },
  DASHBOARD_PLAYER_BACKFILL_ERR: {
    key: "dashboard.player.backfill.error",
    text: "Error during player dashboard backfill",
  },
  DASHBOARD_RANGE_ERR: {
    key: "dashboard.range.error",
    text: "Error fetching dashboard range",
  },
  DASHBOARD_PLAYER_RANGE_ERR: {
    key: "dashboard.player.range.error",
    text: "Error fetching player dashboard range",
  },
  DASHBOARD_PLAYER_LMTD_ERR: {
    key: "dashboard.player.lmtd.error",
    text: "Error generating player LMTD data",
  },
  DASHBOARD_PLAYER_ALL_ERR: {
    key: "dashboard.player.all.error",
    text: "Error fetching all player dashboard data",
  },
  WALLET_ADD_ERR: { key: "wallet.add.err", text: "Add wallet error" },
  WALLET_BONUS_ERR: { key: "wallet.bonus.err", text: "Bonus wallet error" },
  WALLET_FETCH_ERR: { key: "wallet.fetch.err", text: "Fetch wallet(s) error" },
  WALLET_REDIS_ERR: {
    key: "wallet.redis.err",
    text: "Redis update error in wallet flow",
  },
  DASHBOARD_FETCH_ERR: {
    key: "dashboard.fetch.error",
    text: "Error fetching dashboard data",
  },
  DASHBOARD_REDIS_BACKFILL_ERR: {
    key: "dashboard.redis_backfill.error",
    text: "Error during Redis backfill",
  },
  DASHBOARD_BACKFILL_ERR: {
    key: "dashboard.backfill.error",
    text: "Error during dashboard backfill for date",
  },
  DASHBOARD_LMTD_ERR: {
    key: "dashboard.lmtd.error",
    text: "Error calculating dashboard LMTD data",
  },
  DASHBOARD_RANGE_ERR: {
    key: "dashboard.range.error",
    text: "Error fetching dashboard range",
  },
  DASHBOARD_PLAYER_BACKFILL_ERR: {
    key: "dashboard.player_backfill.error",
    text: "Error during player dashboard backfill",
  },
  WS_START: { key: "ws.start", text: "WebSocket server started" },
  WS_CONN: { key: "ws.connection", text: "Admin client connected" },
  WS_DISCONN: { key: "ws.disconnect", text: "Admin client disconnected" },
  WS_PING_MISSED: {
    key: "ws.ping.missed",
    text: "Admin client unresponsive; terminating",
  },
  WS_MSG_PARSE_ERR: {
    key: "ws.message.parse_err",
    text: "Failed to handle WS message",
  },
  WS_ERR: { key: "ws.error", text: "WebSocket error" },

  REDIS_SUB_READY: { key: "redis.sub.ready", text: "Redis Sub ready" },
  REDIS_SUB_CONNECT: { key: "redis.sub.connect", text: "Redis Sub connected" },
  REDIS_SUB_CLOSE: {
    key: "redis.sub.close",
    text: "Redis Sub connection closed",
  },
  REDIS_SUB_RECONNECT: {
    key: "redis.sub.reconnect",
    text: "Redis Sub reconnecting",
  },
  REDIS_SUB_ERR: { key: "redis.sub.error", text: "Redis Sub error" },
  REDIS_SUB_END: { key: "redis.sub.end", text: "Redis Sub connection ended" },
  REDIS_PUB_HANDLE_ERR: {
    key: "redis.pub.handle_err",
    text: "Redis pubsub handle error",
  },

  WS_JOIN_ROOM: { key: "ws.room.join", text: "WS joined room" },
  WS_LEAVE_ROOM: { key: "ws.room.leave", text: "WS left room" },
  WS_RESUB_DAY: {
    key: "ws.resub.day",
    text: "Date changed; resubscribing to today channel",
  },
  DASHBOARD_PLAYER_RANGE_ERR: {
    key: "dashboard.player_range.error",
    text: "Error fetching player dashboard range",
  },
  LIMIT_CHECK_ERR: { key: "limit.check.error", text: "Limit check failed" },
  DASHBOARD_PLAYER_LMTD_ERR: {
    key: "dashboard.player_lmtd.error",
    text: "Error generating player LMTD data",
  },
  DASHBOARD_PLAYER_ALL_ERR: {
    key: "dashboard.player_all.error",
    text: "Error fetching all player dashboard data",
  },
  USER_BETS_ERR: { key: "user.bets.err", text: "User bets controller error" },
  ROLE_CREATE_OK: { key: "role.create.ok", text: "Role created successfully" },
  ROLE_CREATE_ERR: { key: "role.create.err", text: "Failed to create role" },
  PERM_GROUPED_OK: {
    key: "perm.grouped.ok",
    text: "Fetched permissions grouped successfully",
  },
  RESTRICTION_ERR: {
    key: "restriction.err",
    text: "Restriction controller error",
  },
  PERM_GROUPED_ERR: {
    key: "perm.grouped.err",
    text: "Failed to fetch grouped permissions",
  },
  ROLE_UPDATE_OK: { key: "role.update.ok", text: "Role updated successfully" },
  ROLE_UPDATE_ERR: { key: "role.update.err", text: "Failed to update role" },
  SERVER_STARTED: {
    key: "server.started",
    text: "Server has started successfully",
  },
  HEALTH_OK: { key: "health.ok", text: "Health check passed" },
  PLAYER_LIMITS_REFRESH_DONE: {
    key: "player_limits.refresh.done",
    text: "Refreshing player_casino_limits cache items is completed",
  },
  REDIS_UPDATE_OK: {
    key: "redis.update.ok",
    text: "Redis update completed successfully",
  },
  REDIS_UPDATE_ERR: { key: "redis.update.error", text: "Redis update failed" },
  WITHDRAWAL_SUCCESS: {
    key: "withdrawal.success",
    text: "Withdrawal request has been processed successfully",
  },
  WITHDRAWAL_ERROR: {
    key: "withdrawal.error",
    text: "Withdrawal request failed",
  },
  ADMIN_GET_OPTIONS_ERR: {
    key: "admin.get_options.error",
    text: "Failed to get admin user options",
  },
  ADMIN_GET_ALL_ERR: {
    key: "admin.get_all.error",
    text: "Failed to get admin users",
  },
  ADMIN_GET_ERR: { key: "admin.get.error", text: "Failed to get admin user" },
  ADMIN_CREATE_ERR: {
    key: "admin.create.error",
    text: "Failed to create admin user",
  },
  ADMIN_UPDATE_ERR: {
    key: "admin.update.error",
    text: "Failed to update admin user",
  },
  ADMIN_RESET_2FA_ERR: {
    key: "admin.reset_2fa.error",
    text: "Failed to reset admin user 2FA",
  },
  ADMIN_DELETE_ERR: {
    key: "admin.delete.error",
    text: "Failed to delete admin user",
  },

  ADMINPREF_GET_SHORTCUTS_ERR: {
    key: "adminpref.get_shortcuts.error",
    text: "Failed to get admin quick-access shortcuts",
  },
  ADMINPREF_UPDATE_SHORTCUTS_ERR: {
    key: "adminpref.update_shortcuts.error",
    text: "Failed to update admin quick-access shortcuts",
  },
  ADMINPREF_UPDATE_SHORTCUTS_OK: {
    key: "adminpref.update_shortcuts.ok",
    text: "Admin quick-access shortcuts were updated successfully",
  },
  AUTH_LOGIN_INVALID: {
    key: "auth.login.invalid",
    text: "Invalid admin login credentials",
  },
  AUTH_LOGIN_2FA_REQUIRED: {
    key: "auth.login.2fa_required",
    text: "Admin login requires two-factor verification",
  },
  AUTH_LOGIN_2FA_SETUP: {
    key: "auth.login.2fa_setup",
    text: "Admin login requires two-factor setup",
  },
  AUTH_LOGIN_ERROR: {
    key: "auth.login.error",
    text: "An error occurred during admin login",
  },

  AUTH_REFRESH_MISSING: {
    key: "auth.refresh.missing",
    text: "Refresh token is missing",
  },
  AUTH_REFRESH_EXPIRED: {
    key: "auth.refresh.expired",
    text: "Refresh token expired",
  },
  AUTH_REFRESH_IP_MISMATCH: {
    key: "auth.refresh.ip_mismatch",
    text: "Refresh token IP address mismatch",
  },
  AUTH_REFRESH_ID_MISMATCH: {
    key: "auth.refresh.id_mismatch",
    text: "Refresh token admin ID mismatch",
  },
  AUTH_REFRESH_USER_NOTFOUND: {
    key: "auth.refresh.user_not_found",
    text: "Admin user not found during refresh",
  },
  PLAYER_NOTIFICATION_ERR: {
    key: "player.notification.err",
    text: "Player notification controller error",
  },
  AUTH_REFRESH_OK: { key: "auth.refresh.ok", text: "Refresh token is valid" },
  AUTH_REFRESH_INVALID: {
    key: "auth.refresh.invalid",
    text: "Invalid refresh token",
  },

  AUTH_2FA_QR_INVALID: {
    key: "auth.2fa.qr_invalid",
    text: "Invalid request for 2FA QR generation",
  },
  AUTH_2FA_QR_ERROR: {
    key: "auth.2fa.qr_error",
    text: "Error generating 2FA QR code",
  },

  AUTH_2FA_INVALID_USER: {
    key: "auth.2fa.invalid_user",
    text: "Invalid user or 2FA not set up",
  },
  AUTH_2FA_INVALID_OTP: {
    key: "auth.2fa.invalid_otp",
    text: "Invalid one-time password code",
  },
  AUTH_2FA_SUCCESS: {
    key: "auth.2fa.success",
    text: "Login successful with two-factor authentication",
  },
  AUTH_2FA_ERROR: {
    key: "auth.2fa.error",
    text: "An error occurred during two-factor verification",
  },

  AUTH_PASSWORD_CHANGE_OK: {
    key: "auth.password.change_ok",
    text: "Admin password changed successfully",
  },
  AUTH_PASSWORD_CHANGE_ERROR: {
    key: "auth.password.change_error",
    text: "An error occurred while changing admin password",
  },
  AUTH_PASSWORD_INVALID_CUR: {
    key: "auth.password.invalid_current",
    text: "Current password is incorrect",
  },
  AUTH_PASSWORD_POLICY_FAIL: {
    key: "auth.password.policy_fail",
    text: "New password does not meet policy requirements",
  },

  AUTH_PROFILE_UPDATED: {
    key: "auth.profile.updated",
    text: "Admin profile updated",
  },
  AUTH_PROFILE_UPDATE_ERROR: {
    key: "auth.profile.update_error",
    text: "Admin profile update failed",
  },

  AUTH_LOGOUT_OK: {
    key: "auth.logout.ok",
    text: "Admin logged out successfully",
  },

  ROLE_NOT_FOUND_WARN: {
    key: "role.missing",
    text: "Role not found; assigning viewer",
  },
  BONUS_TYPES_FETCH_ERR: {
    key: "bonus.types.fetch.error",
    text: "Failed to fetch bonus types",
  },
  BONUS_DEFS_FETCH_ERR: {
    key: "bonus.definitions.fetch.error",
    text: "Failed to fetch bonus definitions",
  },
  BONUS_DEF_ADD_ERR: {
    key: "bonus.definition.add.error",
    text: "Failed to add bonus definition",
  },
  BONUS_CMS_SYNC_REQ: {
    key: "bonus.definition.cms_sync.request",
    text: "Sending bonus definition to CMS",
  },
  BONUS_CMS_CATEGORY_ERR: {
    key: "bonus.definition.cms_sync.category_error",
    text: "Failed to resolve categories for CMS sync",
  },
  BONUS_CMS_SYNC_ERR: {
    key: "bonus.definition.cms_sync.error",
    text: "Failed to sync bonus definition with CMS",
  },
  BONUS_CMS_DELETE_REQ: {
    key: "bonus.definition.cms_delete.request",
    text: "Sending bonus definition delete to CMS",
  },
  BONUS_CMS_DELETE_ERR: {
    key: "bonus.definition.cms_delete.error",
    text: "Failed to delete bonus definition in CMS",
  },
  BONUS_CMS_STATUS_REQ: {
    key: "bonus.definition.cms_status.request",
    text: "Sending bonus status update to CMS",
  },
  BONUS_CMS_STATUS_ERR: {
    key: "bonus.definition.cms_status.error",
    text: "Failed to update bonus status in CMS",
  },
  BONUS_CMS_UPDATE_ERR: {
    key: "bonus.definition.cms_update.error",
    text: "Failed to update bonus definition from CMS",
  },
  BONUS_DEF_DELETE_ERR: {
    key: "bonus.definition.delete.error",
    text: "Failed to delete bonus definition",
  },
  BONUS_REPORT_WALLETS_ERR: {
    key: "bonus.report.wallets.error",
    text: "Failed to fetch bonus wallets report",
  },
  BONUS_REPORT_CONVERSIONS_ERR: {
    key: "bonus.report.conversions.error",
    text: "Failed to fetch bonus conversions report",
  },
  BONUS_REPORT_WALLETS_BY_PLAYER_ERR: {
    key: "bonus.report.wallets_by_player.error",
    text: "Failed to fetch bonus wallets report by player",
  },
  BONUS_REPORT_WALLETS_BY_TYPE_ERR: {
    key: "bonus.report.wallets_by_type.error",
    text: "Failed to fetch bonus wallets report by type",
  },
  CASINO_STATS_FETCH_ERR: {
    key: "casino.stats.fetch.error",
    text: "Failed to fetch casino stats for all players",
  },
  CASINO_STATS_PROVIDER_ERR: {
    key: "casino.stats.provider.error",
    text: "Failed to fetch casino stats by provider",
  },
  CASINO_BETS_PAGINATION_ERR: {
    key: "casino.bets.pagination.error",
    text: "Failed to fetch casino bets with pagination",
  },
  CASINO_PLAYER_REPORT_ERR: {
    key: "casino.player.report.error",
    text: "Failed to fetch casino report by players",
  },
  CASINO_PLAYER_GAME_REPORT_ERR: {
    key: "casino.playergame.report.error",
    text: "Failed to fetch casino report by player and game",
  },
  OURCATEGORY_FETCH_ERR: {
    key: "ourcategory.fetch.error",
    text: "Failed to fetch all categories",
  },
  OURCATEGORY_SELECT_ERR: {
    key: "ourcategory.select.error",
    text: "Failed to fetch categories for select options",
  },
  COUNTRY_CONTROLLER_ERR: {
    key: "country.controller.error",
    text: "Error in Country controller",
  },
  CASINO_FILTERS_ERR: {
    key: "casino.filters.error",
    text: "Error in Casino filters controller",
  },
  CURRENCY_CONTROLLER_ERR: {
    key: "currency.controller.error",
    text: "Error in Currency controller",
  },
  GAMES_BY_GROUP_ERR: {
    key: "games.by_group.error",
    text: "Failed to fetch games by group",
  },
  GAMES_ADD_ERR: { key: "games.add.error", text: "Failed to add game" },
  GAMES_PRIORITY_UPDATE_OK: {
    key: "games.priority.update.ok",
    text: "Game priorities updated successfully",
  },
  GAMES_PRIORITY_UPDATE_ERR: {
    key: "games.priority.update.error",
    text: "Failed to update game priorities",
  },
  GAMES_GET_ERR: { key: "games.get.error", text: "Failed to get game" },
  GAMES_LIST_ERR: { key: "games.list.error", text: "Failed to fetch games" },
  GAMES_NAMES_ERR: {
    key: "games.names.error",
    text: "Failed to fetch game names",
  },
  GAMES_ADMIN_ALLOWED_UPDATE_OK: {
    key: "games.admin_allowed.update.ok",
    text: "Game admin_allowed updated",
  },
  GAMES_ADMIN_ALLOWED_UPDATE_ERR: {
    key: "games.admin_allowed.update.error",
    text: "Failed to update game admin_allowed",
  },
  GAMES_SET_CATS_OK: {
    key: "games.set_categories.ok",
    text: "Categories assigned to game",
  },
  GAMES_SET_CATS_ERR: {
    key: "games.set_categories.error",
    text: "Failed to assign categories to game",
  },
  GAMES_REMOVE_CAT_OK: {
    key: "games.remove_category.ok",
    text: "Category removed from game",
  },
  GAMES_REMOVE_CAT_ERR: {
    key: "games.remove_category.error",
    text: "Failed to remove category from game",
  },
  GAMES_UNDISPLAYED_COUNT_ERR: {
    key: "games.undisplayed_count.error",
    text: "Failed to fetch undisplayed count",
  },
  GENERAL_LIMIT_GET_ERR: {
    key: "general_limit.get.error",
    text: "Failed to get general limit",
  },
  GENERAL_LIMIT_LIST_ERR: {
    key: "general_limit.list.error",
    text: "Failed to list general limits",
  },
  GENERAL_LIMIT_UPSERT_ERR: {
    key: "general_limit.upsert.error",
    text: "Failed to upsert general limit",
  },
  GENERAL_LIMIT_UPDATE_AMOUNTS_ERR: {
    key: "general_limit.update_amounts.error",
    text: "Failed to update limits from general limit",
  },
  MARKETINGCODE_GETALL_ERR: {
    key: "marketingcode.get_all.error",
    text: "Failed to fetch marketing codes",
  },
  MARKETINGCODE_GETBYID_ERR: {
    key: "marketingcode.get_byid.error",
    text: "Failed to fetch marketing code by ID",
  },
  MARKETINGCODE_GETBYGENID_ERR: {
    key: "marketingcode.get_bygenid.error",
    text: "Failed to fetch marketing code by generated ID",
  },
  NOTES_CONTROLLER_ERR: {
    key: "notes.controller.error",
    text: "Error in Notes controller",
  },
  OURCATEGORIES_CONTROLLER_ERR: {
    key: "ourcategories.controller.error",
    text: "Error in OurCategories controller",
  },
  PLAYER_CONTROLLER_ERR: {
    key: "player.controller.error",
    text: "Error in Player controller",
  },

  PLAYER_GETALL_OK: {
    key: "player.get_all.ok",
    text: "Fetched players successfully",
  },
  PLAYER_GET_OK: {
    key: "player.get.ok",
    text: "Fetched player successfully",
  },

  PLAYER_UPDATE_OK: {
    key: "player.update.ok",
    text: "Player updated successfully",
  },
  PLAYER_PASSWORD_CHANGE_OK: {
    key: "player.password.change.ok",
    text: "Player password changed successfully",
  },
  PLAYER_CREATE_OK: {
    key: "player.create.ok",
    text: "Player created successfully",
  },
  PLAYER_GETALL_ERR: {
    key: "player.get_all.error",
    text: "Failed to fetch players",
  },
  PLAYER_GET_ERR: {
    key: "player.get.error",
    text: "Failed to fetch player",
  },
  PLAYER_WALLETS_ERR: {
    key: "player.wallets.error",
    text: "Failed to fetch player wallets",
  },
  PLAYER_UPDATE_ERR: {
    key: "player.update.error",
    text: "Failed to update player",
  },
  PLAYER_PASSWORD_CHANGE_ERR: {
    key: "player.password.change.error",
    text: "Failed to change player password",
  },
  PLAYER_CREATE_ERR: {
    key: "player.create.error",
    text: "Failed to create player",
  },
  PLAYER_CONTROLLER_ERR: {
    key: "player.controller.error",
    text: "Error in Player controller",
  },
  PLAYER_LIMIT_CREATE_OK: {
    key: "player_limit.create.ok",
    text: "Player limit(s) created",
  },
  PLAYER_LIMIT_CREATE_DUP: {
    key: "player_limit.create.duplicate",
    text: "Player limit already exists for one or more scopes",
  },
  PLAYER_LIMIT_CREATE_ERR: {
    key: "player_limit.create.error",
    text: "Failed to create player limit(s)",
  },

  PLAYER_LIMITS_FROM_GENERAL_OK: {
    key: "player_limit.from_general.ok",
    text: "Updated player percent limits from general limit",
  },
  PLAYER_LIMITS_FROM_GENERAL_NONE: {
    key: "player_limit.from_general.none",
    text: "No player percent limits to update",
  },
  PLAYER_LIMITS_FROM_GENERAL_ERR: {
    key: "player_limit.from_general.error",
    text: "Failed to update player limits from general limit",
  },

  PLAYER_LIMIT_PRIORITY_OK: {
    key: "player_limit.priority.ok",
    text: "Player limit priorities updated",
  },
  PLAYER_LIMIT_PRIORITY_NONE: {
    key: "player_limit.priority.none",
    text: "No player limit priorities to update",
  },
  PLAYER_LIMIT_PRIORITY_ERR: {
    key: "player_limit.priority.error",
    text: "Failed to update player limit priorities",
  },

  PLAYER_LIMIT_UPDATE_OK: {
    key: "player_limit.update.ok",
    text: "Player limit updated",
  },
  PLAYER_LIMIT_UPDATE_INVALID_ID: {
    key: "player_limit.update.invalid_id",
    text: "Invalid player limit id",
  },
  PLAYER_LIMIT_UPDATE_NOT_FOUND: {
    key: "player_limit.update.not_found",
    text: "Player limit not found",
  },
  PLAYER_LIMIT_UPDATE_ERR: {
    key: "player_limit.update.error",
    text: "Failed to update player limit",
  },

  PLAYER_LIMITS_FETCH_OK: {
    key: "player_limit.fetch.ok",
    text: "Fetched player limits",
  },
  PLAYER_LIMITS_FETCH_ERR: {
    key: "player_limit.fetch.error",
    text: "Failed to fetch player limits",
  },
  PLAYER_LIMITS_ALL_FETCH_OK: {
    key: "player_limit.fetch_all.ok",
    text: "Fetched all player limits",
  },
  PLAYER_LIMITS_ALL_FETCH_ERR: {
    key: "player_limit.fetch_all.error",
    text: "Failed to fetch all player limits",
  },

  PLAYER_LIMIT_TOGGLE_OK: {
    key: "player_limit.toggle.ok",
    text: "Player limit toggled",
  },
  PLAYER_LIMIT_TOGGLE_INVALID_ID: {
    key: "player_limit.toggle.invalid_id",
    text: "Invalid player limit id",
  },
  PLAYER_LIMIT_TOGGLE_NOT_FOUND: {
    key: "player_limit.toggle.not_found",
    text: "Player limit to toggle not found",
  },
  PLAYER_LIMIT_TOGGLE_ERR: {
    key: "player_limit.toggle.error",
    text: "Failed to toggle player limit",
  },

  PLAYER_LIMIT_DELETE_OK: {
    key: "player_limit.delete.ok",
    text: "Player limit deleted",
  },
  PLAYER_LIMIT_DELETE_INVALID_ID: {
    key: "player_limit.delete.invalid_id",
    text: "Invalid player limit id",
  },
  PLAYER_LIMIT_DELETE_NOT_FOUND: {
    key: "player_limit.delete.not_found",
    text: "Player limit to delete not found",
  },
  PLAYER_LIMIT_DELETE_ERR: {
    key: "player_limit.delete.error",
    text: "Failed to delete player limit",
  },
  PROVIDER_GETALL_OK: {
    key: "provider.getall.ok",
    text: "Fetched all providers successfully",
  },
  PROVIDER_GETALL_ERR: {
    key: "provider.getall.err",
    text: "Failed to fetch providers",
  },
  PROVIDER_SELECTION_OK: {
    key: "provider.selection.ok",
    text: "Fetched providers for selection successfully",
  },
  PROVIDER_SELECTION_ERR: {
    key: "provider.selection.err",
    text: "Failed to fetch providers for selection",
  },
  PROVIDER_AUTOENABLE_OK: {
    key: "provider.autoenable.ok",
    text: "Updated auto-enable new games",
  },
  PROVIDER_AUTOENABLE_ERR: {
    key: "provider.autoenable.err",
    text: "Failed to update auto-enable new games",
  },
  PROVIDER_AUTOENABLED_LIST_OK: {
    key: "provider.autoenabled.list.ok",
    text: "Fetched auto-enabled providers successfully",
  },
  PROVIDER_AUTOENABLED_LIST_ERR: {
    key: "provider.autoenabled.list.err",
    text: "Failed to fetch auto-enabled providers",
  },
  PROVIDER_MAINTENANCE_CLEAR_OK: {
    key: "provider.maintenance.clear.ok",
    text: "Cleared maintenance window",
  },
  PROVIDER_MAINTENANCE_UPDATE_OK: {
    key: "provider.maintenance.update.ok",
    text: "Updated maintenance window",
  },
  PROVIDER_MAINTENANCE_UPDATE_ERR: {
    key: "provider.maintenance.update.err",
    text: "Failed to update maintenance window",
  },
  PROVIDER_MAINTENANCE_LIST_OK: {
    key: "provider.maintenance.list.ok",
    text: "Fetched providers in maintenance successfully",
  },
  PROVIDER_MAINTENANCE_LIST_ERR: {
    key: "provider.maintenance.list.err",
    text: "Failed to fetch providers in maintenance",
  },
  ROLE_GETALL_OK: {
    key: "role.getall.ok",
    text: "Fetched all roles successfully",
  },
  ROLE_GETALL_ERR: { key: "role.getall.err", text: "Failed to fetch roles" },

  ROLE_GETBYID_OK: {
    key: "role.getbyid.ok",
    text: "Fetched role by ID successfully",
  },
  ROLE_GETBYID_ERR: {
    key: "role.getbyid.err",
    text: "Failed to fetch role by ID",
  },

  ROLE_CREATE_OK: { key: "role.create.ok", text: "Created role successfully" },
  ROLE_CREATE_ERR: { key: "role.create.err", text: "Failed to create role" },

  ROLE_UPDATE_OK: { key: "role.update.ok", text: "Updated role successfully" },
  ROLE_UPDATE_ERR: { key: "role.update.err", text: "Failed to update role" },

  ROLE_DELETE_OK: { key: "role.delete.ok", text: "Deleted role successfully" },
  ROLE_DELETE_ERR: { key: "role.delete.err", text: "Failed to delete role" },
};

module.exports = {
  MSG,
};
