import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';

export interface LoginEventBroadcast {
  event_id: string;
  wallet_address: string;
  ip_address: string;
  device_fingerprint: string;
  trust_score: number;
  decision: 'allow' | 'otp_required' | 'blocked';
  timestamp: string;
}

export interface Realtime {
  emitLoginEvent(event: LoginEventBroadcast): void;
  close(): Promise<void>;
}

// Phase 1 keeps this deliberately small: one broadcast channel, no rooms and no
// authentication, so the dashboard updates within a few seconds of an attempt
// (NFR-04). The richer event stream belongs to Phase 2.
export function createRealtime(server: HttpServer, allowedOrigin: string): Realtime {
  const io = new SocketServer(server, {
    cors: { origin: allowedOrigin || false },
  });

  return {
    emitLoginEvent(event: LoginEventBroadcast): void {
      io.emit('login:event', event);
    },
    close: () => io.close(),
  };
}

// Used by tests and by any code path that runs without an HTTP server.
export const silentRealtime: Realtime = {
  emitLoginEvent: () => undefined,
  close: async () => undefined,
};
