import { AppRouteProps } from '@components/router/AppRoute';
import BonusOffersPage from './index';

export const bonusOffersRoutes: AppRouteProps[] = [
  {
    path: 'bonus-offers',
    element: <BonusOffersPage />,
  },
];
