import React, { ReactNode, useRef } from 'react';
import Icon from '@components/core-components/icon';
import { useOutsideClick } from 'hooks/core/useOutsideClick';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: ReactNode;
  footer?: ReactNode;
  title: string | ReactNode;
  isForm?: boolean;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  content,
  footer,
  title,
  isForm = false,
  onSubmit,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useOutsideClick(modalRef, onClose, isOpen);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="flex flex-col rounded-xl overflow-hidden shadow-lg min-w-[300px]"
      ref={modalRef}
    >
      <div className="flex flex-col justify-center  min-h-[70px] px-8 w-full bg-primary text-white">
        <div className="min-h-[32px] flex flex-ro justify-between items-center">
          <div className="font-semibold text-heading-20">{title}</div>
          <Icon iconName="closeCircle" svgProps={{ height: 32, width: 32 }} onClick={onClose} />
        </div>
      </div>
      {/* <hr className=" border-gray-300 w-full" /> */}
      <div className="bg-white">{content}</div>
      {footer && (
        <>
          <hr className=" border-gray-300 w-full" />
          <div className="flex justify-end w-full h-[80px] items-center pr-8 bg-white">
            {footer ? (
              footer
            ) : (
              <button
                className="bg-gray-200 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-300 text-body-reg-13 font-semibold w-[140px] h-[40px]"
                onClick={onClose}
              >
                Close
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  return isForm ? (
    <form
      onSubmit={onSubmit}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    >
      {modalContent}
    </form>
  ) : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      {modalContent}
    </div>
  );
};

export default Modal;
