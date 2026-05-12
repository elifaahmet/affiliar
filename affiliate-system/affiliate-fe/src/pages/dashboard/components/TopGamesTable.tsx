import React from 'react';
import Icon from '@components/core-components/icon';

import { Top5GamesType } from './Top5Games';

interface TopGamesTableProps {
  data?: Top5GamesType;
  label?: string;
  profit: boolean;
}

function TopGamesTable(props: TopGamesTableProps) {
  const { data, label } = props;
  return (
    <>
      <div className="border border-gray-300">
        <h4 className="bg-[#EEF2F4] py-2 px-3 text-sm font-bold text-[#78829D]">{label}</h4>
        {data?.games && data.games.length > 0 ? (
          React.Children.toArray(
            data?.games?.map((item) => (
              <div className="py-[18px] px-3 border-b border-gray-300 last:border-0 grid grid-cols-[2fr_1fr_1fr] gap-2">
                <div className="flex gap-4 items-center overflow-hidden">
                  <div className="relative flex h-[67px] w-[50px] flex-shrink-0 rounded-md overflow-hidden bg-gray-100">
                    {item.game.url_thumb ? (
                      <img
                        src={item.game.url_thumb}
                        alt={item.game.game_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-600">
                        No Image
                      </div>
                    )}
                  </div>
                  <h5 className="text-gray-900 text-sm font-bold truncate">
                    {item.game.game_name}
                  </h5>{' '}
                </div>
                <div className="flex items-center overflow-hidden">
                  <h5 className="text-gray-700 text-xs truncate ">{item.game.provider}</h5>
                </div>

                <div className="flex items-center">
                  <div
                    className={`flex gap-1 text-gray-900 font-bold text-sm items-center py-2 px-[10px] ${
                      item.total >= 0 ? 'bg-success-light' : 'bg-danger-light'
                    } rounded-lg`}
                  >
                    <span
                      className={`w-[21px] h-[21px] flex items-center justify-center ${
                        item.total >= 0 ? 'rotate-0' : 'rotate-180'
                      }`}
                    >
                      <Icon
                        iconName="arrowBg"
                        svgProps={{
                          width: '21px',
                          height: '21px',
                        }}
                        className={item.total >= 0 ? 'success-icon-arrow' : 'danger-icon-arrow'}
                      />
                    </span>
                    <span>
                      {data.currency.symbol}
                      {item.total}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )
        ) : (
          <div className="py-4 px-3 text-center text-sm text-gray-700">No data available</div>
        )}
      </div>
    </>
  );
}

export default TopGamesTable;
