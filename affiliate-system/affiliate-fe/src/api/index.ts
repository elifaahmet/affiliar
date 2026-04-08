import {
  CATEGORIES_API_URLS,
  LIMIT_API_URLS,
  PLAYER_WALLET_API_URLS,
  PLAYERS_API_URLS,
  PROVIDER_API_URLS,
} from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';

// Helper functions that call API using predefined URL builders
const api = {
  getGames: async (_adminId: string) => {
    return [];
  },

  getCategories: async (adminId: string) => {
    const res = await axiosInstance.get(CATEGORIES_API_URLS.GET_CATEGORIES_SELECT(adminId));
    return res.data;
  },

  getProviders: async (query: any) => {
    const res = await axiosInstance.get(`${PROVIDER_API_URLS.GET_PROVIDERS()}/select`, {
      params: { type: query },
    });
    return res.data;
  },

  getLimits: async () => {
    const res = await axiosInstance.get(LIMIT_API_URLS.get_all_limits());
    return res.data;
  },
  getPlayer: async (id: string, adminId: string) => {
    const res = await axiosInstance.get(PLAYERS_API_URLS.GET_PLAYER_BY_ID(id, adminId));
    return res.data;
  },

  getAllWallets: async (id: string, adminId: string) => {
    const res = await axiosInstance.get(PLAYER_WALLET_API_URLS.GET_ALL_WALLETS(id, adminId));
    return res.data;
  },
};

export default api;
