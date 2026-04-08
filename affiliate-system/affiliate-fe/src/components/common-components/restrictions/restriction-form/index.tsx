import React, { useMemo, useState } from 'react';
import CustomTooltip from '@components/common-components/tooltip';
import Popup from '@components/core-components/modal/Popup';
import MultiSelect from '@components/core-components/multiple-select';
import { useToast } from '@components/core-components/toaster/ToastContext';
import { useAppDispatch, useAppSelector } from 'hooks/redux';
import { fetchGamesAndProviders } from 'store/sharedData/sharedDataSlice';
import { RestrictionType } from 'utils/enums/restrictionEnums';
import { checkPermission, extractPermissionGroups } from 'utils/permissions';

import LimitedByButton from './components/LimitedByButton';
import { limitedByOptions } from './data';

interface RestrictionFormProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  handleSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
  refetch: () => void;
}

interface Provider {
  value: string;
  label: string;
}

const RestrictionForm = ({
  activeTab,
  setActiveTab,
  handleSubmit,
  refetch,
}: RestrictionFormProps) => {
  const [isOpenConfirmPopup, setIsOpenConfirmPopup] = useState<boolean>(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { showToast } = useToast();
  const dispatch = useAppDispatch();

  const providers = useAppSelector((state) => state.sharedData.providers);
  const permissions = useAppSelector((state) => state.auth.permissions);

  const permissionGroups = useMemo(() => extractPermissionGroups(permissions), [permissions]);

  const canCreate = checkPermission(permissionGroups, 'management.casino.restrictions.create');
  const isFormValid =
    activeTab === RestrictionType.PROVIDER && selectedProvider.length > 0;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const payload = { providerIds: selectedProvider.map((p) => p.value) };

      await handleSubmit(payload);
      setSelectedProvider([]);
      dispatch(fetchGamesAndProviders('testId'));
      setIsOpenConfirmPopup(false);
      refetch();
      showToast('Restriction applied successfully', 'success');
    } catch (_error) {
      showToast('Failed to apply restriction', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex-1 w-full max-w-xl">
        <div className="flex flex-col pb-4">
          <div className="flex flex-row gap-3">
            <span className="text-xl text-gray-900 font-extrabold">Restrictions</span>
            <CustomTooltip
              title="Restrictions"
              content="Here you can define restrictions for selected providers."
              placement="right"
            />
          </div>
          <span className="text-sm font-medium text-gray-600">
            Select the providers you want to disable.
          </span>
        </div>

        <div className="flex flex-row gap-3 pb-4 max-w-sm">
          {limitedByOptions.map((item) => (
            <LimitedByButton
              key={item.value}
              label={item.label.charAt(0).toUpperCase() + item.label.slice(1)}
              value={item.value as RestrictionType.PROVIDER}
              icon={item.icon}
              isActive={activeTab === item.value}
              onClick={setActiveTab}
            />
          ))}
        </div>

        <div className="flex flex-col">
          <hr className="flex w-1/2 bg-gray-300 h-[1px]" />
          <div className="min-h-[50px] flex flex-row items-center w-full justify-between">
            <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700">Provider</span>
            <MultiSelect
              options={providers}
              value={selectedProvider}
              onChange={(val) => setSelectedProvider(val)}
              classname="w-1/2"
              label="Providers"
            />
          </div>
          <hr className="flex w-1/2 bg-gray-300 h-[1px]" />
        </div>

        <div className="flex w-full justify-end pt-5">
          <button
            className="flex items-center justify-center text-body-reg-13 font-bold h-10 px-4 w-[140px] text-white bg-primary hover:bg-primary-dark rounded-lg"
            disabled={!canCreate || !isFormValid}
            onClick={() => {
              setIsOpenConfirmPopup(true);
            }}
          >
            Save
          </button>
        </div>
      </div>

      <Popup
        isOpen={isOpenConfirmPopup}
        onClose={() => {
          setIsOpenConfirmPopup(false);
        }}
        iconName="warning"
        title="Apply Restriction?"
        description="Are you sure you want to restrict the selected provider(s)? All games under these providers will also be disabled and become unavailable to players."
        subDescription=""
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={handleConfirm}
        isLoading={isLoading}
      />
    </>
  );
};

export default RestrictionForm;
