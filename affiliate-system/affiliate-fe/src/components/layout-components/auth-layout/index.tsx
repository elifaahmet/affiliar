import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@components/core-components/icon';

import { footerLinks, type InsightTone, newsData } from './data';

type AuthLayoutProps = {
  children: ReactNode;
};

const toneClasses: Record<
  InsightTone,
  {
    chip: string;
    glow: string;
    border: string;
  }
> = {
  sky: {
    chip: 'bg-[#EAF3FF] text-[#1D4ED8]',
    glow: 'from-[#DDEBFF] to-[#F8FAFF]',
    border: 'border-[#CFE1FF]',
  },
  emerald: {
    chip: 'bg-[#E7F8F0] text-[#047857]',
    glow: 'from-[#DDF7EA] to-[#F7FCF9]',
    border: 'border-[#CCF0DD]',
  },
  amber: {
    chip: 'bg-[#FFF4E8] text-[#B45309]',
    glow: 'from-[#FFEBD6] to-[#FFF9F2]',
    border: 'border-[#FFE2C2]',
  },
};

function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen w-full justify-between">
      <div className="flex flex-col lg:flex-row flex-grow gap-4 justify-around px-4">
        <div className="flex flex-col justify-center items-start order-2 lg:order-1 pb-4 lg:pb-0">
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
            Grow your affiliate business with Affiliar.
          </h2>
          <p className="text-sm font-medium text-gray-600 mb-9 max-w-[694px]">
            Access your affiliate workspace to track referred players, monitor commissions, and
            optimize campaign performance from one place. Built for fast decisions and clear,
            actionable insights.
          </p>
          <hr className="border-t border-[#D4D9E6] w-full mb-9" />
          <h3 className="text-2xl font-extrabold text-gray-900 mb-4">Affiliate Insights</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            {newsData.map((item, index) => {
              const tone = toneClasses[item.tone];
              return (
                <div
                  key={index}
                  className={`relative overflow-hidden rounded-2xl border ${tone.border} bg-white p-5 lg:max-w-[260px] shadow-[0px_8px_22px_rgba(16,24,40,0.08)]`}
                >
                  <div
                    className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${tone.glow} opacity-90`}
                  />
                  <div className="relative flex flex-col gap-4">
                    <span
                      className={`inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-bold ${tone.chip}`}
                    >
                      {item.focus}
                    </span>

                    <div>
                      <p className="text-lg font-extrabold text-gray-900">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-gray-600">{item.description}</p>
                    </div>

                    <div className="rounded-xl border border-dashed border-[#D8DEEA] bg-[#F8FAFD] px-3 py-2">
                      <p className="text-[11px] font-semibold text-gray-500">Note</p>
                      <p className="mt-1 text-xs text-gray-700">{item.note}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {children}
      </div>

      <footer className="h-auto py-4 w-full bg-gray-300 text-gray-700 text-sm font-bold flex items-center justify-center">
        <div className="flex justify-between items-center w-full max-w-[1700px] px-10">
          <Icon iconName="affiliar" svgProps={{ width: '280px', height: '56px' }} />
          <div className="flex flex-col text-center gap-2 sm:flex-row sm:text-left sm:gap-6 lg:gap-16">
            {footerLinks.map((link, index) => (
              <Link key={index} to={link.to} className="underline">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AuthLayout;
