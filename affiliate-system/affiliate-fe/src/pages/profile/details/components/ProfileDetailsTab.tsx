import React from 'react';
import { useEffect, useState } from 'react';
import PInput from '@components/core-components/input';
import CustomPhoneInput from '@components/core-components/phoneInput';
import BSelect from '@components/core-components/select';
import { useToast } from '@components/core-components/toaster/ToastContext';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { AUTH_URLS } from 'config/apiUrls';
import { useAppDispatch, useAppSelector } from 'hooks/redux';
import { checkAuthStatus } from 'store/auth/authenticationSlice';

import Header from './Header';
import DigestPreference from '@components/core-components/DigestPreference';

export default function ProfileDetailsTab() {
  const { email, role, name, mobileNumber, mobileCountryCode } = useAppSelector(
    (state) => state.auth
  );
  const [selectedMobile, setSelectedMobile] = useState<string>('');
  const [mobileCode, setMobileCode] = useState<string>('');
  const { showToast } = useToast();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (mobileNumber) setSelectedMobile(mobileNumber);
    if (mobileCountryCode) setMobileCode(mobileCountryCode);
  }, [mobileNumber, mobileCountryCode]);

  const { mutate, isPending } = useBaseMutation({
    endpoint: AUTH_URLS.UPDATE_PROFILE(),
    method: 'update',
    onSuccess: (res) => {
      dispatch(checkAuthStatus());
      showToast(res?.message || 'Password changed successfully', 'success');
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const payload = {
      name: form.firstName?.value,
      mobileNumber: selectedMobile,
      mobileCountryCode: mobileCode,
    };
    mutate(payload);
  };

  return (
    <>
    <form onSubmit={handleSubmit} className="flex flex-col w-full gap-6">
      <div className="flex flex-col w-1/2 ">
        <Header title="Profile Details" />
        <div className="flex flex-col">
          <div className="h-[50px] flex flex-row items-center w-full justify-between">
            <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700 py-4 border-t border-gray-300">
              <span className="w-1/2">Role</span>
            </span>
            <BSelect
              className="h-full w-1/2 justify-center"
              value={''}
              placeholder={role || 'System Default'}
              options={[]}
              onChange={() => {
                // noop
              }}
              disabled
            />
          </div>
          <div className="h-[50px] flex flex-row items-center w-full justify-between">
            <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700 py-4 border-t border-gray-300">
              <span className="w-1/2">Name</span>
            </span>
            <PInput
              className="w-full"
              wrapperClassNames="h-full w-1/2 flex justify-center"
              defaultValue={name || ''}
              placeholder="Not set"
              name="firstName"
            />
          </div>
          <div className="h-[50px] flex flex-row items-center w-full justify-between">
            <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700 py-4 border-t border-gray-300">
              <span className="w-1/2">Email Address</span>
            </span>
            <PInput
              className="w-full"
              wrapperClassNames="h-full w-1/2 flex justify-center"
              value={email || ''}
              disabled
            />
          </div>
          <div className="h-[50px] flex flex-row items-center w-full justify-between">
            <span className="flex w-1/2 shrink-0 text-body-reg-14 font-medium text-gray-700 py-4 border-t border-b border-gray-300">
              <span className="w-1/2">Phone Number</span>
            </span>
            <CustomPhoneInput
              phone={selectedMobile}
              setPhone={(value: string, countryCode: string) => {
                setSelectedMobile(value);
                setMobileCode(countryCode);
              }}
            />
          </div>
        </div>
      </div>

      <div className="sticky bottom-4 right-4 flex justify-end">
        <button
          className={`flex w-40 h-10 justify-center items-center rounded-lg text-white text-body-reg-13 font-bold bg-primary hover:bg-primary-dark disabled:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-50`}
          type="submit"
          disabled={isPending}
        >
          {isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
      <div className="w-1/2 mt-6">
        <DigestPreference />
      </div>
    </>
  );
}
