import { API_BASE_URL } from 'utils/api/apiConfig';

export const COUNTRY_API_URLS = {
  GET_COUNTRIES: (adminId: string) => `${API_BASE_URL}api/countries/${adminId}`,
};
export const PROVIDER_API_URLS = {
  GET_PROVIDERS: () => `${API_BASE_URL}api/providers`,
  AUTO_ENABLE_NEW_GAMES: () => `${API_BASE_URL}api/providers/auto-enable`,
  MAINTENANCE: () => `${API_BASE_URL}api/providers/maintenance`,
};

export const CATEGORIES_API_URLS = {
  GET_CATEGORIES_SELECT: (adminId: string) =>
    `${API_BASE_URL}api/categories/select-categories/${adminId}`,
};
export const MARKETING_CODES_API_URLS = {
  GET_MARKETING_CODES: (adminId: string) => `${API_BASE_URL}api/marketing-codes/${adminId}`,
};

export const CURRENCY_API_URLS = {
  GET_CURRENCY: (adminId: string) => `${API_BASE_URL}api/currencies/${adminId}`,
};

export const REVENUE_SCHEMES_API_URLS = {
  GET_REVENUE_SCHEMES: (adminId: string) => `${API_BASE_URL}api/revenues/${adminId}`,
};

export const LANGUAGES_API_URLS = {
  GET_LANGUAGES: (adminId: string) => `${API_BASE_URL}api/languages/${adminId}`,
};
export const LIMIT_API_URLS = {
  get_by_bet_limits: (adminId: string) => `${API_BASE_URL}api/gameRiskLimits/${adminId}`,
  get_all_limits: () => `${API_BASE_URL}api/generalLimit/all`,
};

export const PLAYERS_API_URLS = {
  GET_PLAYERS: (adminId: string) => `${API_BASE_URL}api/players/${adminId}`,
  GET_PLAYERS_TOTAL_BALANCE: (adminId: string) =>
    `${API_BASE_URL}api/players/total-wallet-balances/${adminId}`,
  GET_PLAYER_BY_ID: (id: string, adminId: string) =>
    `${API_BASE_URL}api/players/getById/${id}/${adminId}`,
  UPDATE_PLAYER: (id = '', adminId: string) => `${API_BASE_URL}api/players/${id}/${adminId}`,
  CHANGE_PLAYER_PASSWORD: (id = '') => `${API_BASE_URL}api/players/${id}/change-password/`,
  GET_PLAYERS_SIMPLE: (adminId: string) => `${API_BASE_URL}api/players/list/simple/${adminId}`,
  BLOCK_PLAYER: (id: string, adminId: string) =>
    `${API_BASE_URL}api/players/${id}/block/${adminId}`,
  UNBLOCK_PLAYER: (id: string, adminId: string) =>
    `${API_BASE_URL}api/players/${id}/unblock/${adminId}`,
};

export const REFERRAL_API_URLS = {
  GET_REFERRED_PLAYERS: (playerId: string) =>
    `${API_BASE_URL}api/referrals/players/${playerId}/referred`,
  UPDATE_PLAYER_OVERRIDE: (playerId: string) =>
    `${API_BASE_URL}api/referrals/players/${playerId}/override`,
  UPDATE_PLAYER_CODE_STATUS: (playerId: string) =>
    `${API_BASE_URL}api/referrals/players/${playerId}/code-status`,
};

export const GAMIFICATION_API_URLS = {
  LEVELS: () => `${API_BASE_URL}api/gamification/levels`,
};

export const PLAYER_NOTIFICATIONS_API_URLS = {
  GET_PLAYER_NOTIFICATIONS: (playerId: string) =>
    `${API_BASE_URL}api/player-notifications/${playerId}`,
  POST_PLAYER_NOTIFICATION: () => `${API_BASE_URL}api/player-notifications`,
  DELETE_PLAYER_NOTIFICATION: (id: string) => `${API_BASE_URL}api/player-notifications/${id}`,
};

export const BONUSES_API_URLS = {
  GET_BONUSES: (adminId: string) => `${API_BASE_URL}api/bonuses/${adminId}`,
};
export const PLAYER_WALLET_API_URLS = {
  GET_ALL_WALLETS: (id: string, adminId: string) =>
    `${API_BASE_URL}api/players/wallet/all/${id}/${adminId}`,
};

export const DEPOSIT_API_URLS = {
  DEPOSIT: (id: string, adminId: string) => ({
    url: `${API_BASE_URL}api/wallets/${id}/deposit/${adminId}`,
  }),
  GENERAL_DEPOSIT: (adminId: string) => ({
    url: `${API_BASE_URL}api/wallet-transactions/general-deposits/${adminId}`,
  }),
};

export const WITHDRAW_API_URLS = {
  WITHDRAW: (id: string, adminId: string) => ({
    url: `${API_BASE_URL}api/wallets/${id}/withdraw/${adminId}`,
  }),
};

export const USERS_API_URLS = {
  GET_USERS: () => `${API_BASE_URL}api/adminusers/`,
  DELETE_USER: (userId: string) => `${API_BASE_URL}api/adminusers/${userId}`,
  RESET_2FA: (userId: string) => `${API_BASE_URL}api/adminusers/reset-2fa/${userId}`,
};

export const ROLES_API_URLS = {
  GET_ROLES: () => `${API_BASE_URL}api/roles/`,
  DELETE_ROLES: (roleId: string) => `${API_BASE_URL}api/roles/${roleId}`,
};

export const NOTIFICATIONS_API_URLS = {
  GET_NOTIFICATIONS: () => `${API_BASE_URL}api/notifications/`,
  DELETE_NOTIFICATION: (notificationId: string) =>
    `${API_BASE_URL}api/notifications/${notificationId}`,
};

export const ADMIN_PREFERENCES_URLS = {
  GET_SHORTCUTS: () => `/adminpreferences/shortcuts`,
};

export const DASHBOARD_API_URLS = {
  GET_LMTD_DATA: (start: string, end: string) =>
    `${API_BASE_URL}api/dashboard/lmtd-data?start=${start}&end=${end}`,
  GET_RANGE_DATA: (start: string, end: string) =>
    `${API_BASE_URL}api/dashboard/range?start=${start}&end=${end}`,
  GET_CASINO_OVERVIEW_DATA: (range: string) =>
    `${API_BASE_URL}api/dashboard/casino-overview?range=${range}`,
  GET_TOP_PROFITABLE_PROVIDERS: (range: string, profitable = true, limit = 5) =>
    `${API_BASE_URL}api/dashboard/top-profitable-providers?range=${range}&profitable=${profitable}&limit=${limit}`,
  GET_TOP_PROFITABLE_GAMES: (range: string, profitable = true, limit = 5) =>
    `${API_BASE_URL}api/dashboard/top-profitable-games?range=${range}&profitable=${profitable}&limit=${limit}`,
  BETTING_STATS: (queryString: string) =>
    `${API_BASE_URL}api/dashboard/betting-stats${queryString ? `?${queryString}` : ''}`,
  BONUS_CONVERSIONS_STATS: (queryString: string) =>
    `${API_BASE_URL}api/dashboard/bonus-conversions${queryString ? `?${queryString}` : ''}`,
  BONUS_KPIS_STATS: (queryString: string) =>
    `${API_BASE_URL}api/dashboard/bonus-kpis${queryString ? `?${queryString}` : ''}`,
  GGR_STATS: (queryString: string) =>
    `${API_BASE_URL}api/dashboard/ggr${queryString ? `?${queryString}` : ''}`,
  TOPN_BETTED_STATS: (queryString: string) =>
    `${API_BASE_URL}api/dashboard/topn-betted${queryString ? `?${queryString}` : ''}`,
  TOPN_PROFITABLE_STATS: (queryString: string) =>
    `${API_BASE_URL}api/dashboard/topn-profitable${queryString ? `?${queryString}` : ''}`,
  TOTAL_BETS_STATS: (queryString: string) =>
    `${API_BASE_URL}api/dashboard/total-bets${queryString ? `?${queryString}` : ''}`,
  TOTAL_WINNINGS_STATS: (queryString: string) =>
    `${API_BASE_URL}api/dashboard/total-winnings${queryString ? `?${queryString}` : ''}`,
  UNIQUE_PLAYER_COUNT_STATS: (queryString: string) =>
    `${API_BASE_URL}api/dashboard/unique-player-count${queryString ? `?${queryString}` : ''}`,
  PLAYER_KPIS_STATS: (queryString: string) =>
    `${API_BASE_URL}api/dashboard/player-kpis${queryString ? `?${queryString}` : ''}`,
  PLAYER_WAGER_STATS: (playerId?: string) =>
    playerId
      ? `${API_BASE_URL}api/dashboard/player-wager/${playerId}`
      : `${API_BASE_URL}api/dashboard/player-wager`,
};

export const LIMITS_API_URLS = {
  GET_LIMITS: () => `${API_BASE_URL}api/gameRiskLimits`,
  UPDATE_FROM_GENERAL: () => `${API_BASE_URL}api/gameRiskLimits/update-from-general`,
  UPDATE_GAME_RISK_LIMIT_PRIORITY: () => `${API_BASE_URL}api/gameRiskLimits/priority`,
  TOGGLE_GAME_RISK_LIMIT: (id: string | number) => `${API_BASE_URL}api/gameRiskLimits/${id}/enable`,
  DELETE_GAME_RISK_LIMIT: (id: string | number) => `${API_BASE_URL}api/gameRiskLimits/${id}`,
  UPDATE_GAME_RISK_LIMIT: (id: string | number) => `${API_BASE_URL}api/gameRiskLimits/${id}`,
};

export const GENERAL_LIMIT_API_URLS = {
  GET_GENERAL_LIMIT: (currency: string, type = 'by_bet') =>
    `${API_BASE_URL}api/generalLimit?currency=${currency}&type=${type}`,
  UPDATE_GENERAL_LIMIT: () => `${API_BASE_URL}api/generalLimit/update-from-general`,
};

export const AUTH_URLS = {
  CHANGE_PASSWORD: () => `${API_BASE_URL}api/auth/change-password`,
  UPDATE_PROFILE: () => `${API_BASE_URL}api/auth/update-profile`,
};

export const NOTE_URLS = {
  BASE: () => `${API_BASE_URL}api/notes`,
  UPDATE: (id: string) => `${API_BASE_URL}api/notes/${id}`,
  DELETE: (id: string) => `${API_BASE_URL}api/notes/${id}`,
};

export const PLAYER_GENERAL_LIMITS_API_URLS = {
  BASE: (playerId?: string) => `${API_BASE_URL}api/playerGeneralLimit/?playerId=${playerId || ''}`,
};

export const PLAYER_GAME_LIMITS_API_URLS = {
  GET_ALL: () => `${API_BASE_URL}api/playerGameLimits`,

  BASE: (playerId?: string) => `${API_BASE_URL}api/playerGameLimits/?playerId=${playerId || ''}`,
  TOGGLE_PLAYER_GAME_LIMIT: (id: string | number) =>
    `${API_BASE_URL}api/playerGameLimits/${id}/enable`,
  DELETE_PLAYER_GAME_LIMIT: (id: string | number) => `${API_BASE_URL}api/playerGameLimits/${id}`,
  UPDATE_GAME_LIMIT_PRIORITY: () => `${API_BASE_URL}api/playerGameLimits/priority`,
  UPDATE_GAME_LIMIT: (id: string | number) => `${API_BASE_URL}api/playerGameLimits/${id}`,
};

export const OUR_CATEGORY_API_URLS = {
  BASE: () => `${API_BASE_URL}api/ourCategories`,
  MULTI_CATEGORY: () => `${API_BASE_URL}api/ourCategories/multi-category`,
  UPDATE_DISPLAY_STATUS: () => `${API_BASE_URL}api/ourCategories/display`,
  DELETE_CATEGORY: (id: string) => `${API_BASE_URL}api/ourCategories/${id}`,
  CATEGORY_DETAIL: (id: string) => `${API_BASE_URL}api/ourCategories/${id}/detail`,
  MULTI_CATEGORY_DETAIL: () => `${API_BASE_URL}api/ourCategories/multi-category/detail`,
  LIST_ALLOWED: () => `${API_BASE_URL}api/ourCategories/list-allowed`,
  REORDER: () => `${API_BASE_URL}api/ourCategories/reorder`,
};

export const RESTRICTIONS_API_URLS = {
  BASE: () => `${API_BASE_URL}api/restrictions`,
  REMOVE: () => `${API_BASE_URL}api/restrictions/remove`,
};

export const BONUS_URLS = {
  TYPES: () => `${API_BASE_URL}api/bonuses/types`,
  DEFINITIONS: () => `${API_BASE_URL}api/bonuses/definitions`,
  DEPOSIT_BONUS: () => `${API_BASE_URL}api/bonuses/definitions/deposit-bonus`,
  PACKAGE_BONUS: () => `${API_BASE_URL}api/bonuses/definitions/package`,
  REMOVE_PACKAGE_DEFINITION: (id: string) => `${API_BASE_URL}api/bonuses/definitions/package/${id}`,
  CASHBACK_BONUS: () => `${API_BASE_URL}api/bonuses/definitions/cashback-bonus`,
  FREESPIN_BONUS: () => `${API_BASE_URL}api/bonuses/definitions/freespin-bonus`,
  WELCOME_BONUS: () => `${API_BASE_URL}api/bonuses/definitions/welcome-bonus`,
  UPDATE_DEFINITION_STATUS: (id: string) =>
    `${API_BASE_URL}api/bonuses/definitions/update-status/${id}`,
  SPIN_OFFERS: () => `${API_BASE_URL}api/bonuses/spin-offers`,
  REMOVE_DEFINITION: (id: string, should_delete_bonus_wallets: boolean) =>
    `${API_BASE_URL}api/bonuses/definitions/${id}?should_delete_bonus_wallets=${should_delete_bonus_wallets}`,
};

export const BONUS_WALLET_URLS = {
  LIST: (playerId: string, type: string) =>
    `${API_BASE_URL}api/bonuses/bonus-wallets/${playerId}?type=${type}`,
  CONVERSIONS: (playerId: string) =>
    `${API_BASE_URL}api/bonuses/bonus-wallets/conversion/${playerId}`,
};

export const BONUS_REPORT_URLS = {
  WALLETS: () => `${API_BASE_URL}api/bonus-reports/wallets`,
  CONVERSIONS: () => `${API_BASE_URL}api/bonus-reports/conversions`,
  WALLETS_BY_PLAYER: () => `${API_BASE_URL}api/bonus-reports/wallets-by-player`,
  WALLETS_BY_TYPE: () => `${API_BASE_URL}api/bonus-reports/wallets-by-type`,
};

export const VIP_CLUB_URLS = {
  LIST: () => `${API_BASE_URL}api/gamification`,
  DELETE: (id: string) => `${API_BASE_URL}api/gamification/${id}`,
  UPDATE: (id: string) => `${API_BASE_URL}api/gamification/${id}`,
  SYNC: () => `${API_BASE_URL}api/gamification/sync`,
};

export const SPORTSBOOK_URLS = {
  BETSLIPS: () => `${API_BASE_URL}api/sportsbook/betslips`,
  BETSLIPS_BY_SPORT: () => `${API_BASE_URL}api/sportsbook/betslips/sport`,
  BETSLIPS_BY_COMPETITION: () => `${API_BASE_URL}api/sportsbook/betslips/competition`,
  COUNTRIES: () => `${API_BASE_URL}api/sportsbook/countries`,
  LEAGUES: () => `${API_BASE_URL}api/sportsbook/leagues`,
  MARKETS: () => `${API_BASE_URL}api/sportsbook/markets`,
  SPORTS: () => `${API_BASE_URL}api/sportsbook/sports`,
};

export const BETSLIP_CONFIGURER_URLS = {
  BET_LIMITS: () => `${API_BASE_URL}api/betslip-configurer/bet-limits`,
  MARKET_LIMITS: () => `${API_BASE_URL}api/betslip-configurer/market-limits`,
};

export const AFFILIATES_API_URLS = {
  LIST:            () => `${API_BASE_URL}api/affiliates`,
  REGISTER:        () => `${API_BASE_URL}api/auth/affiliate-register`,
  CREATE:          () => `${API_BASE_URL}api/affiliates`,
  BULK_CREATE:     () => `${API_BASE_URL}api/affiliates/bulk`,
  ACTIVATE:        () => `${API_BASE_URL}api/auth/activate`,
  SET_PARENT:      (id: string) => `${API_BASE_URL}api/affiliates/${id}/parent`,
  SUB_AFFILIATES:  (id: string) => `${API_BASE_URL}api/affiliates/${id}/sub-affiliates`,
};

export const OPERATOR_API_URLS = {
  GET_INVITE_LINK: () => `${API_BASE_URL}api/operators/invite-link`,
  GET_ME: () => `${API_BASE_URL}api/operators/me`,
  GET_PLAN: () => `${API_BASE_URL}api/operators/plan`,
};

export const REPORTS_API_URLS = {
  OVERVIEW:   () => `${API_BASE_URL}api/reports/overview`,
  AFFILIATES: () => `${API_BASE_URL}api/reports/affiliates`,
  TRAFFIC:    () => `${API_BASE_URL}api/reports/traffic`,
  CAMPAIGNS:  () => `${API_BASE_URL}api/reports/campaigns`,
};

export const BRANDS_API_URLS = {
  LIST:   () => `${API_BASE_URL}api/brands`,
  CREATE: () => `${API_BASE_URL}api/brands`,
  UPDATE: (id: string) => `${API_BASE_URL}api/brands/${id}`,
};

export const FEES_API_URLS = {
  BRANDS: () => `${API_BASE_URL}api/fees/brands`,
  PROVIDER_RATES: () => `${API_BASE_URL}api/fees/provider-rates`,
  PROVIDER_RATES_BULK: () => `${API_BASE_URL}api/fees/provider-rates/bulk`,
  PROVIDER_RATE: (providerId: string) =>
    `${API_BASE_URL}api/fees/provider-rates/${providerId}`,
  SETTINGS: () => `${API_BASE_URL}api/fees/settings`,
  RUN: () => `${API_BASE_URL}api/fees/run`,
};

export const AFFILIATE_PORTAL_API_URLS = {
  OVERVIEW:         () => `${API_BASE_URL}api/affiliate-portal/overview`,
  COMMISSION:       () => `${API_BASE_URL}api/affiliate-portal/commission`,
  PROFILE:          () => `${API_BASE_URL}api/affiliate-portal/profile`,
  SUB_AFFILIATES:   () => `${API_BASE_URL}api/affiliate-portal/sub-affiliates`,
  SUB_PLAN:         (subId: string) => `${API_BASE_URL}api/affiliate-portal/sub-affiliates/${subId}/sub-plan`,
  SUB_PAYOUTS:      () => `${API_BASE_URL}api/affiliate-portal/sub-payouts`,
  CALC_SUB_PAYOUTS: () => `${API_BASE_URL}api/affiliate-portal/sub-payouts/calculate`,
  MARK_SUB_PAYOUT_PAID: (payoutId: string) => `${API_BASE_URL}api/affiliate-portal/sub-payouts/${payoutId}/mark-paid`,
  CAMPAIGN_REPORTS: () => `${API_BASE_URL}api/affiliate-portal/campaign-reports`,
  PLAYERS:          () => `${API_BASE_URL}api/players`,
  PLAYER_DETAIL:    (playerId: string) => `${API_BASE_URL}api/players/detail/${playerId}`,
  REFERRAL_CODES:   () => `${API_BASE_URL}api/affiliate-portal/referral-codes`,
  FEE_DETAILS:      () => `${API_BASE_URL}api/affiliate-portal/fee-details`,
  // Affiliate payout wallet + own history
  PAYOUT_INFO:      () => `${API_BASE_URL}api/affiliate-portal/payout-info`,
  MY_PAYOUTS:       () => `${API_BASE_URL}api/affiliate-portal/payouts`,
};

// Operator-side payout endpoints (operators paying their affiliates)
export const AFFILIATE_PAYOUT_API_URLS = {
  PENDING:        () => `${API_BASE_URL}api/affiliate/payouts/pending`,
  LIST:           () => `${API_BASE_URL}api/affiliate/payouts`,
  CREATE:         () => `${API_BASE_URL}api/affiliate/payouts`,
  DETAIL:         (id: string) => `${API_BASE_URL}api/affiliate/payouts/${id}`,
  DISPATCH:       (id: string) => `${API_BASE_URL}api/affiliate/payouts/${id}/dispatch`,
  CANCEL:         (id: string) => `${API_BASE_URL}api/affiliate/payouts/${id}/cancel`,
  MARK_PAID:      (id: string) => `${API_BASE_URL}api/affiliate/payouts/${id}/mark-paid`,
  SETTINGS:       () => `${API_BASE_URL}api/affiliate/payouts/settings`,
};

export const COMMISSION_API_URLS = {
  PLANS:               () => `${API_BASE_URL}api/commission/plans`,
  PLAN:                (id: string) => `${API_BASE_URL}api/commission/plans/${id}`,
  PLAN_SET_DEFAULT:    (id: string) => `${API_BASE_URL}api/commission/plans/${id}/default`,
  REPORTS:             () => `${API_BASE_URL}api/commission/reports`,
  REPORTS_CALCULATE:   () => `${API_BASE_URL}api/commission/reports/calculate`,
  REPORTS_SUBMIT:      () => `${API_BASE_URL}api/commission/reports/submit`,
  REPORTS_APPROVE:     () => `${API_BASE_URL}api/commission/reports/approve`,
  REPORTS_MARK_PAID:   () => `${API_BASE_URL}api/commission/reports/mark-paid`,
  REPORT_NOTES:        (id: string) => `${API_BASE_URL}api/commission/reports/${id}/notes`,
  AFFILIATE_PLAN:      (affiliateId: string) => `${API_BASE_URL}api/commission/affiliates/${affiliateId}/plan`,
};

export const BILLING_API_URLS = {
  STATUS:            () => `${API_BASE_URL}api/billing`,
  WALLETS:           () => `${API_BASE_URL}api/billing/wallets`,
  PAY:               () => `${API_BASE_URL}api/billing/pay`,
  TRANSACTIONS:      () => `${API_BASE_URL}api/billing/transactions`,
  DISCOUNT_VALIDATE: () => `${API_BASE_URL}api/billing/discount/validate`,
};

export const REFER_API_URLS = {
  CONFIGS:    () => `${API_BASE_URL}api/refer/config`,
  CONFIG:     (brandId: string) => `${API_BASE_URL}api/refer/config/${brandId}`,
  REFERRALS:  () => `${API_BASE_URL}api/refer/referrals`,
  REFERRAL:   (id: string) => `${API_BASE_URL}api/refer/referrals/${id}`,
  DELIVERIES: () => `${API_BASE_URL}api/refer/deliveries`,

  // Crew admin surface
  TOP_REFERRERS:     () => `${API_BASE_URL}api/refer/admin/top-referrers`,
  FRAUD_FLAGGED:     () => `${API_BASE_URL}api/refer/admin/fraud-flagged`,
  REFERRAL_APPROVE:  (id: string) => `${API_BASE_URL}api/refer/admin/referrals/${id}/approve`,
  REFERRAL_REJECT:   (id: string) => `${API_BASE_URL}api/refer/admin/referrals/${id}/reject`,
  REFERRAL_FREEZE:   (id: string) => `${API_BASE_URL}api/refer/admin/referrals/${id}/freeze`,
};

export const AFFILIATE_PLAYERS_API_URLS = {
  LIST:              () => `${API_BASE_URL}api/players`,
  BULK_REGISTER:     () => `${API_BASE_URL}api/integration/player/bulk`,
  AFFILIATES_SELECT: () => `${API_BASE_URL}api/players/affiliates-select`,
};
