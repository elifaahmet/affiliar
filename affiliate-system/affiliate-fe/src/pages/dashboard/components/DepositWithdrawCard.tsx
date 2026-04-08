import React from 'react';
import Icon from '@components/core-components/icon';
import TabComponent from '@components/core-components/tabs';
import { statusMapper } from 'utils/common/statusMapper';

import EntroPayLogo from '../../../assets/images/entropay.png';
import SkrillLogo from '../../../assets/images/skrill.png';
import SticpayLogo from '../../../assets/images/sticpay.png';

const data = [
  {
    id: 1,
    icon: SkrillLogo,
    title: 'Skrill Payment',
    amount: '€ 2.248.00,00',
  },
  {
    id: 2,
    icon: EntroPayLogo,
    title: 'Entro Pay',
    amount: '€ 475.500,00',
  },
  {
    id: 3,
    icon: SticpayLogo,
    title: 'Sticpay',
    amount: '€ 600.500,00',
  },
];

const DepositWithdrawCard: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState('Deposit');
  const tabs = [
    { label: 'Deposit', status: 'inactive' },
    { label: 'Withdrawals', status: 'inactive' },
  ];
  return (
    <div
      className="bg-white rounded-[10px] p-6 overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex flex-row items-center justify-between mb-8">
        <span className="text-base font-extrabold text-gray-900">
          Popular Payment Methods {statusMapper['inactive']}
        </span>
        <button className="text-xs font-bold text-primary bg-primary-light h-7 min-w-20 px-3 rounded-md hover:bg-primary-medium">
          View all
        </button>
      </div>

      <ul className="flex flex-col w-full">
        <TabComponent
          tabs={tabs}
          activeTab={activeTab}
          onTabClick={(tab) => setActiveTab(tab.label)}
          buttonWidth="w-full"
          type="withBackground"
        />
        <div className="flex w-full pb-5 border-b border-dashed border-borderColor"></div>
        {data.map((item, _index) => (
          <li
            key={item.id}
            className={`flex items-center justify-between bg-white py-4 border-b border-dashed border-borderColor`}
          >
            <div className="flex items-center space-x-4">
              <span
                className={`flex w-11 h-11 p-1 border border-[#CECCE4] items-center justify-center text-white rounded-lg`}
              >
                <img src={item.icon} alt="icon" className="object-contain" />
              </span>
              <div>
                <p className="text-xs font-bold text-gray-600">{item.title}</p>
                <p className="text-xl font-extrabold text-gray-900">{item.amount}</p>
              </div>
            </div>
            <Icon iconName="arrowRightWithBg" svgProps={{ width: 20, height: 20 }} />
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DepositWithdrawCard;
