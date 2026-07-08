import { AppRouteProps } from '@components/router/AppRoute';
import PlanGate from '@components/core-components/PlanGate';
import BonusOffersPage from './index';

export const bonusOffersRoutes: AppRouteProps[] = [
  {
    path: 'bonus-offers',
    element: <PlanGate flag='playerBonuses'><BonusOffersPage /></PlanGate>,
  },
];
