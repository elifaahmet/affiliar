import { AppRoute } from './AppRoute';

//wrapping routes component with children and props to pass down to children
export const AppRoutes = ({ children, ...props }: any) => {
  return <AppRoute {...props}>{children}</AppRoute>;
};
