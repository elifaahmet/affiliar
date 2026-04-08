import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Loader from 'components/core-components/loader';
import { useAppDispatch } from 'hooks/redux';
import { fetchPlayerData } from 'store/sharedData/sharedDataSlice';
import { storageHelper } from 'utils/storage/StorageHelper';

import ContentArea from './components/ContentArea';
import Header from './components/Header';

function Details() {
  const { id } = useParams();
  const dispatch = useAppDispatch();

  const userId = storageHelper.getStoreWithDecryption('userId');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (id && userId) {
      setLoading(true);
      dispatch(fetchPlayerData({ id, userId })).finally(() => setLoading(false));
    }
  }, [id, userId, dispatch]);

  return (
    <div className="flex flex-col p-5 pb-48 gap-5 relative bg-gray-100">
      {loading && <Loader />}
      <Header />
      <ContentArea />
    </div>
  );
}

export default Details;
