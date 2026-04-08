import cmsAxiosInstance, { CMS_BASE_URL } from 'config/cmsAxiosInstance';

export interface CmsUploadResponseItem {
  id: number;
  url: string;
  rawUrl?: string;
  name?: string;
  alternativeText?: string;
  caption?: string;
  size?: number;
  width?: number;
  height?: number;
  formats?: Record<string, any>;
  ext?: string;
  mime?: string;
}

export const uploadCmsImage = async (file: File): Promise<CmsUploadResponseItem> => {
  const formData = new FormData();
  formData.append('files', file);

  let response;
  try {
    response = await cmsAxiosInstance.post<CmsUploadResponseItem[]>('upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 413) {
      throw new Error('Image is too large. Please upload a smaller file.');
    }
    throw new Error('Image upload failed. Image is too large. Please try again.');
  }

  const uploadedFile = response.data?.[0];

  if (!uploadedFile || !uploadedFile.url) {
    throw new Error('Image upload failed');
  }

  const normalizedUrl = uploadedFile.url.startsWith('http')
    ? uploadedFile.url
    : `${CMS_BASE_URL}${uploadedFile.url}`;

  return {
    ...uploadedFile,
    url: normalizedUrl,
    rawUrl: uploadedFile.url,
  };
};
