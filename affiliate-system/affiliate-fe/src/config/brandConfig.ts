export type BrandKey =
  | 'default'
  | 'pixupplay-staging'
  | 'betroxy'
  | 'ruinbet'
  | 'betamericano'
  | 'star'
  | 'tokyospins'
  | 'strangerbets'
  | 'cryptocartel'
  | 'betofthrones';

type CustomerConfig = {
  skipAadhaarVerification?: boolean;
  enableAadhaarVerification?: boolean;
};

type FeatureToggles = {
  hiddenShortcuts?: string[];
  hiddenWidgets?: string[];
  hiddenLiveStatTypes?: string[];
  hiddenTabs?: string[];
  playerHiddenParts?: string[];
  hiddenFinancialColumns?: string[];
  hideNonFunctional?: boolean;
  hideCustomBonus?: boolean;
  paymentMethods?: string[];
};

export type BrandConfig = {
  title: string;
  description: string;
  favicon: string;
  mainLogo: string;
  mainLogoText: string;
  features?: FeatureToggles;
  customer?: CustomerConfig;
};

const BRAND_DEFINITIONS: Record<BrandKey, BrandConfig> = {
  default: {
    title: 'Affiliar',
    description: 'Affiliar',
    favicon: 'favicon-affiliar.svg',
    mainLogo: 'defaultSmall',
    mainLogoText: 'defaultLogoWhite',
  },
  'pixupplay-staging': {
    title: 'Pixup Dashboard',
    description: 'Pixup Admin Dashboard',
    favicon: 'favicon-pixupplay.ico',
    mainLogo: 'pixupLogo',
    mainLogoText: 'pixupLogoText',
    features: {
      paymentMethods: ['payzeasy', 'sans-getirsin'],
    },
  },
  betroxy: {
    title: 'Betroxy Dashboard',
    description: 'Betroxy Admin Dashboard',
    favicon: 'favicon-roxy.ico',
    mainLogo: 'betroxySmall',
    mainLogoText: 'betroxy',
    features: {
      hideCustomBonus: true,
      hideNonFunctional: true,
      hiddenShortcuts: ['SPORTSBOOK_REPORTS', 'EXCHANGE_REPORT'],
      hiddenWidgets: [
        'sportsbookOverview',
        'bettingInsights',
        'popularSports',
        'liveStats',
        'profitTable',
        'dailyRakeChart',
        'barChart',
        'pokerOverview',
        'activityCard1',
        'activityCard2',
        'depositWithdrawCard',
      ],
      hiddenTabs: [
        'player-group',
        'sportsbook',
        'exchange',
        'payment',
        'account-balance',
        'balance',
        'sportsbook-management',
        'exchange-management',
        'payment-management',
      ],
      playerHiddenParts: [
        'bonus',
        'privacy-info',
        'betting',
        'activity',
        'sportsbook-limits',
        'exchange-limits',
        'restrictions',
        'players-widgets',
        'bettingInsights',
        'financialInsights',
        'pieChart',
        'playerActivities',
      ],
      hiddenFinancialColumns: ['network', 'cryptoCurrency', 'tx_hash'],
      paymentMethods: ['payzeasy'],
    },
  },
  ruinbet: {
    title: 'Ruinbet Dashboard',
    description: 'Ruinbet Admin Dashboard',
    favicon: 'favicon-ruinbet.ico',
    mainLogo: 'ruinbetShort',
    mainLogoText: 'ruinbetLogo',
    features: {
      hiddenShortcuts: ['SPORTSBOOK_REPORTS', 'EXCHANGE_REPORT'],
      hiddenWidgets: ['sportsbookOverview', 'bettingInsights', 'popularSports'],
      hiddenLiveStatTypes: ['Sportsbook', 'Exchange'],
      hideCustomBonus: true,
    },
    customer: {
      skipAadhaarVerification: true,
    },
  },
  betamericano: {
    title: 'Betamericano Dashboard',
    description: 'Betamericano Admin Dashboard',
    favicon: 'favicon-betamericano.ico',
    mainLogo: 'betamericanoShort',
    mainLogoText: 'betamericanoLogo',
    features: {
      hideNonFunctional: true,
      hideCustomBonus: true,
      hiddenShortcuts: ['SPORTSBOOK_REPORTS', 'EXCHANGE_REPORT'],
      hiddenWidgets: [
        'sportsbookOverview',
        'bettingInsights',
        'popularSports',
        'liveStats',
        'profitTable',
        'dailyRakeChart',
        'barChart',
        'pokerOverview',
        'activityCard1',
        'activityCard2',
        'depositWithdrawCard',
      ],
      hiddenTabs: [
        'player-group',
        'sportsbook',
        'exchange',
        'payment',
        'account-balance',
        'balance',
        'sportsbook-management',
        'exchange-management',
        'payment-management',
      ],
      playerHiddenParts: [
        'bonus',
        'privacy-info',
        'betting',
        'balance',
        'activity',
        'sportsbook-limits',
        'exchange-limits',
        'restrictions',
        'players-widgets',
        'bettingInsights',
        'financialInsights',
        'pieChart',
        'playerActivities',
      ],
      hiddenLiveStatTypes: ['Sportsbook', 'Exchange'],
      paymentMethods: ['sans-getirsin'],
    },
    customer: {
      skipAadhaarVerification: true,
    },
  },
  star: {
    title: 'The Star Dashboard',
    description: 'The Star Admin Dashboard',
    favicon: 'favicon-star.ico',
    mainLogo: 'theStarSolo',
    mainLogoText: 'whiteStar',
  },
  tokyospins: {
    title: 'Tokyospins Dashboard',
    description: 'Tokyospins Admin Dashboard',
    favicon: 'favicon-tokyospins.ico',
    mainLogo: 'tokyospinsShort',
    mainLogoText: 'tokyospinsLogo',
    features: {
      paymentMethods: ['sans-getirsin'],
      hideNonFunctional: true,
      hideCustomBonus: true,
      hiddenShortcuts: ['SPORTSBOOK_REPORTS', 'EXCHANGE_REPORT'],
      hiddenWidgets: [
        'sportsbookOverview',
        'bettingInsights',
        'popularSports',
        'liveStats',
        'profitTable',
        'dailyRakeChart',
        'barChart',
        'pokerOverview',
        'activityCard1',
        'activityCard2',
        'depositWithdrawCard',
      ],
      hiddenTabs: [
        'player-group',
        'sportsbook',
        'exchange',
        'payment',
        'account-balance',
        'balance',
        'sportsbook-management',
        'exchange-management',
        'payment-management',
      ],
      playerHiddenParts: [
        'privacy-info',
        'betting',
        'balance',
        'activity',
        'sportsbook-limits',
        'exchange-limits',
        'restrictions',
        'players-widgets',
        'bettingInsights',
        'financialInsights',
        'pieChart',
        'playerActivities',
      ],
      hiddenLiveStatTypes: ['Sportsbook', 'Exchange'],
    },
    customer: {
      skipAadhaarVerification: true,
    },
  },
  strangerbets: {
    title: 'Strangerbets Dashboard',
    description: 'Strangerbets Admin Dashboard',
    favicon: 'favicon-strangerbets.ico',
    mainLogo: 'strangerbetsShort',
    mainLogoText: 'strangerbetsLogo',
    features: {
      paymentMethods: ['sans-getirsin'],
      hideNonFunctional: true,
      hideCustomBonus: true,
      hiddenShortcuts: ['SPORTSBOOK_REPORTS', 'EXCHANGE_REPORT'],
      hiddenWidgets: [
        'sportsbookOverview',
        'bettingInsights',
        'popularSports',
        'liveStats',
        'profitTable',
        'dailyRakeChart',
        'barChart',
        'pokerOverview',
        'activityCard1',
        'activityCard2',
        'depositWithdrawCard',
      ],
      hiddenTabs: [
        'player-group',
        'sportsbook',
        'exchange',
        'payment',
        'account-balance',
        'balance',
        'sportsbook-management',
        'exchange-management',
        'payment-management',
      ],
      playerHiddenParts: [
        'privacy-info',
        'betting',
        'balance',
        'activity',
        'sportsbook-limits',
        'exchange-limits',
        'restrictions',
        'players-widgets',
        'bettingInsights',
        'financialInsights',
        'pieChart',
        'playerActivities',
      ],
      hiddenLiveStatTypes: ['Sportsbook', 'Exchange'],
    },
    customer: {
      skipAadhaarVerification: true,
    },
  },
  cryptocartel: {
    title: 'Cryptocartel Dashboard',
    description: 'Cryptocartel Admin Dashboard',
    favicon: 'favicon-cryptocartel.ico',
    mainLogo: 'cryptocartelShort',
    mainLogoText: 'cryptocartelLogo',
    features: {
      paymentMethods: ['sans-getirsin'],
      hideNonFunctional: true,
      hideCustomBonus: true,
      hiddenShortcuts: ['SPORTSBOOK_REPORTS', 'EXCHANGE_REPORT'],
      hiddenWidgets: [
        'sportsbookOverview',
        'bettingInsights',
        'popularSports',
        'liveStats',
        'profitTable',
        'dailyRakeChart',
        'barChart',
        'pokerOverview',
        'activityCard1',
        'activityCard2',
        'depositWithdrawCard',
      ],
      hiddenTabs: [
        'player-group',
        'sportsbook',
        'exchange',
        'payment',
        'account-balance',
        'balance',
        'sportsbook-management',
        'exchange-management',
        'payment-management',
      ],
      playerHiddenParts: [
        'privacy-info',
        'betting',
        'balance',
        'activity',
        'sportsbook-limits',
        'exchange-limits',
        'restrictions',
        'players-widgets',
        'bettingInsights',
        'financialInsights',
        'pieChart',
        'playerActivities',
      ],
      hiddenLiveStatTypes: ['Sportsbook', 'Exchange'],
    },
    customer: {
      skipAadhaarVerification: true,
    },
  },
  betofthrones: {
    title: 'Betofthrones Dashboard',
    description: 'Betofthrones Admin Dashboard',
    favicon: 'favicon-betofthrones.ico',
    mainLogo: 'betofthronesShort',
    mainLogoText: 'betofthronesLogo',
    features: {
      paymentMethods: ['sans-getirsin'],
      hideNonFunctional: true,
      hideCustomBonus: true,
      hiddenShortcuts: ['SPORTSBOOK_REPORTS', 'EXCHANGE_REPORT'],
      hiddenWidgets: [
        'sportsbookOverview',
        'bettingInsights',
        'popularSports',
        'liveStats',
        'profitTable',
        'dailyRakeChart',
        'barChart',
        'pokerOverview',
        'activityCard1',
        'activityCard2',
        'depositWithdrawCard',
      ],
      hiddenTabs: [
        'player-group',
        'sportsbook',
        'exchange',
        'payment',
        'account-balance',
        'balance',
        'sportsbook-management',
        'exchange-management',
        'payment-management',
      ],
      playerHiddenParts: [
        'privacy-info',
        'betting',
        'balance',
        'activity',
        'sportsbook-limits',
        'exchange-limits',
        'restrictions',
        'players-widgets',
        'bettingInsights',
        'financialInsights',
        'pieChart',
        'playerActivities',
      ],
      hiddenLiveStatTypes: ['Sportsbook', 'Exchange'],
    },
    customer: {
      skipAadhaarVerification: true,
    },
  },
};

const brandConfigMap: Array<[BrandKey, BrandConfig]> = Object.entries(BRAND_DEFINITIONS) as Array<
  [BrandKey, BrandConfig]
>;

const DEFAULT_BRAND: BrandKey = 'default';

const envBrand = process.env.REACT_APP_BRAND?.toLowerCase?.().trim() || '';

const brandEntry = envBrand ? brandConfigMap.find(([key]) => key === envBrand) : undefined;

const resolvedBrand: BrandKey = brandEntry?.[0] ?? DEFAULT_BRAND;
const resolvedConfig: BrandConfig = brandEntry?.[1] ?? BRAND_DEFINITIONS[DEFAULT_BRAND];

const DEFAULT_CUSTOMER_CONFIG: CustomerConfig = {
  enableAadhaarVerification: true,
};

export const getBrandKey = (): BrandKey => resolvedBrand;

export const getBrandingConfig = (): {
  brand: BrandKey;
  config: BrandConfig;
} => ({ brand: resolvedBrand, config: resolvedConfig });

export const getHiddenShortcuts = (): string[] => resolvedConfig.features?.hiddenShortcuts ?? [];

export const getHiddenWidgets = (): string[] => resolvedConfig.features?.hiddenWidgets ?? [];

export const getHiddenTabs = (): string[] => resolvedConfig.features?.hiddenTabs ?? [];

export const getPlayerHiddenParts = (): string[] =>
  resolvedConfig.features?.playerHiddenParts ?? [];

export const getHiddenFinancialColumns = (): string[] =>
  resolvedConfig.features?.hiddenFinancialColumns ?? [];

export const getCustomerConfig = (): CustomerConfig =>
  resolvedConfig.customer ?? DEFAULT_CUSTOMER_CONFIG;

export const getPaymentMethods = (): string[] => resolvedConfig.features?.paymentMethods ?? [];

export default resolvedConfig;
