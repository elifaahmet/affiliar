import { AppRouteProps } from '@components/router/AppRoute';
import Reports from './index';
import CampaignReports from './campaigns/index';
import ClicksReport from './clicks/index';

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
];
