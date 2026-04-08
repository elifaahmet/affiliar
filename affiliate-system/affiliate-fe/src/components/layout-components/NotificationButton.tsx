import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { NOTIFICATIONS_API_URLS } from 'config/apiUrls';

const NotificationButton = () => {
  const navigate = useNavigate();

  const { data: notifications } = useBaseQuery<any[]>({
    endpoint: NOTIFICATIONS_API_URLS.GET_NOTIFICATIONS(),
    enabled: true,
  });

  const unreadCount = notifications?.filter((notification) => !notification.status).length || 0;

  const handleClick = () => {
    navigate('/notifications');
  };

  return (
    <div className="relative inline-block text-left h-full py-3 justify-center items-center">
      <button
        className="inline-flex items-center justify-center w-full min-w-[50px] h-9 rounded-md px-3 bg-grayBg text-xs font-bold text-gray-700 hover:bg-gray-300"
        id="options-menu"
        aria-haspopup="true"
        onClick={handleClick}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
        >
          <path
            d="M18.9097 14.6657C18.8383 14.5797 18.7683 14.4938 18.6996 14.4109C17.7542 13.2675 17.1823 12.5774 17.1823 9.34055C17.1823 7.66477 16.7814 6.28977 15.9912 5.25852C15.4086 4.49668 14.621 3.91875 13.5828 3.49164C13.5695 3.48421 13.5575 3.47446 13.5476 3.46285C13.1742 2.21246 12.1524 1.375 11 1.375C9.84756 1.375 8.8262 2.21246 8.4528 3.46156C8.44283 3.47275 8.43107 3.48219 8.41799 3.48949C5.99541 4.4868 4.81807 6.4002 4.81807 9.33926C4.81807 12.5774 4.24702 13.2675 3.30084 14.4096C3.23209 14.4925 3.16206 14.5767 3.09073 14.6644C2.90648 14.8866 2.78974 15.1569 2.75433 15.4434C2.71892 15.7299 2.76632 16.0205 2.89092 16.2809C3.15604 16.8395 3.72108 17.1862 4.36604 17.1862H17.6387C18.2806 17.1862 18.8418 16.8399 19.1078 16.2839C19.2329 16.0234 19.2807 15.7326 19.2456 15.4458C19.2105 15.159 19.0939 14.8882 18.9097 14.6657Z"
            fill="#78829D"
          />
          <path
            d="M11 20.625C11.6209 20.6245 12.2301 20.456 12.763 20.1372C13.2958 19.8185 13.7325 19.3615 14.0267 18.8147C14.0405 18.7885 14.0474 18.7592 14.0466 18.7295C14.0457 18.6999 14.0372 18.671 14.0219 18.6456C14.0066 18.6202 13.985 18.5992 13.9592 18.5847C13.9334 18.5701 13.9042 18.5625 13.8746 18.5625H8.12621C8.09653 18.5624 8.06733 18.57 8.04145 18.5845C8.01557 18.599 7.9939 18.62 7.97854 18.6454C7.96318 18.6708 7.95466 18.6998 7.95381 18.7294C7.95295 18.7591 7.9598 18.7885 7.97368 18.8147C8.26781 19.3615 8.70442 19.8184 9.23722 20.1371C9.77001 20.4558 10.3791 20.6244 11 20.625Z"
            fill="#78829D"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 mt-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#FF4B55] text-white text-xs font-bold">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};

export default NotificationButton;
