/* eslint-disable  */
import axios from 'axios';

const protocol = process.env.REACT_APP_PROTOCOL;
const cmsBaseUrl = process.env.REACT_APP_CMS_BASE_URL;
const cmsApiToken = process.env.REACT_APP_CMS_API_TOKEN;

if (!protocol || !cmsBaseUrl) {
  throw new Error('CMS base url environment variables are missing');
}

export const CMS_BASE_URL = `${protocol}://${cmsBaseUrl}`;

const cmsAxiosInstance = axios.create({
  baseURL: `${CMS_BASE_URL}/api/`,
  withCredentials: true,
});

cmsAxiosInstance.interceptors.request.use((config) => {
  const token = cmsApiToken;
  // disable-next-line no-console

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default cmsAxiosInstance;
