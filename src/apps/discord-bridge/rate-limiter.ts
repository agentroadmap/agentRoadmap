/**
 * Discord Rate Limiter — token bucket per channel.
 *
 * Discord global rate limit: 50 requests per 1 second per channel.
 * Uses linear token refill: 50 tokens per 1000ms.
 *
 * Zero LLM calls, zero token cost.
 */

interface RateBucket {
	tokens: number;
	lastRefill: number;
}

export class DiscordRateLimiter {
	private buckets: Map<string, RateBucket> = new Map();
	private readonly maxTokens: number;
	private readonly refillPerMs: number;

	constructor(maxTokens = 50, refillIntervalMs = 1000) {
		this.maxTokens = maxTokens;
		this.refillPerMs = maxTokens / refillIntervalMs;
	}

	/**
	 * Check if a request is allowed for the given channel.
	 * Consumes one token if available.
	 */
	allow(channelId: string): boolean {
		const now = Date.now();
		let bucket = this.buckets.get(channelId);

		if (!bucket) {
			bucket = { tokens: this.maxTokens, lastRefill: now };
			this.buckets.set(channelId, bucket);
		}

		// Refill tokens linearly
		const elapsed = now - bucket.lastRefill;
		bucket.tokens = Math.min(
			this.maxTokens,
			bucket.tokens + elapsed * this.refillPerMs,
		);
		bucket.lastRefill = now;

		if (bucket.tokens >= 1) {
			bucket.tokens--;
			return true;
		}
		return false;
	}

	/**
	 * Get remaining tokens for a channel (for monitoring).
	 */
	getRemaining(channelId: string): number {
		const bucket = this.buckets.get(channelId);
		if (!bucket) return this.maxTokens;

		const elapsed = Date.now() - bucket.lastRefill;
		return Math.min(
			this.maxTokens,
			bucket.tokens + elapsed * this.refillPerMs,
		);
	}

	/**
	 * Get the number of tracked channels.
	 */
	get size(): number {
		return this.buckets.size;
	}
}
