import { describe, expect, it } from 'vitest';
import { LRUCache } from '../src/ds/lruCache';

describe('LRUCache', () => {
  it('returns stored values and undefined for missing keys', () => {
    const cache = new LRUCache<string, number>(2);
    cache.put('a', 1);
    cache.put('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts the least recently used entry when capacity is exceeded', () => {
    const cache = new LRUCache<string, number>(2);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('treats get as a use, so a recently read key is not evicted next', () => {
    const cache = new LRUCache<string, number>(2);
    cache.put('a', 1);
    cache.put('b', 2);

    cache.get('a');
    cache.put('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('updates an existing key without growing, and marks it as recently used', () => {
    const cache = new LRUCache<string, number>(2);
    cache.put('a', 1);
    cache.put('b', 2);

    cache.put('a', 10);
    cache.put('c', 3);

    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('works with a capacity of one', () => {
    const cache = new LRUCache<string, number>(1);
    cache.put('a', 1);
    cache.put('b', 2);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects a capacity of %s', (capacity) => {
    expect(() => new LRUCache(capacity)).toThrow(RangeError);
  });

  it('matches a simple reference model over a long mixed sequence of operations', () => {
    const capacity = 5;
    const cache = new LRUCache<number, number>(capacity);
    // Reference model: keys ordered from least to most recently used.
    const expectedOrder: number[] = [];
    const expectedValues = new Map<number, number>();

    // Small deterministic pseudo-random generator, so failures are reproducible.
    let seed = 42;
    const nextRandom = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };

    const markUsed = (key: number) => {
      const index = expectedOrder.indexOf(key);
      if (index !== -1) {
        expectedOrder.splice(index, 1);
      }
      expectedOrder.push(key);
    };

    for (let step = 0; step < 5000; step++) {
      const key = nextRandom(12);

      if (nextRandom(2) === 0) {
        cache.put(key, step);
        expectedValues.set(key, step);
        markUsed(key);
        if (expectedOrder.length > capacity) {
          expectedValues.delete(expectedOrder.shift() as number);
        }
      } else {
        const expected = expectedValues.get(key);
        expect(cache.get(key)).toBe(expected);
        if (expected !== undefined) {
          markUsed(key);
        }
      }
    }
  });
});
