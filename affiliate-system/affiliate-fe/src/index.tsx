import './utils/locales/i18n';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { TimezoneProvider } from './context/TimezoneContext';
import App from './App';
import store from './store';
import queryClient from './config/queryClient';

import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

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
