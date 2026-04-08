import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DateValueType } from 'react-tailwindcss-datepicker';
import BDatePicker from '@components/core-components/datePicker';
import PInput from '@components/core-components/input';
import Modal from '@components/core-components/modal';
import CustomPhoneInput from '@components/core-components/phoneInput';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';
import Switch from '@components/core-components/switch';
import { useToast } from '@components/core-components/toaster/ToastContext';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { COUNTRY_API_URLS, LANGUAGES_API_URLS, PLAYERS_API_URLS } from 'config/apiUrls';
import { getBrandingConfig } from 'config/brandConfig';
import { useAppDispatch, useAppSelector } from 'hooks/redux';
import { fetchPlayerData } from 'store/sharedData/sharedDataSlice';
import { subscribePlayerStatus } from 'utils/managers/wsManager';
import { checkPermission, extractPermissionGroups } from 'utils/permissions';
import { storageHelper } from 'utils/storage/StorageHelper';

interface Region {
  _id: string;
  id: number;
  name: string;
}

const mapOptions = (data: any, labelTitle: string) => {
  return data?.map((item: any) => {
    return {
      value: item.name,
      label: item[labelTitle],
      _id: item._id,
    };
  });
};

export default function PlayerInfo() {
  const player = useAppSelector((state) => state.sharedData.player);
  const userId = storageHelper.getStoreWithDecryption('userId');
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [selectedMobile, setSelectedMobile] = useState<string>('');
  const [mobileCode, setMobileCode] = useState<string>('');
  const [birthDate, setBirthDate] = useState<DateValueType | null>(null);
  const [checkedCountry, setCheckedCountry] = useState<string>('');
  const [checkedLanguage, setCheckedLanguage] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const { showToast } = useToast();
  const rawPermissions = useAppSelector((state) => state.auth.permissions || []);
  const dispatch = useAppDispatch();
  const { id } = useParams();

  const permissionGroups = extractPermissionGroups(rawPermissions);
  const canEdit = checkPermission(permissionGroups, 'players.list.detail.info.playerInfo.edit');
  const { data: countries } = useBaseQuery<Region[]>({
    endpoint: COUNTRY_API_URLS.GET_COUNTRIES(userId),
  });

  const { data: languages } = useBaseQuery<Region[]>({
    endpoint: LANGUAGES_API_URLS.GET_LANGUAGES(userId),
  });

  const countriesOptions = mapOptions(countries, 'name');
  const languagesOptions = mapOptions(languages, 'name');

  const {
    config: { features },
  } = getBrandingConfig();

  useEffect(() => {
    if (!player?._id) return;

    const unsubscribe = subscribePlayerStatus(player._id, (data) => {
      if (data?.playerId === player._id && data?.status) {
        setIsOnline(data.status === 'online');
      }
    });

    return () => unsubscribe();
  }, [player?._id]);

  useEffect(() => {
    if (player && countries?.length && languages?.length) {
      const selectedCountry = countries.find((c) => c._id === player.verify1.countryId);
      const selectedLanguage = languages.find((l) => l._id === player.verify1.languageId);

      setSelectedMobile(player?.verify1?.mobileNumber || '');
      setMobileCode(player?.verify1?.mobileCountryCode || '');
      setBirthDate({
        startDate: player?.verify1?.birthDate || null,
        endDate: player?.verify1?.birthDate || null,
      });
      setCheckedCountry(selectedCountry?.name || '');
      setCheckedLanguage(selectedLanguage?.name || '');
    }
  }, [player, countries, languages]);

  const { mutate } = useBaseMutation({
    endpoint: PLAYERS_API_URLS.UPDATE_PLAYER(player?._id, userId),
    method: 'update',
  });

  const playerId = player?._id ?? '';
  const adminId = userId ?? '';

  const { mutate: blockUser, isPending: isBlocking } = useBaseMutation({
    endpoint: PLAYERS_API_URLS.BLOCK_PLAYER(playerId, adminId),
    method: 'patch',
  });

  const { mutate: unblockUser, isPending: isUnblocking } = useBaseMutation({
    endpoint: PLAYERS_API_URLS.UNBLOCK_PLAYER(playerId, adminId),
    method: 'patch',
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;

    const selectedCountry = countries?.find((item) => item.name === checkedCountry);
    const selectedLanguage = languages?.find((item) => item.name === checkedLanguage);

    const payload = {
      username: form.username.value,
      addressLine: form.addressLine.value,
      addressLine2: form.addressLine2.value,
      postalCode: form.postalCode.value,
      verify1: {
        firstname: form.firstname.value,
        surname: form.surname.value,
        mobileNumber: selectedMobile,
        mobileCountryCode: mobileCode,
        birthDate: birthDate?.startDate,
        languageId: selectedLanguage?._id,
        countryId: selectedCountry?._id,
      },
    };

    mutate(payload, {
      onSuccess: () => {
        showToast('Player information saved successfully!', 'success');
        setIsEditing(false);
        if (id && userId) dispatch(fetchPlayerData({ id, userId }));
      },
    });
  };

  const resetFormStateFromPlayer = () => {
    if (!player || !countries || !languages) return;

    const selectedCountry = countries.find((c) => c._id === player.verify1.countryId);
    const selectedLanguage = languages.find((l) => l._id === player.verify1.languageId);

    setSelectedMobile(player.verify1?.mobileNumber || '');
    setMobileCode(player.verify1?.mobileCountryCode || '');
    setBirthDate({
      startDate: player.verify1?.birthDate || null,
      endDate: player.verify1?.birthDate || null,
    });
    setCheckedCountry(selectedCountry?.name || '');
    setCheckedLanguage(selectedLanguage?.name || '');

    const form = document.getElementById('player-info-form') as HTMLFormElement;
    if (form) {
      form.username.value = player.username || '';
      form.firstname.value = player.verify1?.firstname || '';
      form.surname.value = player.verify1?.surname || '';
      form.email.value = player.email || '';
      form.addressLine.value = player.addressLine || '';
      form.addressLine2.value = player.addressLine2 || '';
      form.postalCode.value = player.postalCode || '';
    }
  };

  const renderField = (label: string, name: string, defaultValue: any, disabled = false) => (
    <div className="h-[50px] flex flex-row items-center w-full justify-between">
      <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700 py-4 border-t border-gray-300">
        {label}
      </span>
      <PInput
        className="w-full"
        wrapperClassNames="h-full flex justify-center w-1/2"
        defaultValue={defaultValue}
        name={name}
        disabled={disabled}
        placeholder="Not Set"
      />
    </div>
  );

  const renderStaticField = (label: string, value: any, isLast = false) => (
    <div className="min-h-[50px] flex flex-row items-stretch w-full justify-between">
      <span
        className={`flex w-1/2 text-body-reg-14 font-medium text-gray-700 py-4 border-t border-gray-300 ${
          isLast ? 'border-b border-gray-300' : ''
        }`}
      >
        {label}
      </span>
      <div
        className={`w-1/2 py-3 pl-3 text-body-reg-14 text-gray-900 break-words border-t border-gray-300 ${
          isLast ? 'border-b border-gray-300' : ''
        }`}
      >
        <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 leading-5">
          {value || 'N/A'}
        </div>
      </div>
    </div>
  );

  const handleBlockToggle = () => {
    if (!player?._id) return;
    if (player?.isBlocked) {
      unblockUser(
        {},
        {
          onSuccess: () => {
            showToast('Player unblocked successfully.', 'success');
            if (id && userId) dispatch(fetchPlayerData({ id, userId }));
          },
          onError: () => {
            showToast('Failed to unblock player.', 'error');
          },
        }
      );
      return;
    }

    setIsBlockModalOpen(true);
  };

  const handleConfirmBlock = () => {
    if (!player?._id) return;
    const reason = blockReason.trim();
    if (!reason) {
      showToast('Block reason is required.', 'error');
      return;
    }

    blockUser(
      { blockReason: reason },
      {
        onSuccess: () => {
          showToast('Player blocked successfully.', 'success');
          setIsBlockModalOpen(false);
          setBlockReason('');
          if (id && userId) dispatch(fetchPlayerData({ id, userId }));
        },
        onError: () => {
          showToast('Failed to block player.', 'error');
        },
      }
    );
  };

  if (!player) return null;

  return (
    <form id="player-info-form" onSubmit={handleSubmit} className="flex flex-row w-full">
      <div className="w-full xl:w-1/3 pr-11 border-r-[3px] border-[#F1F1F4]">
        {renderField(
          'Created',
          'createdAt',
          player?.createdAt
            ? new Date(player.createdAt).toLocaleString('en-GB', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            : 'N/A',
          true
        )}
        {renderField('Username', 'username', player?.username, !isEditing)}
        {renderField('Name', 'firstname', player?.verify1?.firstname, !isEditing)}
        {renderField('Surname', 'surname', player?.verify1?.surname, !isEditing)}
        {renderField('Email', 'email', player?.email, true)}

        <div className="h-[50px] flex flex-row items-center w-full justify-between">
          <span className="flex shrink-0 w-1/2 text-body-reg-14 font-medium text-gray-700 py-4 border-t border-gray-300">
            Mobile Number
          </span>
          <CustomPhoneInput
            phone={selectedMobile}
            setPhone={(value: string, countryCode: string) => {
              setSelectedMobile(value);
              setMobileCode(countryCode);
            }}
            disabled={!isEditing}
          />
        </div>

        <div className="h-[50px] flex flex-row items-center w-full justify-between">
          <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700 py-4 border-t border-gray-300">
            Birthday
          </span>
          <div className="h-full flex justify-center w-1/2">
            <BDatePicker
              value={birthDate}
              placeholder="Birthday"
              onChange={(newDate: DateValueType | null) => setBirthDate(newDate)}
              className="w-full justify-center"
              showRange={false}
              showShortcuts={false}
              disabled={!isEditing}
            />
          </div>
        </div>

        <div className="h-[50px] flex flex-row items-center w-full justify-between">
          <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700 py-4 border-t border-gray-300">
            Language
          </span>
          <BSelectWithSearch
            label="Language"
            options={languagesOptions || []}
            value={checkedLanguage}
            onChange={setCheckedLanguage}
            classname="w-1/2"
            showSearch={false}
            disabled={!isEditing}
          />
        </div>

        <div className="h-[50px] flex flex-row items-center w-full justify-between">
          <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700 py-4 border-t border-b border-gray-300">
            Country
          </span>
          <BSelectWithSearch
            label="Country"
            options={countriesOptions || []}
            value={checkedCountry}
            onChange={setCheckedCountry}
            classname="w-1/2"
            disabled={!isEditing}
          />
        </div>
      </div>

      <div className="w-full xl:w-1/3 px-11 border-r-[3px] border-[#F1F1F4]">
        {renderField('Address Line 1', 'addressLine', player?.addressLine, !isEditing)}
        {renderField('Address Line 2', 'addressLine2', player?.addressLine2, !isEditing)}
        {renderField('Post Code', 'postalCode', player?.postalCode, !isEditing)}
        {renderField('Player ID', 'playerID', player?.id, true)}
      </div>

      <div className="flex flex-col w-full justify-between xl:w-1/3 pl-11">
        <div className="flex flex-col w-full">
          {!features?.hideNonFunctional && (
            <div className="h-[50px] flex flex-row items-center w-full justify-between">
              <span className="text-body-reg-14 font-medium text-gray-700 w-1/2 py-4 border-t border-gray-300">
                Player Category 🚫
              </span>
              <span className="h-full flex flex-row items-center justify-start w-1/2 text-body-reg-14 font-bold text-success">
                LOW RISK
              </span>
            </div>
          )}
          <div className="h-[50px] flex flex-row items-center w-full justify-between">
            <span className="text-body-reg-14 font-medium text-gray-700 w-1/2 py-4 border-t border-b border-gray-300">
              Status
            </span>
            <span
              className={`w-1/2 text-body-reg-14 font-bold flex items-center ${
                isOnline ? 'text-success' : 'text-danger'
              }`}
            >
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="h-[50px] flex flex-row items-center w-full justify-between">
            <span className="text-body-reg-14 font-medium text-gray-700 w-1/2 py-4 border-t border-gray-300">
              Blocked
            </span>
            <div className="w-1/2 flex items-center">
              <Switch
                isActive={Boolean(player?.isBlocked)}
                onToggle={handleBlockToggle}
                disabled={!canEdit}
                isLoading={isBlocking || isUnblocking}
              />
            </div>
          </div>
          {player?.isBlocked && (
            <>
              {renderStaticField('Blocked By', player?.blockedBy || 'N/A')}
              {renderStaticField('Block Reason', player?.blockReason || 'N/A', true)}
            </>
          )}
        </div>
        <div className="h-10 flex justify-end">
          {!isEditing ? (
            <button
              type="button"
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-semibold w-[139px] text-body-reg-13 h-full disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setIsEditing(true)}
              disabled={!canEdit}
            >
              Edit Info
            </button>
          ) : (
            <>
              <button
                type="button"
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 w-[139px] text-body-reg-13 h-full"
                onClick={() => {
                  resetFormStateFromPlayer();
                  setIsEditing(false);
                }}
              >
                Cancel
              </button>
              <button
                className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-semibold w-[139px] text-body-reg-13 h-full ml-3"
                type="submit"
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        title="Block Player"
        content={
          <div className="p-6 w-[420px]">
            <p className="text-body-reg-14 text-gray-600 mb-4">
              Are you sure you want to block this player? Please provide a reason for blocking.
            </p>
            <PInput
              // label="Block Reason"
              name="blockReason"
              placeholder="Enter reason"
              multiline
              value={blockReason}
              onChange={(e: any) => setBlockReason(e.target.value)}
            />
          </div>
        }
        footer={
          <div className="flex gap-3">
            <button
              className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 w-[140px] h-[40px]"
              type="button"
              onClick={() => setIsBlockModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-semibold w-[140px] h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
              onClick={handleConfirmBlock}
              disabled={isBlocking}
            >
              Block
            </button>
          </div>
        }
      />
    </form>
  );
}
