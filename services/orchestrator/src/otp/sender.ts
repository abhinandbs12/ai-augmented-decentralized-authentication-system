import type { OtpSender } from './otpService';
import { createTwilioSender } from './twilioSender';
import type { TwilioConfig } from '../config';

export interface SenderOptions {
  twilio: TwilioConfig | null;
  demoDelivery: boolean;
}

// With no SMS provider configured the generated code reaches nobody, so the
// step-up route cannot be finished by hand and the demonstration stops at the
// code screen. OTP_DEMO_DELIVERY=true writes the code to the service log
// instead, which is where a reviewer reads it.
//
// It is off by default, so a deployment that forgets to set it never writes a
// code anywhere. Nothing else changes: the code is still random, still stored
// only as a SHA-256 hash, still expires, and is still checked the same way.
export function createOtpSender(options: SenderOptions): OtpSender {
  if (options.twilio) {
    return createTwilioSender(options.twilio);
  }

  if (options.demoDelivery) {
    return {
      channel: 'demo-log',
      async send(phoneNumber: string, code: string): Promise<void> {
        console.warn(
          `[DEMO DELIVERY] No SMS provider is configured. The code for ${phoneNumber} is ${code}. ` +
            'Set OTP_DEMO_DELIVERY=false to stop writing codes to this log.',
        );
      },
    };
  }

  return createTwilioSender(null);
}
