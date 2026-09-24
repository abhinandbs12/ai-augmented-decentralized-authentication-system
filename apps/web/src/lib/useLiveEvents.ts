import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { LoginAttempt } from './types';

export type LiveState = 'connecting' | 'live' | 'offline';

interface LiveHandlers {
  onAttempt(attempt: LoginAttempt): void;
  onSystem(state: 'paused' | 'resumed'): void;
}

// Subscribes the console to the orchestrator's event stream. The server only
// accepts an administrator's session token in the handshake.
export function useLiveEvents(sessionToken: string, handlers: LiveHandlers): LiveState {
  const [state, setState] = useState<LiveState>('connecting');
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const socket = io({ auth: { token: sessionToken }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => setState('live'));
    socket.on('disconnect', () => setState('offline'));
    socket.on('connect_error', () => setState('offline'));
    socket.on('login:event', (attempt: LoginAttempt) => latest.current.onAttempt(attempt));
    socket.on('system:paused', () => latest.current.onSystem('paused'));
    socket.on('system:resumed', () => latest.current.onSystem('resumed'));
    return () => {
      socket.disconnect();
    };
  }, [sessionToken]);

  return state;
}
