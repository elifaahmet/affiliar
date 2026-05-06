import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon } from '@heroicons/react/20/solid';

type BreadCrumbProps = {
  pages: { name: string; href: string; current: boolean }[];
};

function BreadCrumb({ pages }: BreadCrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex">
      <ol className="flex items-center gap-1.5">
        {pages.map((page, index) => {
          const isFirst = index === 0;
          const isLast = index === pages.length - 1;
          const isClickable = !isFirst && !isLast && page.href;

          const baseClass = 'text-sm capitalize tracking-tight';
          const finalClass = page.current
            ? `${baseClass} text-gray-900 font-semibold cursor-default`
            : isClickable
              ? `${baseClass} text-gray-500 font-medium hover:text-violet-700 transition-colors`
              : `${baseClass} text-gray-400 font-medium cursor-default`;

          return (
            <li key={page.name}>
              <div className="flex items-center gap-1.5">
                {index > 0 && (
                  <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden="true" />
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
