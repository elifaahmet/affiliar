import axiosInstance from 'config/axiosInstance';
import { jwtDecode } from 'jwt-decode';
import { STORAGE_KEYS } from 'utils/common/constants';
import { storageHelper } from 'utils/storage/StorageHelper';

const authService = {
  login: async (identifier: string, password: string) => {
    try {
      const data = { identifier, password };

      const response = await axiosInstance.post('auth/login', data, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const responseData = response.data;

      if (responseData.twoFactorRequired) {
        return {
          auth: false,
          message: responseData.message,
          twoFactorRequired: true,
          showQrCode: responseData.showQrCode,
          userId: responseData.userId,
          email: responseData.email,
        };
      } else {
        const token = responseData.token;
        if (token) {
          storageHelper.setStoreWithEncryption(STORAGE_KEYS.TOKEN, token);
          try {
            const decoded: any = jwtDecode(token);
            storageHelper.setStoreWithEncryption(STORAGE_KEYS.USER_ID, decoded.sub);

            storageHelper.setStoreWithEncryption(STORAGE_KEYS.USER_INFO, {
              permissions: responseData?.user?.permissions,
              email: responseData?.user?.email,
              isPlatformAdmin: !!responseData?.user?.isPlatformAdmin,
              operatorId: responseData?.user?.operatorId ?? null,
              brandIds: responseData?.user?.brandIds ?? [],
            });
          } catch (error) {
            console.error('Invalid token format after direct login:', error);
          }
        }
        return {
          auth: true,
          message: responseData.message,
          token: responseData.token,
          user: responseData.user,
        };
      }
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || error?.response?.data?.error;
      console.error('Error during login:', apiMessage || error?.message);
      throw apiMessage || 'Login failed. Please check your credentials and try again.';
    }
  },

  verifyTwoFactor: async (userId: string, otpCode: string, setupComplete: boolean) => {
    try {
      const data = { userId, token: otpCode, setupComplete };
      const response = await axiosInstance.post('auth/verify-2fa', data, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const responseData = response.data;

      if (responseData.auth && responseData.token) {
        storageHelper.setStoreWithEncryption(STORAGE_KEYS.TOKEN, responseData.token);

        try {
          const decoded: any = jwtDecode(responseData.token);
          storageHelper.setStoreWithEncryption(STORAGE_KEYS.USER_ID, decoded.sub);
          storageHelper.setStoreWithEncryption(STORAGE_KEYS.USER_INFO, {
            permissions: responseData?.user?.permissions,
            email: responseData?.user?.email,
            isPlatformAdmin: !!responseData?.user?.isPlatformAdmin,
            operatorId: responseData?.user?.operatorId ?? null,
            brandIds: responseData?.user?.brandIds ?? [],
          });
        } catch (error) {
          console.error('Invalid token format after 2FA verification:', error);
        }
      }
      return responseData;
    } catch (error: any) {
      console.error(
        'Error during 2FA verification:',
        error.response?.data?.message || error.message
      );
      throw (
        error.response?.data?.message || 'An unexpected error occurred during 2FA verification.'
      );
    }
  },

  generateTwoFactorQr: async (userId: string) => {
    try {
      const response = await axiosInstance.get(`auth/generate-2fa-qr?userId=${userId}`);
      return response.data;
    } catch (error: any) {
      console.error(
        'Error generating 2FA QR code:',
        error.response?.data?.message || error.message
      );
      throw error.response?.data?.message || 'An unexpected error occurred generating QR code.';
    }
  },

  checkAuthStatus: async () => {
    try {
      const adminId = storageHelper.getStoreWithDecryption(STORAGE_KEYS.USER_ID);

      if (!adminId) {
        console.warn('No userId found in storage for auth status check.');
        return { auth: false, user: null };
      }

      const response = await axiosInstance.get(`auth/refresh?adminId=${adminId}`, {
        withCredentials: true,
      });

      if (response?.data?.auth && response?.data?.token) {
        storageHelper.setStoreWithEncryption(STORAGE_KEYS.TOKEN, response.data.token);
      }

      if (response?.data?.auth && response?.data?.user) {
        storageHelper.setStoreWithEncryption(STORAGE_KEYS.USER_INFO, {
          permissions: response.data.user.permissions,
          email: response.data.user.email,
          isPlatformAdmin: !!response.data.user.isPlatformAdmin,
          operatorId: response.data.user.operatorId ?? null,
          brandIds: response.data.user.brandIds ?? [],
        });
      }

      return {
        auth: response?.data?.auth,
        user: response?.data?.user || null,
      };
    } catch (error) {
      console.error('Error checking auth status:', error);
      storageHelper.removeStore(STORAGE_KEYS.TOKEN);
      storageHelper.removeStore(STORAGE_KEYS.USER_ID);
      storageHelper.removeStore(STORAGE_KEYS.USER_INFO);
      return {
        auth: false,
        user: null,
      };
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post('auth/logout', {}, { withCredentials: true });
      storageHelper.removeStore(STORAGE_KEYS.TOKEN);
      storageHelper.removeStore(STORAGE_KEYS.USER_ID);
      storageHelper.removeStore(STORAGE_KEYS.USER_INFO);
      return true;
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  },

  getUserId: () => {
    const userId = storageHelper.getStoreWithDecryption('userId');
    return userId;
  },
};

export default authService;
