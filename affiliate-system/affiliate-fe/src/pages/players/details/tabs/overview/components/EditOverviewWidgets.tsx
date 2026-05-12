import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@components/core-components/icon';

import OverviewWidgetGrid from './OverviewWidgetGrid';

const defaultLayout = [
  // Row 0 — hero row (8 + 4 = 12), height = 7.5
  { i: 'liveStats', x: 0, y: 0.0, w: 8, h: 7.5, minW: 6, minH: 7 },
  { i: 'profitTable', x: 8, y: 0.0, w: 4, h: 7.5, minW: 3, minH: 7.5 },

  // Row 1 — Top 5 Providers full-width, starts at 7.5, height = 8.5 → next y = 16.0
  { i: 'top5Providers', x: 0, y: 7.5, w: 12, h: 8.5, minW: 5, minH: 8.5 },

  // Row 2 — Top 5 Games full-width, starts at 16.0, height = 11 → next y = 27.0
  { i: 'top5Games', x: 0, y: 16.0, w: 12, h: 11.0, minW: 5, minH: 8 },

  // Row 3 — insights split (6 + 6), starts at 27.0, height = 9.5 → next y = 36.5
  { i: 'bettingInsights', x: 0, y: 27.0, w: 6, h: 9.5, minW: 6, minH: 9.5 },
  { i: 'sportsbookOverview', x: 6, y: 27.0, w: 6, h: 9.5, minW: 6, minH: 9.5 },

  // Row 4 — charts (4 + 8), starts at 36.5, height = 6.5 → next y = 43.0
  { i: 'dailyRakeChart', x: 0, y: 36.5, w: 4, h: 6.5, minW: 4, minH: 6.5 },
  { i: 'barChart', x: 4, y: 36.5, w: 8, h: 6.5, minW: 5.4, minH: 6.5 },

  // Row 5 — full-width band, starts at 43.0, height = 5 → next y = 48.0
  { i: 'popularSports', x: 0, y: 43.0, w: 12, h: 5.0, minW: 8, minH: 5 },

  // Row 6 — overview split (6 + 6), starts at 48.0, row height = 6.5 → next y = 54.5
  { i: 'casinoOverview', x: 0, y: 48.0, w: 6, h: 6.5, minW: 4, minH: 6.5 },
  { i: 'pokerOverview', x: 6, y: 48.0, w: 6, h: 6.5, minW: 4, minH: 6.5 },

  // Row 7 — three equal cards (4 + 4 + 4), starts at 54.5, height = 7
  { i: 'activityCard1', x: 0, y: 54.5, w: 4, h: 7.0, minW: 3, minH: 7 },
  { i: 'activityCard2', x: 4, y: 54.5, w: 4, h: 7.0, minW: 3, minH: 7 },
  { i: 'depositWithdrawCard', x: 8, y: 54.5, w: 4, h: 7.0, minW: 3, minH: 7 },
];

export default function EditOverviewdWidgets() {
  const navigate = useNavigate();
  const [layout, setLayout] = useState<any[]>(defaultLayout);
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const savedLayout = localStorage.getItem('overview-layout');
    if (savedLayout) {
      setLayout(JSON.parse(savedLayout));
    } else {
      setLayout(defaultLayout);
    }
  }, []);

  return (
    <div className="flex flex-col w-full min-w-full max-w-full pb-48 gap-5 px-8 bg-gray-100">
      <span className="text-2xl font-extrabold px-5 pt-8">EDIT OVERVIEW WIDGET LAYOUTS</span>
      <OverviewWidgetGrid
        layout={layout}
        setLayout={setLayout}
        editable={true}
        windowWidth={windowWidth - 180}
      />

      {!isModalOpen && (
        <div
          className="w-full h-20 flex justify-end items-center gap-4 px-8 py-4 bg-white border-t border-gray-200 text-body-reg-13 "
          style={{
            position: 'fixed',
            left: 0,
            bottom: 0,
            zIndex: 50,
            boxShadow: '0px -4px 6px 0px rgba(0, 0, 0, 0.05)',
          }}
        >
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-4 w-44 rounded-lg border border-danger text-danger hover:bg-danger-light font-semibold transition"
          >
            Cancel
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-6 py-4 w-44 rounded-lg bg-primary-light text-primary text-body-reg-13 font-semibold hover:bg-primary-medium transition"
          >
            Add Widget
          </button>
          <button
            onClick={() => {
              localStorage.setItem('overview-layout', JSON.stringify(layout));
              navigate(-1);
            }}
            className="px-6 py-4 w-44 rounded-lg bg-primary text-white text-body-reg-13 font-semibold hover:bg-primary-dark transition"
          >
            Save Widgets
          </button>
        </div>
      )}

      {/* Add Widget Box (appears only if not all widgets are added) */}
      {!isModalOpen && layout.length < defaultLayout.length && (
        <div className="w-[98%] ml-3 flex justify-center items-center p-6 border border-borderColor rounded-[10px]">
          <div
            onClick={() => setIsModalOpen(true)}
            className="w-full h-40 bg-gray-300 border border-gray-600 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-400 transition"
          >
            <span className="text-base font-semibold">+ Add Widget</span>
            <span className="text-gray-700 text-sm">Select from the adjacent list</span>
          </div>
        </div>
      )}

      {/* Drawer-style Add Widget */}
      {isModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-30 z-40"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="fixed top-0 right-0 h-full w-[496px] bg-white shadow-lg border-l border-gray-200 z-50 flex flex-col">
            <div className="flex justify-between items-center py-7 border-b border-borderColor">
              <span className="font-semibold text-xl pl-10">Add Widget</span>
              <button onClick={() => setIsModalOpen(false)} className="mr-10">
                <Icon iconName="close" svgProps={{ width: 32, height: 32 }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-10 pt-4 pb-20">
              <div className="space-y-4">
                {[
                  {
                    i: 'bettingInsights',
                    name: 'Betting Insights',
                    preview: (
                      <div className="flex flex-col py-3 px-4 gap-3">
                        <div className="flex flex-row gap-3">
                          <div className="flex w-full h-6 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-6 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-6 bg-[#F1F1F2] rounded"></div>
                        </div>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="384"
                          height="81"
                          viewBox="0 0 384 81"
                          fill="none"
                        >
                          <path
                            d="M0 11.7592H9.18463C15.1261 11.7592 20.76 14.4009 24.5599 18.9685L32.256 28.2197C33.997 30.3125 36.5785 31.5229 39.3009 31.5229V31.5229C42.1546 31.5229 44.8455 32.8524 46.5794 35.119L49.3587 38.7521C50.983 40.8754 53.5038 42.1209 56.1772 42.1209V42.1209C58.6324 42.1209 60.9701 41.0697 62.5994 39.233L75.09 25.1526C76.7183 23.3172 79.0545 22.2667 81.508 22.2667V22.2667C83.9812 22.2667 86.3341 23.3339 87.9632 25.1948L90.6175 28.2266C92.4526 30.3228 95.1031 31.5251 97.8891 31.5251V31.5251C100.996 31.5251 103.914 33.0188 105.73 35.5395L114.575 47.8131C116.135 49.9789 118.642 51.2623 121.311 51.2623V51.2623C123.787 51.2623 126.134 50.1575 127.712 48.2492L130.084 45.3791C131.79 43.3156 134.328 42.1209 137.005 42.1209V42.1209C139.782 42.1209 142.403 40.8357 144.104 38.64L169.643 5.66603C171.339 3.47673 173.952 2.19531 176.722 2.19531V2.19531C179.738 2.19531 182.551 3.71391 184.206 6.23531L191.946 18.0266C193.683 20.6729 196.636 22.2667 199.801 22.2667V22.2667C202.943 22.2667 205.877 23.8369 207.62 26.4511L207.913 26.8912C209.839 29.7804 213.109 31.5158 216.581 31.5158V31.5158C219.847 31.5158 222.951 29.9939 224.934 27.3995L233.947 15.6101C235.802 13.183 238.682 11.7592 241.737 11.7592V11.7592C245.019 11.7592 248.084 13.4009 249.902 16.1333L264.218 37.6496C266.077 40.4426 269.209 42.1209 272.564 42.1209V42.1209C275.684 42.1209 278.626 40.668 280.523 38.1906L282.323 35.8395C284.411 33.1131 287.649 31.5142 291.083 31.5142V31.5142C295.087 31.5142 298.777 33.6842 300.724 37.1838L305.846 46.3933C307.522 49.4065 310.699 51.2749 314.147 51.2749V51.2749C317.46 51.2749 320.534 49.5484 322.258 46.7189L333.902 27.6101C335.924 24.2916 339.529 22.2667 343.415 22.2667V22.2667C346.85 22.2667 350.092 23.8506 352.203 26.5596L352.458 26.8866C354.729 29.802 358.219 31.5066 361.915 31.5066H383.999"
                            stroke="#1B84FF"
                            strokeOpacity="0.5"
                            strokeWidth="3"
                          />
                        </svg>
                      </div>
                    ),
                  },
                  {
                    i: 'pieChart',
                    name: 'Casino Insights',
                    preview: (
                      <div className="flex flex-row py-6 px-4 gap-1 items-start">
                        <Icon iconName="graySkeletonLines" svgProps={{ width: 211, height: 97 }} />
                        <Icon
                          iconName="colorfulSkeletonLines"
                          svgProps={{ width: 67, height: 92 }}
                        />
                        <div className="flex h-24 w-24 rounded-full bg-[#D0EEDA]" />
                      </div>
                    ),
                  },
                  {
                    i: 'financialInsights',
                    name: 'Financial Insights',
                    preview: (
                      <div className="flex flex-col w-full py-6 px-4 gap-3 ">
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                      </div>
                    ),
                  },
                  {
                    i: 'playerActivities',
                    name: 'Activity',
                    preview: (
                      <div className="flex flex-col items-center justify-center gap-2 py-6 px-4">
                        <div className="w-full grid grid-cols-9 gap-1 pl-2">
                          {Array.from({ length: 63 }).map((_, idx) => (
                            <div key={idx} className="w-3 h-3 bg-gray-300 rounded-[2px]" />
                          ))}
                        </div>
                      </div>
                    ),
                  },
                  {
                    i: 'dailyRakeChart',
                    name: 'Daily Rake',
                    preview: (
                      <div className="flex flex-row py-6 px-4 gap-3">
                        <div className="flex flex-col gap-2 w-full">
                          <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        </div>
                        <div className="flex flex-col gap-2 w-full">
                          <div className="flex w-[255px] h-3 bg-[#D0EEDA] rounded" />
                          <div className="flex w-[215px] h-3 bg-[#D0EEDA] rounded" />
                          <div className="flex w-[173px] h-3 bg-[#D0EEDA] rounded" />
                          <div className="flex w-[133px] h-3 bg-[#D0EEDA] rounded" />
                          <div className="flex w-[75px] h-3 bg-[#D0EEDA] rounded" />
                        </div>
                        <div className="flex flex-col gap-2 w-full">
                          <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    i: 'sportsbookOverview',
                    name: 'Sportsbook Overview',
                    preview: (
                      <div className="flex flex-col w-full py-6 px-4 gap-3">
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                      </div>
                    ),
                  },
                  {
                    i: 'activityCard2',
                    name: 'Payment Activities',
                    preview: (
                      <div className="flex flex-row py-3 px-4 gap-3 items-start justify-between">
                        <Icon iconName="graySkeletonLines" svgProps={{ width: 211, height: 97 }} />
                        <Icon
                          iconName="colorfulSkeletonLines"
                          svgProps={{ width: 67, height: 92 }}
                        />
                      </div>
                    ),
                  },
                  {
                    i: 'profitTable',
                    name: 'Profit',
                    preview: (
                      <div className="flex flex-row py-6 px-4 gap-3 items-start">
                        <Icon iconName="graySkeletonLines" svgProps={{ width: 211, height: 97 }} />
                        <Icon
                          iconName="colorfulSkeletonLines"
                          svgProps={{ width: 67, height: 92 }}
                        />
                        <Icon
                          iconName="colorfulSkeletonLines"
                          svgProps={{ width: 67, height: 92 }}
                        />
                      </div>
                    ),
                  },

                  {
                    i: 'casinoOverview',
                    name: 'Casino Overview',
                    preview: (
                      <div className="flex flex-col w-full py-6 px-4 gap-3">
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                      </div>
                    ),
                  },
                  {
                    i: 'barChart',
                    name: 'Placed Bets',
                    preview: (
                      <div className="flex flex-col py-6 px-4 gap-3">
                        <div className="flex flex-row gap-3 w-full items-end">
                          <div className="flex w-5 h-24 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-20 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-10 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-10 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-24 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-24 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-16 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-14 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-14 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-12 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-24 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-20 bg-[#D0EEDA] rounded"></div>
                          <div className="flex w-5 h-24 bg-[#D0EEDA] rounded"></div>
                        </div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                      </div>
                    ),
                  },
                  {
                    i: 'depositWithdrawCard',
                    name: 'Popular Payment Methods',
                    preview: (
                      <div className="flex flex-col py-3 px-4 gap-3">
                        <div className="flex flex-row gap-3">
                          <div className="flex w-full h-6 bg-[#F1F1F2] rounded"></div>
                          <div className="flex w-full h-6 bg-[#F1F1F2] rounded"></div>
                        </div>
                        <div className="flex flex-row gap-3 items-start justify-between">
                          <Icon
                            iconName="graySkeletonLines"
                            svgProps={{ width: 211, height: 97 }}
                          />
                          <Icon
                            iconName="colorfulSkeletonLines"
                            svgProps={{ width: 67, height: 92 }}
                          />
                        </div>
                      </div>
                    ),
                  },
                  {
                    i: 'activityCard1',
                    name: 'For a Quick Glance',
                    preview: (
                      <div className="flex flex-row py-3 px-4 gap-3 items-start justify-between">
                        <Icon iconName="graySkeletonLines" svgProps={{ width: 211, height: 97 }} />
                        <Icon
                          iconName="colorfulSkeletonLines"
                          svgProps={{ width: 67, height: 92 }}
                        />
                      </div>
                    ),
                  },
                  {
                    i: 'pokerOverview',
                    name: 'Poker Overview',
                    preview: (
                      <div className="flex flex-col w-full py-6 px-4 gap-3">
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                        <div className="flex w-full h-3 bg-[#F1F1F2] rounded"></div>
                      </div>
                    ),
                  },
                  {
                    i: 'popularSports',
                    name: 'Top 5 Sports',
                    preview: (
                      <div className="flex flex-row py-3 px-4 gap-3">
                        <div className="flex w-full h-24 bg-[#a7b3ee] rounded"></div>
                        <div className="flex w-full h-24 bg-[#e8dac5] rounded"></div>
                        <div className="flex w-full h-24 bg-[#D0EEDA] rounded"></div>
                        <div className="flex w-full h-24 bg-[#f4cfcf] rounded"></div>
                        <div className="flex w-full h-24 bg-[#F1F1F2] rounded"></div>
                      </div>
                    ),
                  },
                ].map((widget) => {
                  const isAdded = layout.some((l) => l.i === widget.i);
                  return (
                    <div
                      key={widget.i}
                      className="border border-borderColor rounded-[10px] bg-white"
                    >
                      <div className="flex justify-between items-center border-b border-borderColor p-4">
                        <span className="text-gray-900 font-semibold text-sm">{widget.name}</span>
                        {isAdded ? (
                          <button
                            className="px-4 py-1 w-16 text-xs font-semibold text-white rounded shadow-sm bg-primary"
                            disabled
                          >
                            Added
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const defaultItem = defaultLayout.find(
                                  (item) => item.i === widget.i
                                );
                                if (defaultItem) {
                                  setLayout([
                                    ...layout,
                                    {
                                      ...defaultItem,
                                      x: 0,
                                      y: Infinity,
                                    },
                                  ]);
                                }
                                setIsModalOpen(false);
                              }}
                              className="px-4 py-1 w-16 text-xs font-semibold text-primary rounded shadow-sm bg-primary-light hover:bg-primary-medium"
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                      {widget.preview}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
