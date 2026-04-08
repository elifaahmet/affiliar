import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { getSupportedCurrencyOptions } from 'utils/common/currencyUtils';

import api from '../../api/index';

import { Categories, Game, Player, Wallet } from './types';
interface SharedDataState {
  games: Game[];
  categories: Categories[];
  providers: any[];
  unfilteredProviders: any[];
  limits: any[];
  currencies: Record<string, string>;
  allWallets: Wallet[];
  player: Player | null;
  loading: boolean;
  currencySelectArray: {
    label: string;
    value: string;
  }[];
  error: string | null;
}
const currencySelectArrayData = getSupportedCurrencyOptions();
const initialState: SharedDataState = {
  games: [],
  categories: [],
  providers: [],
  limits: [],
  unfilteredProviders: [],
  currencies: {},
  currencySelectArray: currencySelectArrayData,
  allWallets: [],
  player: null,
  loading: false,
  error: null,
};

export const fetchSharedData = createAsyncThunk(
  'sharedData/fetchAll',
  async (adminId: string, { rejectWithValue }) => {
    try {
      const [games, categories, providers, unfilteredProviders, limits] = await Promise.all([
        api.getGames(adminId),
        api.getCategories(adminId),
        api.getProviders('filter'),
        api.getProviders('all'),
        api.getLimits(),
      ]);

      const limitsdata = limits.data;
      return { games, categories, providers, unfilteredProviders, limitsdata };
    } catch (error) {
      return rejectWithValue('Failed to fetch shared data');
    }
  }
);

export const fetchPlayerData = createAsyncThunk(
  'sharedData/fetchPlayer',
  async ({ id, userId }: { id: string; userId: string }, { rejectWithValue }) => {
    try {
      const player = await api.getPlayer(id, userId);
      const allWallets = await api.getAllWallets(id, userId);
      return { player, allWallets };
    } catch {
      return rejectWithValue('Failed to fetch player data');
    }
  }
);
export const fetchLimits = createAsyncThunk(
  'sharedData/fetchLimits',
  async (_, { rejectWithValue }) => {
    try {
      const limits = await api.getLimits();
      return limits.data;
    } catch {
      return rejectWithValue('Failed to fetch limits');
    }
  }
);

export const fetchGamesAndProviders = createAsyncThunk(
  'sharedData/fetchGamesAndProviders',
  async (adminId: string, { rejectWithValue }) => {
    try {
      const [games, providers] = await Promise.all([
        api.getGames(adminId),
        api.getProviders('filter'),
      ]);
      return { games, providers };
    } catch {
      return rejectWithValue('Failed to fetch games and providers');
    }
  }
);

export const fetchCategories = createAsyncThunk(
  'sharedData/fetchCategories',
  async (adminId: string, { rejectWithValue }) => {
    try {
      const [categories] = await Promise.all([api.getCategories(adminId)]);
      return { categories };
    } catch {
      return rejectWithValue('Failed to fetch categories');
    }
  }
);

const sharedDataSlice = createSlice({
  name: 'sharedData',
  initialState,
  reducers: {
    setCurrencies(state, action: PayloadAction<Record<string, string>>) {
      state.currencies = action.payload;
    },
    resetSharedData() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder

      // fetchSharedData
      .addCase(fetchSharedData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSharedData.fulfilled, (state, action) => {
        state.games = action.payload.games;
        state.categories = action.payload.categories;
        state.providers = action.payload.providers;
        state.unfilteredProviders = action.payload.unfilteredProviders;
        state.limits = action.payload.limitsdata;
        state.loading = false;
      })
      .addCase(fetchSharedData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // fetchLimits
      .addCase(fetchLimits.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchLimits.fulfilled, (state, action) => {
        state.limits = action.payload;
        state.loading = false;
      })
      .addCase(fetchLimits.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // fetchPlayerData
      .addCase(fetchPlayerData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPlayerData.fulfilled, (state, action) => {
        state.player = action.payload.player;
        state.allWallets = action.payload.allWallets;
        state.loading = false;
      })
      .addCase(fetchPlayerData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      .addCase(fetchGamesAndProviders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchGamesAndProviders.fulfilled, (state, action) => {
        state.games = action.payload.games;
        state.providers = action.payload.providers;
        state.loading = false;
      })
      .addCase(fetchGamesAndProviders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.categories = action.payload.categories;
        state.loading = false;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});
export const { setCurrencies, resetSharedData } = sharedDataSlice.actions;
export default sharedDataSlice.reducer;
