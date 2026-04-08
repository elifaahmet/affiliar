import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@components/core-components/icon';

const Widget = ({
  icon,
  title,
  value,
  change,
  changeType,
  linked = false,
  backgroundColor,
  type = 'default',
  height = 'h-24',
}: {
  icon?: string;
  title: string;
  value: string;
  linked?: boolean;
  change: string;
  changeType: string;
  backgroundColor?: string;
  type?: 'default' | 'none' | 'dashed';
  height?: string;
  dateRange?: { startDate: Date | null; endDate: Date | null };
}) => {
  const isNone = type === 'none' || changeType === 'none';
  const isDashed = type === 'dashed';
  const [, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleNavigation = () => {
    if (!linked) return;

    if (title === 'Total of deposits' || title === 'Total of withdrawals') {
      navigate('/dashboard');
    }
  };

  useEffect(() => {
    const openModal = () => setIsModalOpen(true);
    window.addEventListener('open-widget-edit-modal', openModal);
    return () => window.removeEventListener('open-widget-edit-modal', openModal);
  }, []);
  return (
    <div
      className={`flex relative bg-white rounded-[10px] overflow-hidden w-full ${height} items-center ${
        isNone ? 'justify-center p-2' : 'justify-between px-4 py-5'
      } ${isDashed ? 'border border-dashed border-borderColor' : ''} ${
        linked && !isNone && !isDashed ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''
      }`}
      style={{
        boxShadow: isDashed ? 'none' : '0px 2px 6px 0px rgba(0, 0, 0, 0.10)',
      }}
      onClick={linked && !isNone && !isDashed ? handleNavigation : undefined}
    >
      {isNone ? (
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              const event = new CustomEvent('open-widget-edit-modal');
              window.dispatchEvent(event);
            }
          }}
          className="flex flex-row items-center justify-center gap-2 bg-white text-gray-700 border border-dashed border-borderColor w-full h-full rounded-lg"
        >
          <Icon iconName="editPen" svgProps={{ width: 24, height: 24 }} />
          <span className="text-sm font-bold text-gray-700">Edit Data</span>
        </button>
      ) : isDashed ? (
        <div
          className={`flex items-center w-full bg-white ${linked ? 'cursor-pointer' : ''}`}
          onClick={linked ? handleNavigation : undefined}
        >
          <div className="flex flex-row items-center justify-between w-full">
            <div className="flex items-center">
              <div
                className={`flex items-center justify-center rounded-lg mr-4 h-10 w-1 ${backgroundColor}`}
              ></div>
              <div className="flex flex-col overflow-hidden">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-gray-600">{title}</span>
                  {linked && <Icon iconName="arrowRight" svgProps={{ width: 16, height: 16 }} />}
                </div>
                <span className="text-xl font-extrabold text-gray-900 truncate">{value}</span>
              </div>
            </div>
            {changeType === 'positive' ? (
              <Icon iconName="greenUp" svgProps={{ width: 18, height: 18 }} />
            ) : (
              <Icon iconName="redDown" svgProps={{ width: 18, height: 18 }} />
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center overflow-hidden">
            <div
              className={`flex items-center justify-center rounded-lg mr-4 h-11 shrink-0 ${backgroundColor} ${
                icon ? 'w-11' : 'w-1'
              }`}
            >
              {icon && <Icon iconName={icon} svgProps={{ width: 24, height: 24 }} />}
            </div>
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-gray-600">{title}</span>
                {linked && <Icon iconName="arrowRight" svgProps={{ width: 16, height: 16 }} />}
              </div>
              <span className="text-xl font-extrabold text-gray-900 truncate">{value}</span>
            </div>
          </div>
          {change && (
            <div
              className={`flex absolute right-0 top-0 items-center py-1 px-2 rounded-tr-lg rounded-bl-lg ${
                changeType === 'positive'
                  ? 'text-success bg-success-light'
                  : 'text-danger bg-danger-light'
              }`}
            >
              {changeType === 'positive' ? (
                <Icon iconName="upArrowGreen" svgProps={{ width: 7, height: 8 }} />
              ) : (
                <Icon iconName="downArrowRed" svgProps={{ width: 7, height: 8 }} />
              )}
              <span className="text-xs ml-1">{change}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Widget;
