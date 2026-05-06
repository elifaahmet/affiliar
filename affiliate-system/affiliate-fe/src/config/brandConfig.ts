// Slim brand config. Affiliar is the only brand this codebase serves —
// the multi-tenant brand machinery from the admin-system clone isn't
// useful here. We keep the public API surface (getBrandingConfig,
// getPlayerHiddenParts, etc.) so existing call sites don't need to
// change; they just always read the Affiliar defaults now.

export type FeatureToggles = {
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

export type CustomerConfig = {
  skipAadhaarVerification?: boolean;
  enableAadhaarVerification?: boolean;
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

export type BrandKey = 'default';

const AFFILIAR_CONFIG: BrandConfig = {
  title: 'Affiliar',
  description: 'Affiliar — Affiliate Management Platform',
  favicon: 'favicon-affiliar.svg',
  mainLogo: 'defaultSmall',
  mainLogoText: 'defaultLogoWhite',
};

const DEFAULT_CUSTOMER_CONFIG: CustomerConfig = {
  enableAadhaarVerification: true,
};

export const getBrandKey = (): BrandKey => 'default';

export const getBrandingConfig = (): { brand: BrandKey; config: BrandConfig } => ({
  brand: 'default',
  config: AFFILIAR_CONFIG,
});

export const getHiddenShortcuts = (): string[] =>
  AFFILIAR_CONFIG.features?.hiddenShortcuts ?? [];

export const getHiddenWidgets = (): string[] =>
  AFFILIAR_CONFIG.features?.hiddenWidgets ?? [];

export const getHiddenTabs = (): string[] =>
  AFFILIAR_CONFIG.features?.hiddenTabs ?? [];

export const getPlayerHiddenParts = (): string[] =>
  AFFILIAR_CONFIG.features?.playerHiddenParts ?? [];

export const getHiddenFinancialColumns = (): string[] =>
  AFFILIAR_CONFIG.features?.hiddenFinancialColumns ?? [];

export const getCustomerConfig = (): CustomerConfig =>
  AFFILIAR_CONFIG.customer ?? DEFAULT_CUSTOMER_CONFIG;
