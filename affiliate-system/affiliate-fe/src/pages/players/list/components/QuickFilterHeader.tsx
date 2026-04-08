import { useState } from 'react';
import { Controller, SubmitHandler, useForm } from 'react-hook-form';
import Icon from '@components/core-components/icon';
import PInput from '@components/core-components/input';
import Modal from '@components/core-components/modal';
import { yupResolver } from '@hookform/resolvers/yup';
import cx from 'classnames';
import axiosInstance from 'config/axiosInstance';
import { useAppSelector } from 'hooks/redux';
import { checkPermission, extractPermissionGroups } from 'utils/permissions';
import { storageHelper } from 'utils/storage/StorageHelper';
import * as yup from 'yup';

interface QuickFiltersProp {
  showTools?: boolean;
  refetch: () => void;
  closeFilters: boolean;
  handleExportCSV?: () => void;
  searchText: string;
  handleSearch: (e: any) => void;
  setCloseFilters: (value: boolean) => void;
  showMainFilters: boolean;
  canEditColumns?: boolean;
  canDownloadCsv?: boolean;
  showCreateUser?: boolean;
  showCreateGroup?: boolean;
}

export const mapOptions = (data: any, labelTitle: string) => {
  return data?.map((item: any) => ({
    value: item._id.toString(),
    label: item[labelTitle],
  }));
};

interface FormValues {
  username: string;
  email: string;
  password: string;
}

const validationSchema = yup.object().shape({
  username: yup.string().required('Username is required'),
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup
    .string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
});
function QuickFilterHeader({
  setCloseFilters,
  refetch,
  closeFilters,
  showTools = true,
  handleExportCSV,
  showMainFilters,
  canDownloadCsv,
  showCreateUser = false,
  showCreateGroup = false,
}: Readonly<QuickFiltersProp>) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showAdvancedFilters] = useState(false);
  const [error, setError] = useState('');
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
    },
  });

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    const defaultCurrency = process.env.REACT_APP_DEFAULT_CURRENCY || 'Indian Rupee';
    const requestData = {
      ...data,
      currency: defaultCurrency,
    };
    try {
      const res = await axiosInstance.post('/players/' + userId, requestData);
      if (res.status === 201) {
        reset();
        setIsModalOpen(false);
        refetch();
      }
    } catch (error: any) {
      setError(error.response.data.error);
    }
  };
  const userId = storageHelper.getStoreWithDecryption('userId');
  const permissions = useAppSelector((state) => state.auth.permissions);
  const permissionGroups = extractPermissionGroups(permissions);
  const canCreateUser = checkPermission(permissionGroups, 'players.list.create');
  const canCreateGroup = checkPermission(permissionGroups, 'players.group.create');
  const handleDownloadCsvClick = () => {
    try {
      window?.sessionStorage?.removeItem('csvExportFiltered');
    } catch {
      // ignore storage failures
    }
    handleExportCSV?.();
  };

  return (
    <>
      {showMainFilters && (
        <>
          <div className="flex flex-row gap-5 mt-0 mb-4 justify-between">
            <div className="flex gap-3 h-10">
              <button
                onClick={() => setCloseFilters(!closeFilters)}
                className="flex items-center justify-between pl-3 h-full w-auto bg-primary text-white rounded-md hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 font-bold text-sm"
              >
                <span className="flex items-center gap-2 justify-center w-full">
                  <Icon
                    iconName="filterWhite"
                    svgProps={{
                      width: '21px',
                      height: '21px',
                    }}
                  />
                  <span className="pr-3">{closeFilters ? 'Close Filters' : 'Open Filters'}</span>
                  <div className="flex w-7 h-10 rounded-r-md items-center justify-center bg-primary-dark">
                    <Icon
                      iconName="whiteArrow"
                      className={`transition-transform duration-300 ${
                        closeFilters ? 'rotate-0' : 'rotate-180'
                      }`}
                      svgProps={{
                        width: '10px',
                        height: '6px',
                      }}
                    />
                  </div>
                </span>
              </button>
            </div>
            {showTools && (
              <div className="flex space-x-3 h-10">
                <button
                  onClick={handleDownloadCsvClick}
                  disabled={!canDownloadCsv}
                  className={`flex h-full items-center justify-center w-auto text-success p-3 rounded-md border border-success transition-colors hover:bg-success-light space-x-2 font-semibold text-[13px] ${
                    !canDownloadCsv ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Icon iconName="downloadGreen" svgProps={{ width: 20, height: 20 }} />
                  <span>Download CSV 🚫</span>
                </button>

                {showCreateUser && (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className={`flex h-full items-center justify-center w-[119px] text-[13px] hover:bg-primary-medium text-primary border border-primary px-3 py-4 rounded-md transition-colors space-x-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50`}
                    disabled={!canCreateUser}
                  >
                    <Icon
                      iconName="userBlue"
                      svgProps={{
                        width: 20,
                        height: 20,
                      }}
                    />
                    <span>Add User</span>
                  </button>
                )}
                {showCreateGroup && (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className={`flex h-full items-center justify-center w-[119px] text-[13px] hover:bg-primary-medium text-primary border border-primary px-3 py-4 rounded-md transition-colors space-x-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50`}
                    disabled={!canCreateGroup}
                  >
                    <Icon
                      iconName="userBlue"
                      svgProps={{
                        width: 20,
                        height: 20,
                      }}
                    />
                    <span>Add User</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Modal */}
          <Modal
            isOpen={isModalOpen}
            onClose={() => {
              reset();
              setIsModalOpen(false);
            }}
            content={
              <div
                className={cx(
                  'px-[30px] pt-[34px] overflow-y-auto flex-grow w-[500px]',
                  showAdvancedFilters && 'pb-[34px]',
                  !showAdvancedFilters && 'pb-[76px]'
                )}
              >
                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 w-[437px]">
                  {/* <BSelect
                options={marketingOptions}
                value={selectedMarketing}
                onChange={(e: any) => setSelectedMarketing(e.target.value)}
                className="w-full h-10"
                placeholder="Marketing Code*"
              /> */}
                  {/* <PInput placeholder="Username*" className="w-full h-10" /> */}
                  <Controller
                    name="username"
                    control={control}
                    render={({ field }) => (
                      <PInput
                        placeholder="Username*"
                        className="w-full h-10"
                        value={field.value}
                        onChange={field.onChange}
                        error={errors.username}
                      />
                    )}
                  />
                  <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                      <PInput
                        placeholder="Email*"
                        className="w-full h-10"
                        value={field.value}
                        onChange={field.onChange}
                        error={errors.email}
                      />
                    )}
                  />
                  <Controller
                    name="password"
                    control={control}
                    render={({ field }) => (
                      <PInput
                        placeholder="Password*"
                        className="w-full h-10"
                        type="password"
                        value={field.value}
                        onChange={field.onChange}
                        error={errors.password}
                      />
                    )}
                  />{' '}
                  {error && <div className="text-red-500 text-xs mt-1">{error}</div>}
                </form>
              </div>
            }
            footer={
              <div className="flex flex-row gap-3 items-center justify-between bg-white h-[70px]">
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setIsModalOpen(false);
                  }}
                  className="bg-gray-200 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-300 h-10 w-[139px] text-body-reg-13 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit(onSubmit)}
                  type="submit"
                  className="bg-primary text-white px-4 py-2 rounded-lg  h-10 w-[139px] text-body-reg-13 font-semibold"
                >
                  Submit
                </button>
              </div>
            }
            title={'Add User'}
          />
        </>
      )}
    </>
  );
}

export default QuickFilterHeader;
