import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOtpSender } from '../src/otp/sender';

const TWILIO = { accountSid: 'AC-test', authToken: 'token', fromNumber: '+10000000000' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createOtpSender', () => {
  it('refuses to deliver when nothing is configured, so no code is written anywhere', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sender = createOtpSender({ twilio: null, demoDelivery: false });

    await expect(sender.send('+919000000000', '123456')).rejects.toThrow(/not configured/i);
    expect(warn).not.toHaveBeenCalled();
  });

  it('writes the code to the log only when demo delivery is asked for', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sender = createOtpSender({ twilio: null, demoDelivery: true });

    await sender.send('+919000000000', '123456');

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('123456');
  });

  it('prefers a configured provider over demo delivery, so a real deployment never logs a code', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    const sender = createOtpSender({ twilio: TWILIO, demoDelivery: true });

    await sender.send('+919000000000', '123456');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });
});
