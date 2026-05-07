export interface Brand {
  _id: string;
  name: string;
  url?: string | null;
  enabled?: boolean;
}

export interface BrandsResponse {
  brands?: Brand[];
}

export interface RewardConfig {
  type: 'fixed_bonus' | 'percent_of_first_deposit';
  amountCents: number;
  percent: number;
  capCents: number | null;
  currency: string;
  rewardKind: 'bonus' | 'cash' | 'freespins';
}

export interface QualificationGates {
  minDepositCents: number;
  holdDays: number;
  minWagerCents: number;
  minWagerMultiple: number;
}

export interface CapsConfig {
  perReferrerMonthlyCents: number;
  perBrandMonthlyCents: number;
}

export interface WebhookConfig {
  url: string | null;
  enabled: boolean;
  secretPresent?: boolean;
  secretRotatedAt?: string | null;
}

export interface ReferConfig {
  _id?: string;
  brandId: string;
  enabled: boolean;
  reward: RewardConfig;
  qualification: QualificationGates;
  caps: CapsConfig;
  webhook: WebhookConfig;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConfigsResponse {
  configs: ReferConfig[];
}

export type ReferralStatus =
  | 'pending_ftd'
  | 'pending_qualification'
  | 'qualified'
  | 'rewarded'
  | 'reversed'
  | 'rejected';

export interface PlayerReferral {
  _id: string;
  brandId: string;
  operatorId: string;
  referrerPlayerId: string;
  refereePlayerId: string;
  refCode: string | null;
  status: ReferralStatus;
  rejectionReason: string | null;
  signedUpAt: string | null;
  ftdAt: string | null;
  qualifiedAt: string | null;
  rewardedAt: string | null;
  reversedAt: string | null;
  ftdCents: number | null;
  ftdCurrency: string | null;
  rewardCents: number | null;
  rewardCurrency: string | null;
  reversedAmountCents: number | null;
  reversalReason: string | null;
  createdAt: string;
}

export interface ReferralsResponse {
  referrals: PlayerReferral[];
  count: number;
}

export type DeliveryEventType =
  | 'referral.reward.issued'
  | 'referral.reward.reversed';

export type DeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface RewardDelivery {
  _id: string;
  referralId: string | null;
  brandId: string;
  eventType: DeliveryEventType;
  status: DeliveryStatus;
  attempts: number;
  payload: Record<string, unknown>;
  payloadHash: string;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  lastResponse: {
    statusCode: number | null;
    bodySnippet: string | null;
    latencyMs: number | null;
    errorMessage: string | null;
    attemptedAt: string | null;
  } | null;
  attemptHistory: Array<{
    attemptedAt: string;
    statusCode: number | null;
    bodySnippet: string | null;
    latencyMs: number | null;
    errorMessage: string | null;
  }>;
  replayOf: string | null;
  createdAt: string;
}

export interface DeliveriesResponse {
  deliveries: RewardDelivery[];
  count: number;
}

export interface ReferralDetailResponse {
  referral: PlayerReferral;
  deliveries: RewardDelivery[];
}
