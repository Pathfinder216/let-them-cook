import rateLimit, { type Options } from 'express-rate-limit';
import { config } from '../config.js';

// Rate limiters are disabled in the test environment by default so the supertest suites — which
// register and log in many times via createAuthedApi — don't trip them. The dedicated rate-limit
// test re-enables them with setRateLimitEnabled(true). The skip function reads this flag live, so
// flipping it takes effect without rebuilding the limiters.
let enabled = config.NODE_ENV !== 'test';

export function setRateLimitEnabled(value: boolean): void {
  enabled = value;
}

// Shared config: emit RateLimit-* standard headers, no legacy X-RateLimit-*, and a JSON body that
// matches the app's error shape ({ error: '...' }).
const shared: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !enabled,
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({ error: options.message as string });
  },
};

/** Login: 10 attempts / 15 min per IP — blunts credential stuffing. */
export const loginLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
});

/** Registration: 5 / hour per IP — caps account-creation abuse. */
export const registerLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many accounts created from this address. Please try again later.',
});

/** Umbrella for the rest of /api/auth (/me, /csrf, /logout): 60 / 15 min per IP. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many requests. Please try again later.',
});

/** Import: 20 / hour per IP — the URL importer makes outbound fetches (see plan 43). */
export const importLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many import requests. Please try again later.',
});

/**
 * Public share links: 100 / 15 min per IP. The uuid-v4 token is unguessable, so this is
 * defense-in-depth rather than anti-enumeration — it caps abuse of the one unauthenticated,
 * DB-and-disk-touching surface. Sized to leave room for a recipe page plus its media files.
 */
export const sharedLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests. Please try again later.',
});
