import axiosInstance from 'config/axiosInstance';

export const baseService = {
  getAll: async <T>(url: string, params?: any) => {
    try {
      const response = await axiosInstance.get<T>(url, { params });
      return response.data;
    } catch (error: any) {
      // if (error.response && error.response.status === 401) {
      //   window.location.href = "/";
      // }
      throw new Error(error);
    }
  },
  getById: async <T>(url: string, id: number) => {
    try {
      const response = await axiosInstance.get<T>(url + id);
      return response.data;
    } catch (error: any) {
      // if (error.response && error.response.status === 401) {
      //   window.location.href = "/";
      // }
      throw new Error(error);
    }
  },
  add: async <T>(url: string, data: any) => {
    try {
      const response = await axiosInstance.post<T>(url, data);
      return response.data;
    } catch (error: any) {
      // if (error.response && error.response.status === 401) {
      //   window.location.href = "/";
      // }
      throw error;
    }
  },
  update: async <T>(url: string, data: any) => {
    try {
      const response = await axiosInstance.put<T>(url, data);
      return response.data;
    } catch (error: any) {
      // if (error.response && error.response.status === 401) {
      //   window.location.href = "/";
      // }
      throw error;
    }
  },
  patch: async <T>(url: string, data: any) => {
    try {
      const response = await axiosInstance.patch<T>(url, data);
      return response.data;
    } catch (error: any) {
      // if (error.response && error.response.status === 401) {
      //   window.location.href = "/";
      // }
      throw error;
    }
  },
  delete: async <T>(url: string, id: number) => {
    try {
      const response = await axiosInstance.delete<T>(url + id);
      return response.data;
    } catch (error: any) {
      // if (error.response && error.response.status === 401) {
      //   window.location.href = "/";
      // }
      throw error;
    }
  },
};
