import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightOnRectangleIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useAppDispatch, useAppSelector } from 'hooks/redux';
import { logoutUser } from 'store/auth/authenticationSlice';

function initials(source?: string | null) {
  if (!source) return '';
  return source
    .split(/[\s@.]/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function UserProfile() {
  const { email, userId, name } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const [isProfileVisible, setProfileVisible] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setProfileVisible(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, buttonRef]);

  const logout = () => {
    dispatch(logoutUser());
  };

  const avatarLetters = initials(name || email);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setProfileVisible(!isProfileVisible)}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-sm font-semibold text-white shadow-sm shadow-primary/30 ring-1 ring-white/40 transition-shadow hover:shadow-md hover:shadow-primary/40 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label="Account menu"
      >
        {avatarLetters}
      </button>

      {isProfileVisible && (
        <div
          className="absolute right-8 top-[68px] z-50 flex w-[300px] flex-col overflow-hidden rounded-xl border border-violet-100 bg-white/95 shadow-xl shadow-violet-200/30 backdrop-blur-md"
          ref={ref}
        >
          <div className="flex items-center gap-3 border-b border-violet-50 bg-gradient-to-br from-violet-50/80 to-white p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-base font-semibold text-white shadow-sm shadow-primary/30">
              {avatarLetters}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{name || userId}</p>
              <p className="truncate text-xs text-gray-500">{email}</p>
            </div>
          </div>

          <div className="p-1">
            <Link
              to="/profile/profile-details"
              onClick={() => setProfileVisible(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-violet-50 hover:text-violet-900"
            >
              <UserCircleIcon className="h-5 w-5 stroke-[1.6] text-gray-400" />
              Profile Details
            </Link>

            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-violet-50 hover:text-violet-900"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 stroke-[1.6] text-gray-400" />
              Logout
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default UserProfile;
