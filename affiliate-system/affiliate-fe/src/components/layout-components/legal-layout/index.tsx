/* eslint-disable */
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@components/core-components/icon';

type LegalLayoutProps = {
  children: ReactNode;
};

function LegalLayout({ children }: LegalLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen w-full bg-gray-50">
      <header className="bg-white border-b border-gray-200 py-4 px-10">
        <div className="flex items-center justify-between max-w-[1200px] mx-auto">
          <Link to="/">
            <Icon iconName="affiliarDark" svgProps={{ width: '200px', height: '40px' }} />
          </Link>
          <Link to="/" className="text-sm font-medium text-blue-600 hover:text-blue-800 underline">
            ← Back to Login
          </Link>
        </div>
      </header>

      <main className="flex-grow max-w-[1200px] mx-auto w-full px-10 py-12">
        {children}
      </main>

      <footer className="h-auto py-4 w-full bg-gray-300 text-gray-700 text-sm font-bold flex items-center justify-center">
        <div className="flex justify-between items-center w-full max-w-[1700px] px-10">
          <Icon iconName="affiliarDark" svgProps={{ width: '280px', height: '56px' }} />
          <div className="flex flex-col text-center gap-2 sm:flex-row sm:text-left sm:gap-6 lg:gap-16">
            <Link to="/terms-and-conditions" className="underline">Terms &amp; Conditions</Link>
            <Link to="/privacy-policy" className="underline">Privacy Policy</Link>
            <Link to="/cookie-policy" className="underline">Cookie Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LegalLayout;
