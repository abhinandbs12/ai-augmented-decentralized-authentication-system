import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../config';
import type { OtpSender } from './otpService';

// /login waits for the send, and the gateway gives the orchestrator 5 seconds in
// all (with up to 0.8 s for scoring). A mail server slower than this fails the
// send, which the customer can retry with a new code, not the sign-in itself.
export const SEND_TIMEOUT_MS = 3000;

// Any SMTP server: a mail provider in production, a local mail catcher in the
// lab. The credentials come from the environment, and neither they nor the code
// are ever logged.
export function createEmailSender(config: SmtpConfig | null, expiresInMinutes: number): OtpSender {
  if (config === null) {
    return {
      channel: 'none',
      async send(): Promise<void> {
        throw new Error('Email is not configured (SMTP_HOST)');
      },
    };
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // 465 is SMTP over TLS; on 587 nodemailer upgrades with STARTTLS whenever
    // the server offers it.
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });

  return {
    channel: 'email',
    async send(to: string, code: string): Promise<void> {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`the mail server did not accept the message within ${SEND_TIMEOUT_MS} ms`)),
          SEND_TIMEOUT_MS,
        );
      });

      try {
        await Promise.race([
          transport.sendMail({
            from: config.from,
            to,
            subject: 'Your Demo Bank sign-in code',
            text:
              `Your Demo Bank sign-in code is ${code}.\n\n` +
              `It expires in ${expiresInMinutes} minutes. Enter it on the sign-in screen, then approve ` +
              'the request in your wallet.\n\n' +
              'If you did not try to sign in, you can ignore this email: nobody can sign in without your wallet.\n',
          }),
          timeout,
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
