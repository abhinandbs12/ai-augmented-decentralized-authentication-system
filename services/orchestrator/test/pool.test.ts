import { describe, expect, it, vi } from 'vitest';
import { createPool } from '../src/db/pool';

describe('createPool', () => {
  it('survives a lost idle connection instead of crashing the process', async () => {
    const pool = createPool('postgres://user:pass@127.0.0.1:1/db');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // An 'error' event with no listener would throw and end the process.
    expect(() => pool.emit('error', new Error('terminating connection due to administrator command'))).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('administrator command'));

    log.mockRestore();
    await pool.end();
  });
});
