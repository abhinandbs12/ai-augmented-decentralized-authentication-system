class CacheNode<K, V> {
  key: K;
  value: V;
  prev: CacheNode<K, V> | null = null;
  next: CacheNode<K, V> | null = null;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }
}

// Least-recently-used cache built from scratch (TRD §8, objective O5).
// The Map finds a node in O(1); the doubly linked list keeps nodes in usage order,
// most recent at the head, so the least recently used node (the tail) is evicted in O(1).
export class LRUCache<K, V> {
  private readonly capacity: number;
  private readonly nodes = new Map<K, CacheNode<K, V>>();
  private head: CacheNode<K, V> | null = null;
  private tail: CacheNode<K, V> | null = null;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('LRU cache capacity must be a positive whole number');
    }
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    const node = this.nodes.get(key);
    if (node === undefined) {
      return undefined;
    }

    this.moveToFront(node);
    return node.value;
  }

  put(key: K, value: V): void {
    const existingNode = this.nodes.get(key);
    if (existingNode !== undefined) {
      existingNode.value = value;
      this.moveToFront(existingNode);
      return;
    }

    const node = new CacheNode(key, value);
    this.nodes.set(key, node);
    this.addToFront(node);

    if (this.nodes.size > this.capacity) {
      this.evictLeastRecentlyUsed();
    }
  }

  // Logout has to remove a session from the cache immediately, not wait for it
  // to age out: a revoked token must stop working on the next request.
  delete(key: K): boolean {
    const node = this.nodes.get(key);
    if (node === undefined) {
      return false;
    }

    this.unlink(node);
    this.nodes.delete(key);
    return true;
  }

  private moveToFront(node: CacheNode<K, V>): void {
    if (node === this.head) {
      return;
    }
    this.unlink(node);
    this.addToFront(node);
  }

  private addToFront(node: CacheNode<K, V>): void {
    node.prev = null;
    node.next = this.head;

    if (this.head !== null) {
      this.head.prev = node;
    }
    this.head = node;

    if (this.tail === null) {
      this.tail = node;
    }
  }

  private unlink(node: CacheNode<K, V>): void {
    if (node.prev !== null) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next !== null) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  private evictLeastRecentlyUsed(): void {
    const leastRecentlyUsed = this.tail;
    if (leastRecentlyUsed === null) {
      return;
    }

    this.unlink(leastRecentlyUsed);
    this.nodes.delete(leastRecentlyUsed.key);
  }
}
