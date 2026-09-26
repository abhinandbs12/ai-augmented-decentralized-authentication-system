import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  sendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (options: Record<string, unknown>) => {
      transport.options.push(options);
      return { sendMail: transport.sendMail };
    },
  },
}));

import { SEND_TIMEOUT_MS, createEmailSender } from '../src/otp/emailSender';

const SMTP = { host: 'smtp.example.com', port: 587, user: 'bank@example.com', pass: 'app-password', from: 'bank@example.com' };

describe('createEmailSender', () => {
  beforeEach(() => {
    transport.options.length = 0;
    transport.sendMail.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('refuses to deliver when no mail server is configured', async () => {
    const sender = createEmailSender(null, 5);

    expect(sender.channel).toBe('none');
    await expect(sender.send('asha@example.com', '123456')).rejects.toThrow(/not configured/i);
    expect(transport.options).toEqual([]);
  });

  it('emails the code with its lifetime, from the configured sender, and logs nothing', async () => {
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');
    transport.sendMail.mockResolvedValue({ messageId: '<1@example.com>' });
    const sender = createEmailSender(SMTP, 5);

    await sender.send('asha@example.com', '482913');

    expect(sender.channel).toBe('email');
    expect(transport.options[0]).toMatchObject({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'bank@example.com', pass: 'app-password' },
    });
    const message = transport.sendMail.mock.calls[0][0];
    expect(message).toMatchObject({ from: 'bank@example.com', to: 'asha@example.com' });
    expect(message.subject).not.toContain('482913');
    expect(message.text).toContain('482913');
    expect(message.text).toContain('5 minutes');
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses TLS from the start on port 465 and no login for a server without one', () => {
    createEmailSender({ ...SMTP, port: 465 }, 5);
    createEmailSender({ host: 'mailpit', port: 1025, user: '', pass: '', from: 'no-reply@demo-bank.local' }, 5);

    expect(transport.options[0]).toMatchObject({ secure: true });
    expect(transport.options[1]).toMatchObject({ secure: false, auth: undefined });
  });

  it('fails the send, not the sign-in, when the mail server does not answer in time', async () => {
    vi.useFakeTimers();
    transport.sendMail.mockReturnValue(new Promise(() => undefined));
    const sender = createEmailSender(SMTP, 5);

    const sending = sender.send('asha@example.com', '482913');
    const outcome = expect(sending).rejects.toThrow(/did not accept the message/);
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);

    await outcome;
  });

  it('passes a refusal from the mail server on', async () => {
    transport.sendMail.mockRejectedValue(new Error('535 Authentication failed'));
    const sender = createEmailSender(SMTP, 5);

    await expect(sender.send('asha@example.com', '482913')).rejects.toThrow('535 Authentication failed');
  });
});
