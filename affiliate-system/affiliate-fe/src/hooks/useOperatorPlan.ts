import { useBaseQuery } from 'api/core/useBaseQuery';
import { OPERATOR_API_URLS } from 'config/apiUrls';

/**
 * Shape of the /operators/plan response — mirrors planLimits.js PLANS.
 * `limits` is the entry for the operator's current plan (tier1..pro) so
 * any UI surface that needs to hide / disable a feature on lower tiers
 * can `const { limits } = useOperatorPlan()` and check `limits.kycGate`,
 * `limits.bulkImport`, etc.
 */
export interface OperatorPlanLimits {
  name: string;
  priceUsd: number;
  maxAffiliates: number;
  maxBrands: number;
  commissionTypes: string[];
  subAffiliates: boolean;
  campaignTracking: boolean;
  referAFriend: boolean;
  bulkImport: boolean;
  customFees: boolean;
  kycGate: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
  coManaged: boolean;
  playerBonuses: boolean;
  creatives: boolean;
}

export interface OperatorPlanResponse {
  plan: string;            // canonical key: tier1 | tier2 | plus | plusL2 | pro
  limits: OperatorPlanLimits;
}

export function useOperatorPlan() {
  const { data, isLoading } = useBaseQuery<OperatorPlanResponse>({
    endpoint: OPERATOR_API_URLS.GET_PLAN(),
    queryKey: ['operator-plan'],
  });
  return {
    isLoading,
    plan: data?.plan ?? null,
    limits: data?.limits ?? null,
  };
}
