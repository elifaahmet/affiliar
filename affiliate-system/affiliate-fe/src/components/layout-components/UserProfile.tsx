import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from 'hooks/redux';
import { logoutUser } from 'store/auth/authenticationSlice';

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

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setProfileVisible(!isProfileVisible)}
        className="flex items-center relative cursor-pointer w-9 h-9 rounded-full focus:outline-none hover:ring-2 hover:ring-offset-2 hover:ring-primary focus:ring-2 focus:ring-offset-2 focus:ring-primary"
      >
        {/* <img
          alt=""
          src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
          className="h-9 w-9 rounded-full bg-gray-50"
        /> */}
        <div className="h-9 w-9 rounded-full text-white font-extrabold bg-primary text-lg justify-start content-center">
          {email
            ?.split(' ')
            .map((email) => email[0])
            .join('')
            .toUpperCase()}
        </div>
      </button>

      {isProfileVisible && (
        <div
          className="flex flex-col absolute w-[350px] top-[70px] right-8 shrink-0 rounded-[10px] bg-white shadow-md z-50"
          ref={ref}
        >
          <div className="h-[108px] flex flex-row items-center pl-6 border-b border-b-gray-300 gap-4 w-full">
            {/* <img
              alt=""
              src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
              className="h-[60px] w-[60px] rounded-full bg-gray-50  mr-4"
            /> */}
            <div className="h-16 w-16 rounded-full text-white font-extrabold bg-primary text-4xl text-center items-center justify-center content-center">
              {email
                ?.split(' ')
                .map((email) => email[0])
                .join('')
                .toUpperCase()}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-heading-16 font-semibold text-gray-900">
                {name ? name : userId}
              </span>
              <span className="text-body-reg-14 text-gray-500 font-regular">{email}</span>
            </div>
          </div>

          <Link
            to="/profile/profile-details"
            className="flex flex-row pl-6 items-center cursor-pointer h-16 border-b border-b-gray-300 w-full hover:bg-gray-200 text-body-reg-14 font-medium text-gray-900"
          >
            Profile Details
          </Link>

          <Link
            to="#"
            onClick={() => logout()}
            className="flex flex-row pl-6 items-center cursor-pointer h-16 border-b rounded-b-[10px] border-b-gray-300 w-full hover:bg-gray-200 text-body-reg-14 font-medium text-gray-900"
          >
            Logout
          </Link>
        </div>
      )}
    </>
  );
}

export default UserProfile;
