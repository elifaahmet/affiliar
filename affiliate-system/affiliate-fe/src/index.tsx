import './utils/locales/i18n';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TimezoneProvider } from './context/TimezoneContext';
import App from './App';
import store from './store';

import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: false,
    },
  },
});

root.render(
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <TimezoneProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </TimezoneProvider>
      </Provider>
    </QueryClientProvider>
  </HelmetProvider>
);
