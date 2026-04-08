import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '@components/core-components/icon';

type BreadCrumbProps = {
  pages: { name: string; href: string; current: boolean }[];
};

function BreadCrumb({ pages }: BreadCrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex">
      <ol className="flex items-center space-x-2">
        {pages.map((page, index) => {
          const isFirst = index === 0;
          const isLast = index === pages.length - 1;
          const isClickable = !isFirst && !isLast && page.href;

          const baseClass = `ml-${isFirst ? '0' : '2'} text-sm capitalize`;

          const finalClass = page.current
            ? `${baseClass} text-gray-700 font-bold cursor-default`
            : isClickable
              ? `${baseClass} text-gray-600 font-medium`
              : `${baseClass} text-gray-500 font-medium cursor-default`;

          return (
            <li key={page.name}>
              <div className="flex items-center">
                {index > 0 && (
                  <Icon
                    iconName="rightArrow"
                    className="flex-shrink-0 text-gray-600"
                    svgProps={{ width: 12, height: 12, fill: '#78829D' }}
                  />
                )}
                {isClickable ? (
                  <Link to={page.href} className={finalClass}>
                    {page.name}
                  </Link>
                ) : (
                  <span className={finalClass}>{page.name}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default BreadCrumb;
