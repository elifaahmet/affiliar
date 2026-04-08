import React, { useState } from 'react';
import { Chart } from 'react-google-charts';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';
import { getBrandingConfig } from 'config/brandConfig';
import { statusMapper } from 'utils/common/statusMapper';

const countryData = {
  'United States': {
    name: 'United States of America',
    flag: 'https://upload.wikimedia.org/wikipedia/en/a/a4/Flag_of_the_United_States.svg',
    stats: [
      { label: 'Turnover', value: '€12,385,000' },
      { label: 'Player Wins', value: '12,467' },
      { label: 'Player Returns', value: '71%', isBadge: true },
      { label: 'Open Bets', value: '1,742' },
      { label: 'Our Profitability', value: '€9,799,000' },
    ],
  },
  'United Kingdom': {
    name: 'United Kingdom',
    flag: 'https://upload.wikimedia.org/wikipedia/en/a/ae/Flag_of_the_United_Kingdom.svg',
    stats: [
      { label: 'Turnover', value: '€9,800,000' },
      { label: 'Player Wins', value: '10,320' },
      { label: 'Player Returns', value: '71%', isBadge: true },
      { label: 'Open Bets', value: '1,220' },
      { label: 'Our Profitability', value: '€7,800,000' },
    ],
  },
  Germany: {
    name: 'Germany',
    flag: 'https://upload.wikimedia.org/wikipedia/en/b/ba/Flag_of_Germany.svg',
    stats: [
      { label: 'Turnover', value: '€7,500,000' },
      { label: 'Player Wins', value: '8,210' },
      { label: 'Player Returns', value: '71%', isBadge: true },
      { label: 'Open Bets', value: '950' },
      { label: 'Our Profitability', value: '€6,000,000' },
    ],
  },
  France: {
    name: 'France',
    flag: 'https://upload.wikimedia.org/wikipedia/en/c/c3/Flag_of_France.svg',
    stats: [
      { label: 'Turnover', value: '€6,200,000' },
      { label: 'Player Wins', value: '7,430' },
      { label: 'Player Returns', value: '71%', isBadge: true },
      { label: 'Open Bets', value: '870' },
      { label: 'Our Profitability', value: '€5,000,000' },
    ],
  },
  Spain: {
    name: 'Spain',
    flag: 'https://upload.wikimedia.org/wikipedia/en/9/9a/Flag_of_Spain.svg',
    stats: [
      { label: 'Turnover', value: '€4,800,000' },
      { label: 'Player Wins', value: '5,890' },
      { label: 'Player Returns', value: '71%', isBadge: true },
      { label: 'Open Bets', value: '620' },
      { label: 'Our Profitability', value: '€4,000,000' },
    ],
  },
};

const geoData = [
  ['Country', 'Turnover (€)', 'Our Profitability (€)'],
  ['United States', 12385000, 9799000],
  ['United Kingdom', 9800000, 7800000],
  ['Germany', 7500000, 6000000],
  ['France', 6200000, 5000000],
  ['Spain', 4800000, 4000000],
];

const baseTypeOptions: { value: string; label: string }[] = [
  { value: 'Sportsbook', label: 'Sportsbook' },
  { value: 'Casino', label: 'Casino' },
  { value: 'Exchange', label: 'Exchange' },
];

const LiveStatisticsByCountry = () => {
  const {
    config: { features },
  } = getBrandingConfig();
  const hiddenLiveStatTypes = features?.hiddenLiveStatTypes;

  const options = React.useMemo(() => {
    const hiddenTypes = hiddenLiveStatTypes ?? [];
    return baseTypeOptions.filter(({ value }) => !hiddenTypes.includes(value));
  }, [hiddenLiveStatTypes]);

  const [selectedOption, setSelectedOption] = React.useState<string>(options[0]?.value ?? '');
  const [selectedCountry, setSelectedCountry] = useState<keyof typeof countryData>('United States');
  React.useEffect(() => {
    if (!options.some((option) => option.value === selectedOption) && options[0]) {
      setSelectedOption(options[0].value);
    }
  }, [options, selectedOption]);

  const handleRegionClick = (region: string) => {
    const availableCountries = Object.keys(countryData) as (keyof typeof countryData)[];

    if (availableCountries.includes(region as keyof typeof countryData)) {
      setSelectedCountry(region as keyof typeof countryData);
    }
  };
  const geoOptions = {
    colorAxis: { colors: ['#f0f0f0', '#1976D2'] },
    backgroundColor: 'transparent',
    datalessRegionColor: '#E0E0E0',
    defaultColor: '#f5f5f5',
    legend: 'none',
  };

  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex flex-col p-6">
        <div className="flex flex-row justify-between items-center pb-2 border-b border-dashed border-borderColor">
          <span className="text-base font-extrabold text-gray-900">
            Live Statistics By Country {statusMapper['inactive']}
          </span>
          <BSelectWithSearch
            label="Type"
            options={options}
            value={selectedOption}
            onChange={setSelectedOption}
            showSearch={false}
            classname="h-full w-[237px]"
          />
        </div>
        <div className="flex flex-col lg:flex-row gap-4 mt-6 w-full">
          <div className="flex w-full">
            <ul className="flex flex-col w-full list-none p-0">
              <li className="border-b border-dashed border-borderColor pb-6 gap-4 flex items-center">
                <div className="flex-shrink-0 w-8 h-8 rounded-full">
                  <img
                    className="w-8 h-8 rounded-full object-cover"
                    src={countryData[selectedCountry].flag}
                    alt="Country Flag"
                  />
                </div>
                <span className="text-sm font-medium text-gray-700">
                  {countryData[selectedCountry].name}
                </span>
              </li>

              {countryData[selectedCountry].stats.map((stat, index) => (
                <li
                  key={index}
                  className={`flex justify-between items-center ${
                    index !== countryData[selectedCountry].stats.length - 1
                      ? 'border-b border-dashed border-borderColor'
                      : ''
                  } py-4`}
                >
                  <span className="text-sm font-medium text-gray-700">{stat.label}</span>
                  <span className="text-sm font-bold text-gray-900">{stat.value}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex w-full col-span-2">
            <div className="w-full h-full max-h-80 rounded-2xl items-center justify-center">
              <Chart
                chartType="GeoChart"
                width="100%"
                height="100%"
                data={geoData}
                options={geoOptions}
                chartEvents={[
                  {
                    eventName: 'select',
                    callback: ({ chartWrapper }) => {
                      if (!chartWrapper) return;
                      const chart = chartWrapper.getChart();
                      const selection = chart.getSelection();
                      if (selection.length > 0) {
                        const selectedRow = selection[0].row;
                        if (selectedRow !== null && selectedRow !== undefined) {
                          const countryName = geoData[selectedRow + 1][0] as string;
                          handleRegionClick(countryName);
                        }
                      }
                    },
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveStatisticsByCountry;
