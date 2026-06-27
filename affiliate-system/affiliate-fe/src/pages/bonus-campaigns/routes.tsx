import { AppRouteProps } from '@components/router/AppRoute';
import BonusCampaignsPage from './index';

export const bonusCampaignsRoutes: AppRouteProps[] = [
  {
    path: 'bonus-campaigns',
    element: <BonusCampaignsPage />,
  },
];
