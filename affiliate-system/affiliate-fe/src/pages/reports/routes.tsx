import { AppRouteProps } from '@components/router/AppRoute';
import PlanGate from '@components/core-components/PlanGate';
import Reports from './index';
import CampaignReports from './campaigns/index';
import ClicksReport from './clicks/index';
import FraudReport from './fraud/index';
import AffiliateQuality from './affiliate-quality/index';
import CohortsReport from './cohorts/index';

export const reportsRoutes: AppRouteProps[] = [
  {
    path: 'reports',
    element: <Reports />,
  },
  {
    path: 'reports/campaigns',
    element: <CampaignReports />,
  },
  {
    path: 'reports/clicks',
    element: <ClicksReport />,
  },
  {
    path: 'reports/fraud',
    element: <PlanGate flag='antiAbuse'><FraudReport /></PlanGate>,
  },
  {
    path: 'reports/affiliate-quality',
    element: <PlanGate flag='advancedReports'><AffiliateQuality /></PlanGate>,
  },
  {
    path: 'reports/cohorts',
    element: <PlanGate flag='advancedReports'><CohortsReport /></PlanGate>,
  },
];
