// TypeScript type definitions for the Kafka event contract.
// This file is for IDE support only — the runtime uses Zod (schema.js).

export type AffiliateCasinoActivityAggregatedEventType =
  "affiliate.casino.activity.aggregated.v1";

export type PeriodGranularity = "hour" | "day";

export interface AffiliateCasinoAggregatedMetrics {
  registrations: number;

  ftdCount: number;
  ftdSumCents: number;

  depositsCount: number;
  depositsSumCents: number;

  cashoutsCount: number;
  cashoutsSumCents: number;

  chargebacksCount: number;
  chargebacksSumCents: number;

  betsSumCents: number;
  winsSumCents: number;

  casinoBetsRollbacksSumCents: number;
  casinoWinsRollbacksSumCents: number;

  bonusIssuesSumCents: number;
  additionalDeductionsSumCents: number;
  paymentSystemFeesSumCents: number;
  jackpotFeesSumCents: number;
  gameProviderFeesSumCents: number;
  casinoTaxesSumCents: number;

  roundsCount: number;
  wagerCents: number;

  casinoGgrCents?: number;
  casinoNgrCents?: number;
}

export interface AffiliateCasinoActivityAggregatedEvent {
  eventId: string;
  eventType: AffiliateCasinoActivityAggregatedEventType;
  eventVersion: 1;

  tenantId: string;
  operatorId?: string;
  brandId: string;

  period: {
    from: string; // ISO UTC
    to: string;   // ISO UTC
    granularity: PeriodGranularity;
  };

  player: {
    playerId: string;
    currency: string;
    country?: string;
  };

  affiliate?: {
    affiliateId?: string;
    affiliateCode?: string;
    campaign?: string;
    subId?: string;
  };

  metrics: AffiliateCasinoAggregatedMetrics;

  playerStatuses?: {
    isDuplicate?: boolean;
    isDisabled?: boolean;
    isSelfExcluded?: boolean;
    isVerified?: boolean;
  };

  source: {
    system: string;
    traceId?: string;
    producedAt: string; // ISO UTC
  };
}

// Inbox document stored in MongoDB for audit
export interface AggregatedEventInboxDoc {
  _id: import("mongodb").ObjectId;
  eventId: string;
  eventType: string;
  tenantId: string;
  brandId: string;
  payload: AffiliateCasinoActivityAggregatedEvent;
  receivedAt: Date;
  processingStatus: "pending" | "processed" | "failed";
  errorMessage?: string;
}

// Canonical operational model stored in MongoDB
export interface ActivityHourlyDoc {
  tenantId: string;
  brandId: string;
  operatorId: string;
  from: Date;
  to: Date;
  granularity: PeriodGranularity;
  playerId: string;
  currency: string;
  country: string;
  affiliateId: string;
  affiliateCode: string;
  campaign: string;
  subId: string;
  metrics: AffiliateCasinoAggregatedMetrics & {
    computedGgrCents: number;
    computedNgrCents: number;
    ggrMismatch: boolean;
    ngrMismatch: boolean;
  };
  playerStatuses: {
    isDuplicate: boolean;
    isDisabled: boolean;
    isSelfExcluded: boolean;
    isVerified: boolean;
  };
  sourceEventId: string;
  sourceSystem: string;
  sourceProducedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
