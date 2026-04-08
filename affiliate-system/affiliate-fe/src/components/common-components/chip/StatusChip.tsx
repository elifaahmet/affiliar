import React from 'react';
import Icon from '@components/core-components/icon';
import { GAME_STATUS } from 'utils/enums/gameEnums';

interface Props {
  status: string;
  iconVisible?: boolean;
  text?: React.ReactNode;
}

const StatusChip: React.FC<Props> = ({ status, iconVisible = true, text }) => {
  if (!status) return null;

  const normalizeStatus = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const statusKey = normalizeStatus(status);
  const enabledByAdmin = normalizeStatus(GAME_STATUS.ENABLED_BY_ADMIN);
  const disabledByAdmin = normalizeStatus(GAME_STATUS.DISABLED_BY_ADMIN);
  const disabledByProvider = normalizeStatus(GAME_STATUS.DISABLED_BY_PROVIDER);

  const statusStyles: Record<string, string> = {
    all: 'bg-yellow-chip border-yellow',
    monthly: 'bg-yellow-chip border-yellow',
    daily: 'bg-primary-chip border-primary',
    weekly: 'bg-warning-light border-warning',
    active: 'bg-success-chip border-success',
    won: 'bg-success-chip border-success',
    created: 'bg-primary-chip border-primary',
    lost: 'bg-danger-chip border-danger',
    open: 'bg-success-chip border-success',
    settled: 'bg-yellow-chip border-yellow',
    updated: 'bg-yellow-chip border-yellow',
    completed: 'bg-success-chip border-success',
    success: 'bg-success-chip border-success',
    deleted: 'bg-danger-chip border-danger',
    disabled: 'bg-danger-chip border-danger',
    blocked: 'bg-danger-chip border-danger',
    processing: 'bg-primary-chip border-primary',
    category: 'bg-success-chip border-success',
    read: 'bg-success-chip border-success',
    [enabledByAdmin]: 'bg-success-chip border-success',
    closed: 'bg-danger-chip border-danger',
    rejected: 'bg-danger-chip border-danger',
    error: 'bg-danger-chip border-danger',
    confirmed: 'bg-success-chip border-success',
    failed: 'bg-danger-chip border-danger',
    passive: 'bg-danger-chip border-danger',
    inactive: 'bg-danger-chip border-danger',
    expired: 'bg-danger-chip border-danger',
    [disabledByAdmin]: 'bg-danger-chip border-danger',
    [disabledByProvider]: 'bg-danger-chip border-danger',
    processed: 'bg-primary-chip border-primary',
    returned: 'bg-primary-chip border-primary',
    'cash out': 'bg-primary-chip border-primary',
    pending: 'bg-primary-chip border-primary',
    accepted: 'bg-yellow-chip border-yellow',
    unread: 'bg-yellow-chip border-yellow',
    game: 'bg-yellow-chip border-yellow',
    canceled: 'bg-pink-chip border-pink',
    cancelled: 'bg-pink-chip border-pink',
    provider: 'bg-pink-chip border-pink',
    single: 'bg-yellow-chip border-yellow',
    multiple: 'bg-pink-chip border-pink',
    combine: 'bg-pink-chip border-pink',
    system: 'bg-success-chip border-success',
    visible: 'bg-success-chip border-success',
    'not visible': 'bg-warning-light border-warning',
    void: 'bg-warning-light border-warning',
    paid: 'bg-success-chip border-success',
    payable: 'bg-primary-chip border-primary',
    non_payable: 'bg-danger-chip border-danger',
    'non payable': 'bg-danger-chip border-danger',
    partial_payable: 'bg-yellow-chip border-yellow',
    'partial payable': 'bg-yellow-chip border-yellow',
    suspended: 'bg-warning-light border-warning',
    skipped: 'bg-warning-light border-warning',
  };

  const iconMapping: Record<string, string> = {
    active: 'won',
    won: 'won',
    open: 'won',
    completed: 'won',
    read: 'won',
    [enabledByAdmin]: 'won',
    closed: 'lost',
    lost: 'lost',
    rejected: 'lost',
    weekly: 'weekly',
    monthly: 'monthly',
    daily: 'daily',
    processed: 'clock',
    returned: 'clock',
    passive: 'reject',
    inactive: 'reject',
    disabled: 'reject',
    expired: 'reject',
    [disabledByAdmin]: 'reject',
    [disabledByProvider]: 'reject',
    pending: 'returned',
    accepted: 'accept',
    settled: 'accept',
    all: 'performance',
    'cash out': 'blueTickCircle',
    canceled: 'canceled',
    cancelled: 'canceled',
    provider: 'provider',
    game: 'cherryGame',
    category: 'category',
    unread: 'unread',
    visible: 'viewGreen',
    'not visible': 'warningTriangle',
    void: 'warningTriangle',
    paid: 'won',
    payable: 'returned',
    non_payable: 'reject',
    'non payable': 'reject',
    partial_payable: 'clock',
    'partial payable': 'clock',
    suspended: 'warningTriangle',
  };

  const iconFills: Record<string, string> = {
    weekly: '#FF6E1D', // warning
    monthly: '#FFAD31', // yellow
    daily: '#3267FF', // primary
  };

  const statusClass = statusStyles[statusKey] || 'bg-yellow-chip border-yellow';
  const iconName = iconMapping[statusKey] || '';

  const fillColor = iconName === 'performance' ? '#ffad31' : iconFills[statusKey] || undefined;

  return (
    <div
      className={`px-2 flex flex-row gap-1 justify-start min-w-[105px] text-gray-700 items-center min-h-[30px] text-sm border-l-2 rounded-lg ${statusClass}`}
    >
      {iconVisible && (
        <Icon
          iconName={iconName}
          svgProps={{
            width: 12,
            height: 12,
            fill: fillColor,
          }}
        />
      )}
      {text || statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
    </div>
  );
};

export default StatusChip;
