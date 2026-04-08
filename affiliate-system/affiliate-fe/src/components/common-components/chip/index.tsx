import React from 'react';

interface ChipProps {
  text: string;
  key?: string | number;
}

const Chip: React.FC<ChipProps> = ({ text, key }) => {
  return (
    <div
      key={key}
      className="flex w-full p-1 h-[30px] min-w-24 font-bold items-center justify-center rounded-lg text-gray-700 bg-chip-bg"
    >
      {text}
    </div>
  );
};

export default Chip;
