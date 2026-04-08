import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface TabState {
  playerDetails: string;
  management: string;
}

const initialState: TabState = {
  playerDetails: 'overview',
  management: 'casino-management',
};

const tabSlice = createSlice({
  name: 'tab',
  initialState,
  reducers: {
    setPlayerDetailsTab(state, action: PayloadAction<string>) {
      state.playerDetails = action.payload;
    },
    setManagementTab(state, action: PayloadAction<string>) {
      state.management = action.payload;
    },
  },
});

export const { setPlayerDetailsTab, setManagementTab } = tabSlice.actions;

export default tabSlice.reducer;
