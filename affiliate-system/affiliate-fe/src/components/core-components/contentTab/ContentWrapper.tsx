import { ReactNode } from 'react';

interface ContentWrapperProps {
  children: ReactNode;
}

// eslint-disable-next-line react/prop-types
const ContentWrapper: React.FC<ContentWrapperProps> = ({ children }) => {
  return (
    <div className="p-5 bg-white rounded-b-lg border border-t-0 border-[#F1F1F4] w-full flex flex-row flex-wrap xl:flex-wrap shadow-[0px_3px_4px_0px_rgba(0,0,0,0.03)]">
      {children}
    </div>
  );
};

export default ContentWrapper;
