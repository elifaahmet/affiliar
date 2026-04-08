import React, { ReactNode } from 'react';
import { getBrandingConfig } from 'config/brandConfig';
import { statusMapper } from 'utils/common/statusMapper';

interface FinancialCardProps {
  color: string;
  amount: any;
  label: string;
  dropDown?: ReactNode;
  statusName?: string;
}

const FinancialCard: React.FC<FinancialCardProps> = ({
  color,
  amount,
  label,
  dropDown,
  statusName,
}) => {
  const {
    config: { features },
  } = getBrandingConfig();

  if (statusName === 'inactive' && features?.hideNonFunctional) {
    return null;
  }

  return (
    <div className="flex flex-row h-full max-h-[68px] relative shrink items-center justify-between self-stretch p-4 bg-white rounded-lg border border-[#F1F1F4] border-solid shadow-[0px_3px_4px_0px_rgba(0,0,0,0.03)] w-full">
      <div className="flex z-0 gap-4 items-center w-full">
        <div className={`flex shrink-0 h-11 ${color} rounded-[4px] w-[5px]`} />
        <div className="flex flex-col">
          <div className="text-heading-20 font-extrabold text-gray-900">
            {amount} {statusName && statusMapper[statusName]}
          </div>
          <div className="mt-1 text-xs font-medium text-gray-600">{label}</div>
        </div>
      </div>
      {dropDown}
    </div>
  );
};

export default FinancialCard;
