import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

/**
 * Atomically counts a hit and applies blocking. Keys:
 *   KEYS[1] hit counter, KEYS[2] block flag
 *   ARGV: ttl ms, limit, block duration ms
 * Returns: hits, ms until the counter resets, blocked (0/1), ms until unblocked
 */
const INCREMENT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  return { tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('PTTL', KEYS[1]), 1, blockTtl }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, ttl, 1, tonumber(ARGV[3]) }
end
return { hits, ttl, 0, 0 }
`;

/** Rate-limit counters in Redis, shared by every app instance. */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `throttle:${throttlerName}:${key}`;
    const [hits, ttlMs, blocked, blockMs] = (await this.redis.eval(
      INCREMENT,
      2,
      `${base}:hits`,
      `${base}:blocked`,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number, number];
    return {
      totalHits: hits,
      timeToExpire: Math.ceil(Math.max(ttlMs, 0) / 1000),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.ceil(blockMs / 1000),
    };
  }
}
