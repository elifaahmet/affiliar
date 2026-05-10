import { STORAGE_KEYS } from 'utils/common/constants';
import { storageHelper } from 'utils/storage/StorageHelper';

type Callback = (data: any) => void;

let socket: WebSocket | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;

const listeners: Record<string, Set<Callback>> = {};
const activeRooms = new Set<string>();

const getAuthToken = () => {
  const token = storageHelper.getStoreWithDecryption(STORAGE_KEYS.TOKEN);
  return typeof token === 'string' ? token : null;
};

const sendJoin = (room: string) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const token = getAuthToken();
  socket.send(
    JSON.stringify({
      action: 'join',
      room,
      ...(token ? { token } : {}),
    })
  );
};

const connect = () => {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  )
    return;

  socket = new WebSocket(`wss://${process.env.REACT_APP_API_BASE_URL}socket`);
  // socket = new WebSocket(`ws://localhost:4152`);

  socket.onopen = () => {
    activeRooms.forEach((room) => {
      sendJoin(room);
    });

    pingInterval = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ event: 'ping' }));
      }
    }, 30000);
  };

  socket.onmessage = (event) => {
    try {
      const { event: wsEvent, room, data } = JSON.parse(event.data);

      if (wsEvent === 'pong') {
        return;
      }

      if (room && listeners[room]) {
        listeners[room].forEach((cb) => cb(data));
      }
    } catch (err) {
      console.error('Failed to parse WS message:', err);
    }
  };

  socket.onclose = () => {
    socket = null;
    if (pingInterval) clearInterval(pingInterval);
  };

  socket.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
};

const subscribeRoom = (room: string, cb: Callback) => {
  if (!listeners[room]) listeners[room] = new Set();
  listeners[room].add(cb);
  activeRooms.add(room);

  connect();

  if (socket?.readyState === WebSocket.OPEN) {
    sendJoin(room);
  }

  return () => {
    listeners[room].delete(cb);
    if (listeners[room].size === 0) {
      activeRooms.delete(room);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'leave', room }));
      }
    }
  };
};

export const subscribeDashboard = (cb: Callback) => {
  return subscribeRoom('dashboard', cb);
};

export const subscribePlayerStatus = (playerId: string, cb: Callback) => {
  return subscribeRoom(`player:${playerId}`, cb);
};

export const subscribePlayerDashboard = (playerId: string, cb: Callback) => {
  return subscribeRoom(`player-dashboard:${playerId}`, cb);
};
