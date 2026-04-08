import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import authService from 'api/auth/AuthService';
import { jwtDecode } from 'jwt-decode';
import { STORAGE_KEYS } from 'utils/common/constants';
import { storageHelper } from 'utils/storage/StorageHelper';

interface VerifyTwoFactorPayload {
  userId: string;
  otpCode: string;
  setupComplete: boolean;
}

function decodeToken(token: string): { sub: string } {
  return jwtDecode<{ sub: string }>(token);
}

export const verifyTwoFactor = createAsyncThunk(
  'auth/verifyTwoFactor',
  async ({ userId, otpCode, setupComplete }: VerifyTwoFactorPayload, { rejectWithValue }) => {
    try {
      const response = await authService.verifyTwoFactor(userId, otpCode, setupComplete);
      const decodedToken = decodeToken(response.token);

      return { response, adminId: decodedToken.sub };
    } catch (error) {
      if (error) {
        return rejectWithValue(error);
      }
      return rejectWithValue('Unknown error occurred');
    }
  }
);

export const generateTwoFactorQr = createAsyncThunk(
  'auth/generateTwoFactorQr',
  async (userId: string, { rejectWithValue }) => {
    try {
      const response = await authService.generateTwoFactorQr(userId);
      return response;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Generate QR Code Error:', error.message);
        return rejectWithValue(error.message);
      }
      return rejectWithValue('Failed to generate QR code.');
    }
  }
);

export const authenticationLogin = createAsyncThunk(
  'auth/login',
  async (credentials: { identifier: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials.identifier, credentials.password);

      if (response.twoFactorRequired) {
        return {
          twoFactorRequired: true,
          showQrCode: response.showQrCode,
          userId: response.userId,
          email: response.email,
        };
      } else {
        const decodedToken = decodeToken(response.token);

        return {
          twoFactorRequired: false,
          response,
          credentials,
          adminId: decodedToken.sub,
        };
      }
    } catch (error) {
      if (error instanceof Error) {
        return rejectWithValue(error.message);
      }
      if (typeof error === 'string' && error.trim().length > 0) {
        return rejectWithValue(error);
      }
      return rejectWithValue('Login failed.');
    }
  }
);

export const checkAuthStatus = createAsyncThunk(
  'auth/checkAuthStatus',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.checkAuthStatus();
      if (response && response.auth) {
        const userIdFromStorage = storageHelper.getStoreWithDecryption(STORAGE_KEYS.USER_ID);
        return { ...response, userId: userIdFromStorage };
      } else {
        storageHelper.removeStore(STORAGE_KEYS.TOKEN);
        storageHelper.removeStore(STORAGE_KEYS.USER_ID);
        storageHelper.removeStore(STORAGE_KEYS.USER_INFO);
        return rejectWithValue('Not authenticated or token expired.');
      }
    } catch (error) {
      if (error instanceof Error) {
        return rejectWithValue(error.message);
      }
      return rejectWithValue('Auth status check failed.');
    }
  }
);

export const logoutUser = createAsyncThunk('auth/logout', async (_, { rejectWithValue }) => {
  try {
    await authService.logout();
    return true;
  } catch (error) {
    if (error instanceof Error) {
      return rejectWithValue(error.message);
    }
    return rejectWithValue('Logout failed.');
  }
});

interface AuthenticationState {
  userId: string | null;
  email: string | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  permissions: { resource: string; action: string; condition: any }[];
  twoFactorRequired: boolean;
  showQrCode: boolean;
  twoFactorSetupSecret: string | null;
  qrCodeImage: string | null;
  role: string | null;
  name: string | null;
  mobileNumber: string | null;
  mobileCountryCode: string | null;
}

const initialState: AuthenticationState = {
  userId: null,
  email: null,
  loading: false,
  error: null,
  isAuthenticated: false,
  permissions: [],
  twoFactorRequired: false,
  showQrCode: false,
  twoFactorSetupSecret: null,
  qrCodeImage: null,
  role: null,
  name: null,
  mobileNumber: null,
  mobileCountryCode: null,
};

export const authenticationSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state: AuthenticationState) => {
      Object.assign(state, initialState);
      storageHelper.removeStore(STORAGE_KEYS.TOKEN);
      storageHelper.removeStore(STORAGE_KEYS.USER_ID);
      storageHelper.removeStore(STORAGE_KEYS.USER_INFO);
    },
    resetTwoFactorState: (state: AuthenticationState) => {
      state.twoFactorRequired = false;
      state.showQrCode = false;
      state.twoFactorSetupSecret = null;
      state.qrCodeImage = null;
      state.error = null;
    },
  },
  extraReducers: (builder: any) => {
    builder.addCase(authenticationLogin.pending, (state: AuthenticationState) => {
      state.loading = true;
      state.error = null;
      state.isAuthenticated = false;
      state.twoFactorRequired = false;
      state.showQrCode = false;
      state.userId = null;
      state.qrCodeImage = null;
      state.twoFactorSetupSecret = null;
    });
    builder.addCase(
      authenticationLogin.fulfilled,
      (state: AuthenticationState, action: PayloadAction<any>) => {
        const payload = action.payload;
        state.loading = false;
        state.error = null;

        if (payload.twoFactorRequired) {
          state.twoFactorRequired = true;
          state.showQrCode = payload.showQrCode;
          state.userId = payload.userId;
          state.email = payload.email;
          state.isAuthenticated = false;
          storageHelper.setStoreWithEncryption(STORAGE_KEYS.USER_ID, payload.userId);
        } else {
          const user = payload.response.user;
          state.isAuthenticated = payload.response.auth;
          state.userId = payload.adminId;
          state.email = payload.credentials.email;
          state.permissions = user.permissions;
          state.role = user.role || null;
        }
      }
    );
    builder.addCase(
      authenticationLogin.rejected,
      (state: AuthenticationState, action: PayloadAction<any>) => {
        state.loading = false;
        state.error = action.payload || 'Login failed. Please try again.';
        state.isAuthenticated = false;
        state.twoFactorRequired = false;
        state.showQrCode = false;
        state.userId = null;
        state.qrCodeImage = null;
        state.twoFactorSetupSecret = null;
        storageHelper.removeStore(STORAGE_KEYS.TOKEN);
        storageHelper.removeStore(STORAGE_KEYS.USER_ID);
        storageHelper.removeStore(STORAGE_KEYS.USER_INFO);
      }
    );

    builder.addCase(verifyTwoFactor.pending, (state: AuthenticationState) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(
      verifyTwoFactor.fulfilled,
      (state: AuthenticationState, action: PayloadAction<any>) => {
        const { response, adminId } = action.payload;
        const user = response.user;
        state.loading = false;
        state.isAuthenticated = response.auth;
        state.userId = adminId;
        state.email = user.email;
        state.permissions = user.permissions;
        state.role = user.role || null;
        state.name = user.name || null;
        state.mobileNumber = user.mobileNumber || null;
        state.mobileCountryCode = user.mobileCountryCode || null;
        state.twoFactorRequired = false;
        state.showQrCode = false;
        state.twoFactorSetupSecret = null;
        state.qrCodeImage = null;
        state.error = null;
      }
    );
    builder.addCase(
      verifyTwoFactor.rejected,
      (state: AuthenticationState, action: PayloadAction<any>) => {
        state.loading = false;
        state.error = action.payload || '2FA verification failed. Please try again.';
        state.isAuthenticated = false;
      }
    );

    builder.addCase(generateTwoFactorQr.pending, (state: AuthenticationState) => {
      state.loading = true;
      state.error = null;
      state.qrCodeImage = null;
      state.twoFactorSetupSecret = null;
    });
    builder.addCase(
      generateTwoFactorQr.fulfilled,
      (state: AuthenticationState, action: PayloadAction<any>) => {
        state.loading = false;
        state.qrCodeImage = action.payload.qrCodeImage;
        state.twoFactorSetupSecret = action.payload.secret;
        state.error = null;
      }
    );
    builder.addCase(
      generateTwoFactorQr.rejected,
      (state: AuthenticationState, action: PayloadAction<any>) => {
        state.loading = false;
        state.error = action.payload || 'Failed to generate QR code.';
        state.qrCodeImage = null;
        state.twoFactorSetupSecret = null;
      }
    );

    builder.addCase(checkAuthStatus.pending, (state: AuthenticationState) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(
      checkAuthStatus.fulfilled,
      (state: AuthenticationState, action: PayloadAction<any>) => {
        const { auth, user, userId } = action.payload;
        state.loading = false;
        state.isAuthenticated = auth;
        state.permissions = user?.permissions || [];
        state.email = user?.email || null;
        state.userId = userId;
        state.twoFactorRequired = false;
        state.showQrCode = false;
        state.twoFactorSetupSecret = null;
        state.qrCodeImage = null;
        state.error = null;
        state.role = user?.role || null;
        state.name = user?.name || null;
        state.mobileNumber = user?.mobileNumber || null;
        state.mobileCountryCode = user?.mobileCountryCode || null;
      }
    );
    builder.addCase(checkAuthStatus.rejected, (state: AuthenticationState) => {
      state.loading = false;
      state.isAuthenticated = false;
      state.userId = null;
      state.email = null;
      state.permissions = [];
      state.twoFactorRequired = false;
      state.showQrCode = false;
      state.twoFactorSetupSecret = null;
      state.qrCodeImage = null;
    });

    builder.addCase(logoutUser.pending, (state: AuthenticationState) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(logoutUser.fulfilled, (state: AuthenticationState) => {
      Object.assign(state, initialState);
    });
    builder.addCase(
      logoutUser.rejected,
      (state: AuthenticationState, action: PayloadAction<any>) => {
        state.loading = false;
        state.error = action.payload;
        Object.assign(state, initialState);
      }
    );
  },
});

export const { logout, resetTwoFactorState } = authenticationSlice.actions;
export default authenticationSlice.reducer;
