const protocol = process.env.REACT_APP_PROTOCOL;
const baseUrl = `${protocol}://${process.env.REACT_APP_API_BASE_URL}`;
if (!baseUrl) {
  throw new Error('REACT_APP_API_BASE_URL is not defined in environment variables.');
}

export const API_BASE_URL: string = baseUrl;
