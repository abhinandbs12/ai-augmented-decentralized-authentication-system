import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';

export interface LoginEventBroadcast {
  event_id: string;
  wallet_address: string;
  ip_address: string;
  device_fingerprint: string;
  trust_score: number;
  decision: 'allow' | 'otp_required' | 'blocked';
  factors: string[];
  verified: boolean;
  timestamp: string;
}

export interface Realtime {
  emitLoginEvent(event: LoginEventBroadcast): void;
  emitSystem(state: 'paused' | 'resumed', reason: string): void;
  close(): Promise<void>;
}

// One broadcast channel for the operations console. Login telemetry is admin
// data (SR-15), so a socket is only accepted with an administrator's session
// token in the handshake. Rooms and the step-by-step flow stream are Phase 2.
export function createRealtime(
  server: HttpServer,
  isAdminToken: (token: string) => Promise<boolean>,
): Realtime {
  const io = new SocketServer(server);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      next(new Error('unauthorised'));
      return;
    }
    isAdminToken(token)
      .then((allowed) => next(allowed ? undefined : new Error('unauthorised')))
      .catch(() => next(new Error('unauthorised')));
  });

  return {
    emitLoginEvent: (event) => void io.emit('login:event', event),
    emitSystem: (state, reason) => void io.emit(`system:${state}`, { reason, at: new Date().toISOString() }),
    close: () => io.close(),
  };
}

// Used by tests and until the HTTP server exists.
export const silentRealtime: Realtime = {
  emitLoginEvent: () => undefined,
  emitSystem: () => undefined,
  close: async () => undefined,
};
