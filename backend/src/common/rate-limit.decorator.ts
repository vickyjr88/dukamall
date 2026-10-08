import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

/**
 * Opt-in, per-route rate limit: at most `limit` requests per `windowSeconds`
 * from one client IP.
 *
 * Deliberately NOT a global default. The storefront renders on the server, so
 * every page view makes its API calls from the single web container's address;
 * a global per-IP limit would throttle ordinary traffic as one "client". It is
 * applied only to the routes someone could abuse -- logins, password reset,
 * signup, checkout, discount-code guessing, public lead capture, uploads.
 *
 * Counters live in this process's memory, so with the two rolling-deploy
 * slots each keeps its own count. That is fine for brute-force protection
 * (it at most doubles an attacker's allowance) and avoids a Redis dependency
 * on the request path.
 *
 * The client IP is only meaningful because main.ts sets `trust proxy` -- see
 * the comment there.
 */
export const RateLimit = (limit: number, windowSeconds: number) =>
  applyDecorators(UseGuards(ThrottlerGuard), Throttle({ default: { limit, ttl: windowSeconds * 1000 } }));
