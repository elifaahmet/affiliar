import React from 'react';
import Icon from '@components/core-components/icon';
import { format } from 'date-fns';
import { useAppSelector } from 'hooks/redux';

const PlayerInfo: React.FC = () => {
  const player = useAppSelector((state) => state.sharedData.player);
  // const trends = [
  //   {
  //     text: "Very High Tendency",
  //     style: "bg-[#FF4B551A] border-[#FF4B55] text-[#FF4B55]",
  //     icon: "highTendency",
  //   },
  //   {
  //     text: "High Tendency",
  //     style: "bg-[#FF4B551A] border-[#FF4B55] text-[#FF4B55]",
  //     icon: "highTendency",
  //   },
  //   {
  //     text: "Medium Tendency",
  //     style: "bg-[#1B84FF1A] border-[#1B84FF] text-[#1B84FF]",
  //     icon: "mediumTendency",
  //   },
  //   {
  //     text: "Mid Tendency",
  //     style: "bg-[#1B84FF1A] border-[#1B84FF] text-[#1B84FF]",
  //     icon: "mediumTendency",
  //   },
  //   {
  //     text: "Low Tendency",
  //     style: "bg-[#17C6531A] border-[#17C653] text-[#17C653]",
  //     icon: "lowTendency",
  //   },
  // ];
  // const trend =
  //   trends.find((t) => t.text === player?.verifyLevel) ||
  //   trends[Math.floor(Math.random() * trends.length)];

  return (
    <section className="flex p-3 bg-white h-full rounded-lg border border-[#F1F1F4] border-solid shadow-[0px_3px_4px_0px_rgba(0,0,0,0.03)] grow shrink gap-6 items-center min-w-[240px] w-full max-md:max-w-full">
      <div className="flex flex-col self-stretch my-auto text-6xl font-semibold text-center text-white whitespace-nowrap rounded-lg max-md:text-4xl">
        <div className="w-[105px] h-[105px] bg-primary rounded-lg max-md:text-4xl justify-start content-center">
          {player?.username
            ?.split(' ')
            .map((name) => name[0])
            .join('')
            .toUpperCase()}
        </div>
      </div>
      <div className="flex flex-col gap-2 self-stretch justify-center w-full">
        <div className="flex flex-row max-w-full w-full gap-2">
          <div className="flex gap-2 items-center w-full text-xl font-extrabold text-gray-900">
            <div className="self-stretch my-auto">{player?.username}</div>
            <Icon iconName="verifiedTick" svgProps={{ width: 18, height: 18 }} />
          </div>
          {/* {trend && (
            <div
              className={`flex items-center justify-center h-[30px] w-fit p-2 text-xs font-medium border border-solid rounded-[4px] whitespace-nowrap ${trend.style}`}
            >
              {trend.text}
            </div>
          )} */}
        </div>
        <div className="flex flex-col gap-3 items-start w-full text-sm font-normal leading-4 text-gray-600">
          <div className="flex gap-2 items-center justify-between  rounded-md w-full">
            <div className="flex gap-1 items-center self-stretch my-auto">
              <Icon iconName="playerCircle" svgProps={{ width: 16, height: 16 }} />
              <div className="self-stretch my-auto">Player ID</div>
            </div>
            <div className="flex-grow  pt-2  border-b border-dashed border-gray-400 mx-2" />

            <div className="flex gap-1 items-center self-stretch my-auto">
              <div className="self-stretch my-auto ">{player?.id}</div>
            </div>
          </div>

          <div className="flex gap-2 items-center justify-between  rounded-md w-full">
            <div className="flex gap-1 items-center self-stretch my-auto">
              <Icon iconName="referal" svgProps={{ width: 16, height: 16, fill: '#45A9EF' }} />
              <div className="self-stretch my-auto">Register Date</div>
            </div>
            <div className="flex-grow border-b  pt-2  border-dashed border-gray-400 mx-2" />

            <div className="flex gap-1 items-center self-stretch my-auto">
              <div className="self-stretch my-auto">
                {player?.expiryDate ? format(new Date(player?.expiryDate), 'dd MMM yyyy') : '-'}
              </div>
            </div>
          </div>
          <div className="flex gap-2 items-center justify-between rounded-md w-full">
            <div className="flex gap-1 items-center self-stretch my-auto">
              <Icon iconName="country" svgProps={{ width: 16, height: 16, fill: '#45A9EF' }} />
              <div className="self-stretch my-auto">Country</div>
            </div>
            <div className="flex-grow border-b pt-2 border-dashed border-gray-400 mx-2" />
            <div className="flex gap-1 items-center self-stretch my-auto">
              <div className="self-stretch my-auto">{player?.verify1?.countryName || 'Earth'}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PlayerInfo;
