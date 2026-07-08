import { AppRouteProps } from '@components/router/AppRoute';
import PlanGate from '@components/core-components/PlanGate';
import CreativesPage from './index';

export const creativesRoutes: AppRouteProps[] = [
  {
    path: 'creatives',
    element: <PlanGate flag='creatives'><CreativesPage /></PlanGate>,
  },
];
