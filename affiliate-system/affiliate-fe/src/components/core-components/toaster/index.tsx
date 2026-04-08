import React, { useEffect, useRef, useState } from 'react';

import Icon from '../icon';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string | object;
  type: ToastType;
  onClose: () => void;
  autoClose?: boolean;
  autoCloseTime?: number;
}

const Toast: React.FC<ToastProps> = ({
  message,
  type,
  onClose,
  autoClose = true,
  autoCloseTime = 7000,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const toastStyles = {
    success: {
      bgColor: 'bg-[#0E9C3F]',
      icon: 'success',
    },
    error: {
      bgColor: 'bg-[#D72A33]',
      icon: 'failed',
    },
    warning: {
      bgColor: 'bg-[#D7611F]',
      icon: 'warning',
    },
    info: {
      bgColor: 'bg-primary-dark',
      icon: '',
    },
  };

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleClose = React.useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    if (type === 'success' && autoClose) {
      progressRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            if (progressRef.current) {
              clearInterval(progressRef.current);
            }
            if (!isHovered) {
              handleClose();
            }
            return 100;
          }
          return prev + 1;
        });
      }, autoCloseTime / 100);
    }
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [type, autoClose, autoCloseTime, handleClose, isHovered]);

  const { bgColor, icon } = toastStyles[type];

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 toast-container">
      <div
        className={`relative flex flex-col items-start min-w-80 h-auto max-w-72 rounded-lg shadow-lg bg-white transition-all duration-300 transform ${
          isVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
        }`}
        role="alert"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className={`flex w-full h-16 p-2 rounded-t-lg ${bgColor} justify-end items-start`}>
          <Icon
            onClick={handleClose}
            iconName="close"
            svgProps={{ width: 28, height: 28, color: '#f1f1f4' }}
          />
        </div>
        <div className="absolute top-7 left-1/2 transform -translate-x-1/2 rounded-full">
          <Icon iconName={icon} svgProps={{ width: 68, height: 68 }} />
        </div>
        <div className="flex flex-col pt-10 text-lg w-full items-center">
          <span className="font-extrabold text-gray-900">
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </span>
          <span className="text-sm font-medium text-gray-600 text-center max-w-[240px] break-words">
            {typeof message === 'string'
              ? message
              : typeof message === 'object'
                ? JSON.stringify(message)
                : String(message)}
          </span>
        </div>
        <div className="flex w-full py-5 items-center justify-center flex-col">
          {type === 'success' ? (
            <>
              <button
                onClick={handleClose}
                className="relative z-10 w-[236px] h-10 text-sm font-bold overflow-hidden rounded-lg bg-gray-300"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-gray-400 transition-all duration-200 ease-linear"
                  style={{ width: `${progress}%` }}
                ></div>
                <span className="relative z-10">Done</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleClose}
              className="text-sm font-bold bg-gray-300 h-10 w-[236px] rounded-lg hover:bg-gray-400"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toast;
