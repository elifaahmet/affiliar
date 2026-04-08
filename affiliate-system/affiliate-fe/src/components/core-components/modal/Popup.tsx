import React from 'react';
import Icon from '@components/core-components/icon';

interface PopupProps {
  isOpen: boolean;
  onClose: () => void;
  iconName?: string;
  title: string;
  description?: string;
  subDescription?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  secondaryHandler?: () => void;
  isLoading?: boolean;
}

const Popup: React.FC<PopupProps> = ({
  isOpen,
  onClose,
  iconName = 'trashRed',
  title,
  description,
  subDescription,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  secondaryHandler,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[460px] py-12 px-11 flex flex-col items-center text-center relative">
        <Icon
          iconName="closeGray"
          svgProps={{ width: 32, height: 32 }}
          className="absolute top-6 right-6 cursor-pointer"
          onClick={onClose}
        />
        {iconName && <Icon iconName={iconName} svgProps={{ width: 80, height: 80 }} />}
        <h2 className="text-2xl font-extrabold text-gray-800 pt-6 pb-2">{title}</h2>
        {description && (
          <p className="text-sm text-gray-600 font-medium mb-2 w-[315px]">{description}</p>
        )}
        {subDescription && (
          <div className="text-sm text-gray-600 font-medium mb-6 whitespace-pre-wrap text-left">
            {subDescription}
          </div>
        )}
        <div className="flex gap-4 w-full justify-center text-body-reg-13 pt-2">
          <button
            onClick={secondaryHandler ?? onClose}
            className="w-36 h-10 rounded-lg bg-gray-300 text-gray-900 font-bold hover:bg-gray-400 transition"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
            }}
            disabled={isLoading}
            className="w-36 h-10 rounded-lg bg-primary text-white font-bold hover:bg-primary-dark transition"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Popup;
