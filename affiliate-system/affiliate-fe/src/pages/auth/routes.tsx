import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import AuthLayout from '@components/layout-components/auth-layout';
import LegalLayout from '@components/layout-components/legal-layout';
import { useAppRoutes } from 'hooks/router/useAppRoutes';

import CookiePolicy from '../legal/CookiePolicy';
import PrivacyPolicy from '../legal/PrivacyPolicy';
import TermsAndConditions from '../legal/TermsAndConditions';
import Activate from '../activate';
import Register from '../register';
import ResetPassword from '../reset-password';
import Login from './login';

export default function AuthRoutes() {
  return useAppRoutes([
    {
      // Editorial split-screen shell. All auth-flow pages share this so
      // login / register / reset / activate look like one product.
      path: '/',
      element: (
        <AuthLayout>
          <Outlet />
        </AuthLayout>
      ),
      children: [
        { path: '/',                element: <Login /> },
        { path: 'register',         element: <Register /> },
        { path: 'reset-password',   element: <ResetPassword /> },
        { path: 'activate',         element: <Activate /> },
      ],
    },
    {
      path: '/',
      element: (
        <LegalLayout>
          <Outlet />
        </LegalLayout>
      ),
      children: [
        { path: 'terms-and-conditions', element: <TermsAndConditions /> },
        { path: 'privacy-policy', element: <PrivacyPolicy /> },
        { path: 'cookie-policy', element: <CookiePolicy /> },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ]);
}
