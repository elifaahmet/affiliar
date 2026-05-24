export interface Brand {
  _id: string;
  name: string;
  url?: string | null;
  enabled?: boolean;
}

export interface BrandsResponse {
  brands?: Brand[];
}

export interface CrewLevel {
  activeReferrals: number;
  percent: number;
}

export interface RewardConfig {
  type: 'fixed_bonus' | 'percent_of_first_deposit' | 'crew_tiered';
  amountCents: number;
  percent: number;
  capCents: number | null;
  // crew_tiered: tier table + monthly base + per-month cap
  crewLevels?: CrewLevel[];
  crewMetric?: 'ngr' | 'ggr';
  crewMonthlyCapCents?: number | null;
  currency: string;
  rewardKind: 'bonus' | 'cash' | 'freespins';
}

// Phase 2 two-sided rewards. Same shape as RewardConfig minus currency
// (currency is inherited from the referrer reward), plus an enabled
// toggle so operators can opt in without changing other fields.
export interface RefereeRewardConfig {
  enabled: boolean;
  type: 'fixed_bonus' | 'percent_of_first_deposit';
  amountCents: number;
  percent: number;
  capCents: number | null;
  rewardKind: 'bonus' | 'cash' | 'freespins';
}

// Phase 2 Step 4 recurring rewards: % of friend's monthly NGR/GGR for
// the referrer, optionally bounded by a fixed number of months.
export interface RecurringRewardConfig {
  enabled: boolean;
  percent: number;
  ngrMetric: 'ngr' | 'ggr';
  durationMonths: number | null;   // null = forever
  monthlyCapCents: number | null;  // null = no cap
  rewardKind: 'cash' | 'bonus' | 'freespins';
}

export interface QualificationGates {
  minDepositCents: number;
  holdDays: number;
  minWagerCents: number;
  minWagerMultiple: number;
  // Crew "active player" gates (V1.5)
  minActiveDeposits: number;     // deposit *count* (not amount). 0 = off.
  minAccountAgeDays: number;     // days between AffiliatePlayer.registeredAt and now. 0 = off.
  requirePositiveNgr: boolean;   // referee's lifetime NGR must be > 0
  blockSameSignals: boolean;     // reject signup if ipHash/deviceHash/walletHash matches another account
}

export interface CapsConfig {
  perReferrerMonthlyCents: number;
  perBrandMonthlyCents: number;
}

export interface ReferConfig {
  _id?: string;
  brandId: string;
  enabled: boolean;
  reward: RewardConfig;
  refereeReward: RefereeRewardConfig;
  recurringReward: RecurringRewardConfig;
  qualification: QualificationGates;
  caps: CapsConfig;
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
  refereeRewardCents: number | null;
  refereeRewardCurrency: string | null;
  refereeRewardedAt: string | null;
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
  | 'referral.reward.reversed'
  | 'referral.reward.referee.issued'
  | 'referral.reward.referee.reversed'
  | 'referral.reward.recurring.issued';

export type DeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface RewardDeliveryPayloadData {
  brandId?: string;
  referralId?: string;
  referrerPlayerId?: string;
  refereePlayerId?: string;
  rewardCents?: number;
  rewardCurrency?: string;
  rewardKind?: 'bonus' | 'cash' | 'freespins';
  qualifiedAt?: string;
  reversedAt?: string;
  reversalReason?: string;
  period?: { year: number; month: number };
  ngrCents?: number;
}

export interface RewardDelivery {
  _id: string;
  referralId: string | null;
  brandId: string;
  eventType: DeliveryEventType;
  status: DeliveryStatus;
  attempts: number;
  payload: {
    id?: string;
    type?: string;
    createdAt?: string;
    data?: RewardDeliveryPayloadData;
  };
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

// ── Crew admin ──────────────────────────────────────────────────────────────

export interface TopReferrerRow {
  referrerPlayerId: string;
  totalReferrals: number;
  activeReferrals: number;
  pendingReferrals: number;
  earningsCents: number;
  lastActivityAt: string | null;
}

export interface TopReferrersResponse {
  referrers: TopReferrerRow[];
  count: number;
}

export interface FraudFlaggedRow {
  _id: string;
  playerId: string;
  brandId: string;
  lastFraudFlag: string | null;
  lastFraudFlagAt: string | null;
  registeredAt: string | null;
  country: string | null;
}

export interface FraudFlaggedResponse {
  players: FraudFlaggedRow[];
  count: number;
}
