import { AppRouteProps } from '@components/router/AppRoute';
import Reports from './index';
import CampaignReports from './campaigns/index';
import ClicksReport from './clicks/index';
import FraudReport from './fraud/index';
import AffiliateQuality from './affiliate-quality/index';

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
    element: <FraudReport />,
  },
  {
    path: 'reports/affiliate-quality',
    element: <AffiliateQuality />,
  },
];
