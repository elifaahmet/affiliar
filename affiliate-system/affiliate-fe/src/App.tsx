import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Loader from '@components/core-components/loader';
import { getBrandingConfig } from 'config/brandConfig';
import { useAppDispatch, useAppSelector } from 'hooks/redux';
import AuthRoutes from 'pages/auth/routes';
import { checkAuthStatus } from 'store/auth/authenticationSlice';
import { setCurrencies } from 'store/sharedData/sharedDataSlice';
import { currencySymbolMap } from 'utils/common/currencyUtils';

import Router from './pages/routes';

function App() {
  const {
    config: { title, description, favicon },
  } = getBrandingConfig();
  const dispatch = useAppDispatch();
  const { isAuthenticated, loading } = useAppSelector((state) => state.auth);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    dispatch(checkAuthStatus()).finally(() => setAuthChecked(true));
  }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated) {
      dispatch(setCurrencies(currencySymbolMap));
    }
  }, [dispatch, isAuthenticated]);

  if (!authChecked || loading) {
    return <Loader />;
  }

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name='description' content={description} />
        <link rel='icon' href={`/${favicon}`} />
      </Helmet>
      <div className='relative'>{isAuthenticated ? <Router /> : <AuthRoutes />}</div>
    </>
  );
}

export default App;
