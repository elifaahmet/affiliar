import React from 'react';

interface HeaderProps {
  title: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <div className="w-full overflow-auto">
      <div className="flex flex-row justify-between items-center pb-4 ">
        <span className="text-heading-16 font-semibold">{title}</span>
      </div>
    </div>
  );
};

export default Header;
