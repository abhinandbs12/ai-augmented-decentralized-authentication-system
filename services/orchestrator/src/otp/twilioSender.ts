import type { TwilioConfig } from '../config';
import type { OtpSender } from './otpService';

const TWILIO_TIMEOUT_MS = 5000;

// Twilio's REST API over fetch: Phase 1 calls it directly from code rather than
// through n8n (Phase2_Remaining_Work §7). The credentials are read from the
// environment and are never logged, and neither is the code being sent.
export function createTwilioSender(config: TwilioConfig | null): OtpSender {
  if (config === null) {
    return {
      channel: 'none',
      async send(): Promise<void> {
        throw new Error('Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)');
      },
    };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const credentials = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');

  return {
    channel: 'sms',
    async send(phoneNumber: string, code: string): Promise<void> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phoneNumber,
          From: config.fromNumber,
          Body: `Your banking login code is ${code}. It expires in 5 minutes.`,
        }),
        signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Twilio returned HTTP ${response.status}`);
      }
    },
  };
}
