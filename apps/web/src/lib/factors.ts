// Scoring factors in two registers: plain words for the customer (NFR-07) and
// the analyst's label with its penalty, so a score reads as arithmetic.
const FACTORS: Record<string, { customer: string; analyst: string; penalty: number }> = {
  unrecognized_device: { customer: 'This device has not been used with your account before', analyst: 'New device', penalty: 30 },
  unrecognized_region: { customer: 'You are signing in from a new location or network', analyst: 'New IP / region', penalty: 20 },
  off_hours: { customer: 'This is an unusual time of day for you', analyst: 'Off-hours', penalty: 10 },
  high_velocity: { customer: 'There have been many sign-in attempts in a short time', analyst: 'High velocity', penalty: 25 },
  graph_proximity_to_flagged: { customer: 'This sign-in is linked to activity we are investigating', analyst: 'Near flagged ring', penalty: 35 },
};

export const describeFactor = (factor: string) =>
  FACTORS[factor] ?? { customer: 'Unusual sign-in pattern', analyst: factor, penalty: 0 };

export const band = (score: number): 'allow' | 'otp' | 'blocked' =>
  score >= 90 ? 'allow' : score >= 50 ? 'otp' : 'blocked';
