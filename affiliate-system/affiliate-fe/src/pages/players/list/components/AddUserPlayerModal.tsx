import React, { useState } from 'react';
import { Controller, SubmitHandler, useForm } from 'react-hook-form';
import PInput from '@components/core-components/input';
import Modal from '@components/core-components/modal';
import { useToast } from '@components/core-components/toaster/ToastContext';
import { yupResolver } from '@hookform/resolvers/yup';
import cx from 'classnames';
import axiosInstance from 'config/axiosInstance';
import { getCustomerConfig } from 'config/brandConfig';
import { storageHelper } from 'utils/storage/StorageHelper';
import * as yup from 'yup';

interface AddUserPlayerModalProp {
  isModalOpen: boolean;
  handleCloseModal: () => void;
  handleOpenModal: (e: React.MouseEvent<HTMLButtonElement>) => void;
  refetch?: () => void;
}

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

const customerConfig = getCustomerConfig();

function AddUserPlayerModal({
  isModalOpen,
  handleCloseModal,
  refetch,
}: Readonly<AddUserPlayerModalProp>) {
  const [showAdvancedFilters] = useState(false);
  const { showToast } = useToast();
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
    const shouldSkipAadhaar =
      customerConfig.skipAadhaarVerification ?? customerConfig.enableAadhaarVerification !== true;
    const requestData = {
      ...data,
      currency: defaultCurrency,
      skipAadhaarVerification: shouldSkipAadhaar,
    };
    try {
      const res = await axiosInstance.post('/players/' + userId, requestData);
      if (res.status === 201) {
        reset();
        handleCloseModal();
        refetch?.();
        showToast('Player successfully added!', 'success');
      }
    } catch (error: any) {
      showToast(error.response?.data?.error || 'An error occurred', 'error');
    }
  };
  const userId = storageHelper.getStoreWithDecryption('userId');

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={() => {
        reset();
        handleCloseModal();
      }}
      isForm={true}
      onSubmit={handleSubmit(onSubmit)}
      content={
        <div
          className={cx(
            'px-[30px] pt-[34px] overflow-y-auto flex-grow w-[500px]',
            showAdvancedFilters && 'pb-[34px]',
            !showAdvancedFilters && 'pb-[76px]'
          )}
        >
          <div className="flex flex-col gap-3 w-[437px]">
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
          </div>
        </div>
      }
      footer={
        <div className="flex flex-row gap-3 items-center justify-between bg-white h-[70px]">
          <button
            type="button"
            onClick={() => {
              reset();
              handleCloseModal();
            }}
            className="bg-gray-200 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-300 h-10 w-[139px] text-body-reg-13 font-semibold"
          >
            Cancel
          </button>
          <button
            // onClick={handleSubmit(onSubmit)}
            type="submit"
            className="bg-primary text-white px-4 py-2 rounded-lg  h-10 w-[139px] text-body-reg-13 font-semibold hover:bg-primary-dark"
          >
            Submit
          </button>
        </div>
      }
      title={'Add User'}
    />
  );
}

export default AddUserPlayerModal;
