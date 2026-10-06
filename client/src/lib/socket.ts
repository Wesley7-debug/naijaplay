import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
let connected = false;
const listeners = new Set<(connected: boolean) => void>();

/** Single shared socket. Session cookie authenticates the handshake. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
      timeout: 10000,
    });
    socket.on('connect', () => {
      connected = true;
      listeners.forEach((l) => l(true));
    });
    socket.on('disconnect', () => {
      connected = false;
      listeners.forEach((l) => l(false));
    });
    socket.io.on('reconnect', () => {
      connected = true;
      listeners.forEach((l) => l(true));
    });
  }
  return socket;
}

export function isConnected(): boolean {
  return connected;
}

export function onConnectionChange(cb: (connected: boolean) => void): () => void {
  listeners.add(cb);
  cb(connected);
  return () => listeners.delete(cb);
}

/** Promise wrapper around socket acknowledgements. */
export function emitAck<T = unknown>(event: string, payload?: unknown, timeoutMs = 8000): Promise<T> {
  const s = getSocket();
  return new Promise((resolve, reject) => {
    if (!s.connected) {
      reject(new Error('Not connected'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('Socket timeout')), timeoutMs);
    s.emit(event, payload, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}
