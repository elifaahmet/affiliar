import { combineReducers } from '@reduxjs/toolkit';

import authReducer from '../store/auth/authenticationSlice';
import sharedDataReducer from '../store/sharedData/sharedDataSlice';
import tabReducer from '../store/tabSlice/tabSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  sharedData: sharedDataReducer,
  tab: tabReducer,
});

export default rootReducer;
