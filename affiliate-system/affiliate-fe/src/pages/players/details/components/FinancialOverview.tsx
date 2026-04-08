import React, { useEffect, useState } from 'react';
import PIDropDown from '@components/core-components/dropdown';
import { useAppSelector } from 'hooks/redux';

import FinancialBreakdown from './FinancialBreakdown';
import FinancialCard from './FinancialCard';

const player = {
  profitability: '8.71%',
  grossGamingRevenue: '-€377,00',
  sportsBookAmount: '€1.740,00',
  casinoAmount: '€690,00',
  exchangeAmount: '€185,00',
};

const getWalletTotal = (wallet: any) => {
  const total = wallet?.total;
  if (total && typeof total === 'object' && '$numberDecimal' in total) {
    return parseFloat(total.$numberDecimal);
  }
  const parsed = Number(total);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatWalletAmount = (wallet: any) => {
  if (!wallet) return 'N/A';
  const symbol = wallet?.currency?.symbol ?? '';
  const totalNumber = getWalletTotal(wallet);
  return `${symbol}${totalNumber.toFixed(2)}`;
};

const formatBonusAmount = (wallet: any) => {
  if (!wallet) return 'N/A';
  const symbol = wallet?.currency?.symbol ?? '';
  const totalNumber = Number(wallet?.bonus_balance ?? 0);
  return `${symbol}${totalNumber.toFixed(2)}`;
};

const FinancialOverview: React.FC = () => {
  const [selectedOption, setSelectedOption] = useState('');
  const [balance, setBalance] = useState<string>('');
  const allWallets = useAppSelector((state) => state.sharedData.allWallets);
  const [bonusWallet, setBonusWallet] = useState<any>(null);

  useEffect(() => {
    const selectedWallet = allWallets?.find(
      (wallet: any) => wallet.currency?.code === selectedOption
    );

    if (selectedWallet) {
      setBalance(formatWalletAmount(selectedWallet));
      setBonusWallet(selectedWallet);
      return;
    }

    if (!selectedOption && allWallets?.length) {
      const defaultWallet =
        allWallets.find((wallet: any) => wallet.isActive)?.currency?.code ||
        allWallets[0]?.currency?.code;
      if (defaultWallet) {
        setSelectedOption(defaultWallet);
      }
    } else {
      setBonusWallet(null);
    }
  }, [allWallets, selectedOption]);

  const options = allWallets?.map((wallet: any) => ({
    value: wallet.currency?.code,
    label: wallet.currency?.code,
  }));

  const financialData = [
    {
      color: 'bg-primary',
      amount: balance,
      label: 'Real Money Wallet',
      dropDown: (
        <PIDropDown
          options={options}
          value={selectedOption}
          onChange={(value) => {
            setSelectedOption(value);
          }}
          dropDownlistClassNames="w-[185px] top-[60px] right-[0px]"
          className="h-6 w-6"
        />
      ),
    },
    {
      color: 'bg-success-dark',
      amount: formatBonusAmount(bonusWallet),
      label: 'Bonus Wallet',
    },
    {
      color: 'bg-yellow',
      amount: player.profitability,
      label: 'Player Profitability For Us',
      statusName: 'inactive',
    },
    {
      color: 'bg-danger',
      amount: player.grossGamingRevenue,
      label: 'Gross Gaming Revenue',
      statusName: 'inactive',
    },
  ];

  const breakdownData = [
    {
      name: 'Sportsbook',
      value: parseFloat(player.sportsBookAmount.replace(/[^0-9.-]+/g, '')),
      color: '#3D8AFF',
      statusName: 'inactive',
    },
    {
      name: 'Casino',
      value: parseFloat(player.casinoAmount.replace(/[^0-9.-]+/g, '')),
      color: '#E600FF',
      statusName: 'inactive',
    },
    {
      name: 'Exchange',
      value: parseFloat(player.exchangeAmount.replace(/[^0-9.-]+/g, '')),
      color: '#33CC33',
      statusName: 'inactive',
    },
  ];

  return (
    <section className="flex flex-row grow gap-1 shrink w-full max-md:max-w-full h-[140px]">
      <div className="grid grid-cols-2 min-w-[530px] gap-1 max-md:grid-cols-1 w-full">
        {financialData.map((data, index) => (
          <FinancialCard key={index} {...data} />
        ))}
      </div>
      <FinancialBreakdown data={breakdownData} />
    </section>
  );
};

export default FinancialOverview;
