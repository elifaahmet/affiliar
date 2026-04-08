export interface Currency {
  symbol: string;
  shortCut: string;
  code: string;
  fixedValueCount: number;
  total: number;
  _id: string;
}

export interface Wallet {
  walletCategory: string;
  _id: string;
  playerId: string;
  currency: Currency;
  total: any;
  id: number;
}
export interface Game {
  category: string;
  game_code: string;
  id: string;
  game_name: string;
  provider: string;
  status: string;
  url_thumb: string;
  _id: string;
  isPlaceholder?: boolean;
  priority?: number;
  admin_allowed?: boolean;
  deleted?: number;
  our_category?: { id: string; name: string }[];
  [key: string]: unknown;
}
export interface Categories {
  label: string;
  value: string;
}
export interface Player {
  username: string;
  email: string;
  expiryDate: string;
  isValidated: boolean;
  isRegistered: boolean;
  languageId: string | null;
  addressLine: string;
  addressLine2: string;
  registerDate: string;
  name: string;
  surname: string;
  postalCode: string;
  soundNotification: boolean;
  excludedFromRevenue: boolean;
  location: string;
  brand: string;
  verifyLevel: number;
  countryId: string | null;
  landline: string;
  acceptedTerms: boolean;
  marketingCodeId: string;
  revenueId: string;
  isValidate: boolean;
  wallet: Wallet[];
  id: string;
  referralNumber: string;
  verify1: any;
  createdAt: string;
  isTest: boolean;
  isPortBlocked: boolean;
  isCasinoBlocked: boolean;
  isBlocked?: boolean;
  blockedAt?: string | null;
  blockedBy?: string | null;
  blockReason?: string | null;
  acquisitionSourceType?: 'admin_affiliate' | 'player_referral' | null;
  acquisitionSourceLabel?: string;
  affiliateAdminUserId?: string | null;
  affiliateAdminUser?: {
    _id: string;
    id?: number;
    username?: string;
    email?: string;
  } | null;
  referredByPlayerId?: string | null;
  referredByPlayer?: {
    _id: string;
    id?: number;
    username?: string;
    email?: string;
    referralCode?: string;
  } | null;
  referralCode?: string | null;
  isReferralCodeActive?: boolean;
  referralCodeCreatedAt?: string | null;
  referralCodeUsed?: string | null;
  referralRewardPercent?: number | null;
  lastLogin: Date | null;
  _id: string;
}
