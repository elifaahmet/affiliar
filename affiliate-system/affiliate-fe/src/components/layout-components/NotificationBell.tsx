import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BellIcon } from '@heroicons/react/24/outline';
import { useBaseQuery } from 'api/core/useBaseQuery';
import axiosInstance from 'config/axiosInstance';
import { NOTIFICATION_API_URLS } from 'config/apiUrls';

interface Notification {
  _id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}
interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  if (isNaN(d)) return '';
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useBaseQuery<NotificationsResponse>({
    endpoint: NOTIFICATION_API_URLS.LIST(),
    queryKey: ['notifications'],
    params: { limit: 20 },
    // Light polling so the badge stays roughly live without a socket.
    options: { refetchInterval: 60000 } as any,
  });
  const items = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const openItem = async (n: Notification) => {
    try {
      if (!n.read) await axiosInstance.patch(NOTIFICATION_API_URLS.READ(n._id));
    } catch { /* ignore */ }
    refresh();
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    try {
      await axiosInstance.post(NOTIFICATION_API_URLS.READ_ALL(), {});
    } catch { /* ignore */ }
    refresh();
  };

  return (
    <div className='relative' ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className='relative grid h-9 w-9 place-items-center rounded-full text-gray-600 hover:bg-violet-50 hover:text-violet-900'
        aria-label='Notifications'
      >
        <BellIcon className='h-5 w-5' />
        {unread > 0 && (
          <span className='absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold grid place-items-center'>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className='absolute right-0 mt-2 w-80 max-h-[420px] overflow-auto rounded-xl border border-violet-100 bg-white shadow-xl z-50'>
          <div className='flex items-center justify-between px-4 py-2.5 border-b border-gray-100'>
            <span className='text-sm font-semibold text-gray-800'>Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className='text-[11px] font-medium text-primary hover:underline'>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className='px-4 py-6 text-xs text-gray-500 text-center'>No notifications yet.</p>
          ) : (
            <ul className='divide-y divide-gray-50'>
              {items.map((n) => (
                <li key={n._id}>
                  <button
                    onClick={() => openItem(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-violet-50/50 ${n.read ? '' : 'bg-violet-50/30'}`}
                  >
                    <div className='flex items-start gap-2'>
                      {!n.read && <span className='mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0' />}
                      <div className='min-w-0'>
                        <p className='text-xs font-semibold text-gray-800'>{n.title}</p>
                        {n.body && <p className='text-[11px] text-gray-600 mt-0.5'>{n.body}</p>}
                        <p className='text-[10px] text-gray-400 mt-0.5'>{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
