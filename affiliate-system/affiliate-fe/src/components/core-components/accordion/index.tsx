import React, { useState } from 'react';

import Icon from '../icon';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
}

const Accordion = ({ title, children }: AccordionProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {' '}
      <div className="border-b p-3 rounded-md bg-primary-light border-gray-200">
        <button
          type="button"
          className="w-full text-sm flex justify-between items-center text-primary font-semibold"
          onClick={() => setIsOpen(!isOpen)}
        >
          {title}
          {isOpen ? (
            <Icon
              iconName="indigoUpArrow"
              className="mt-1"
              svgProps={{
                width: 12,
                height: 12,
              }}
            />
          ) : (
            <Icon
              svgProps={{
                width: 12,
                height: 12,
              }}
              className="mt-1"
              iconName="indigoDownArrow"
            />
          )}
        </button>
      </div>
      <div> {isOpen && <div className="py-2">{children}</div>}</div>
    </>
  );
};

export default Accordion;
