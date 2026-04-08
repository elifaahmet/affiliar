import axios from 'axios';
import { API_BASE_URL } from 'utils/api/apiConfig';
import { STORAGE_KEYS } from 'utils/common/constants';
import { storageHelper } from 'utils/storage/StorageHelper';

const axiosInstance = axios.create({
  baseURL: `${API_BASE_URL}api/`,
  withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
  const authExemptPaths = ['auth/login', 'auth/verify-2fa', 'auth/generate-2fa-qr'];
  const requestUrl = config.url || '';
  const isAuthExempt = authExemptPaths.some((path) => requestUrl.includes(path));

  if (isAuthExempt) {
    if (config.headers && 'Authorization' in config.headers) {
      delete config.headers.Authorization;
    }
    return config;
  }

  const token = storageHelper.getStoreWithDecryption(STORAGE_KEYS.TOKEN);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default axiosInstance;
// 67232725a5ac7041db6d9a4a
//admin id
