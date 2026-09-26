export type Decision = 'allow' | 'otp_required' | 'blocked';

// What happened to the step-up code: it was emailed, the email could not be
// sent (a new code can be asked for), or there was nowhere to send it.
export type OtpDelivery = 'email' | 'failed' | 'none';

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
