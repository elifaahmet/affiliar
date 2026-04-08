import SecureLS from 'secure-ls';

export const storageHelper = {
  setStoreWithEncryption: (key: string, value: any): void => {
    try {
      const ls = new SecureLS({ encodingType: 'aes' });
      ls.set(key, value);
    } catch (error) {
      const ls = new SecureLS({ encodingType: 'aes' });
      ls.remove(key);
    }
  },
  getStoreWithDecryption: (key: string): any => {
    try {
      const ls = new SecureLS({ encodingType: 'aes' });
      return ls.get(key);
    } catch (error) {
      const ls = new SecureLS({ encodingType: 'aes' });
      ls.remove(key);
      return null;
    }
  },
  removeStore: (key: string): void => {
    const ls = new SecureLS({ encodingType: 'aes' });
    ls.remove(key);
  },
};
