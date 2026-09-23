export type Decision = 'allow' | 'otp_required' | 'blocked';

export interface LoginAttempt {
  event_id: string;
  wallet_address: string;
  ip_address?: string;
  device_fingerprint?: string;
  trust_score: number;
  decision: Decision;
  factors?: string[];
  verified?: boolean;
  batch_id?: number | null;
  cluster_id?: string;
  timestamp: string;
}

export interface SystemStatus {
  paused: boolean;
  breaker: { anomalous_in_window: number; threshold: number; window_ms: number };
}
