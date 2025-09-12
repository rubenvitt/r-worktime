import { NextResponse } from "next/server";

// In-memory storage for rate limiting (consider using Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum number of requests
  message?: string; // Error message
}

export function rateLimit(
  options: RateLimitOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: "Too many requests, please try again later.",
  },
) {
  return async function rateLimitMiddleware(
    request: Request,
    identifier?: string,
  ): Promise<NextResponse | null> {
    // Get client identifier (IP address or custom identifier)
    const clientId =
      identifier ||
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const now = Date.now();

    // Clean up old entries
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }

    // Get or create rate limit entry for this client
    const clientData = rateLimitStore.get(clientId);

    if (!clientData) {
      // First request from this client
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + options.windowMs,
      });
      return null; // Allow request
    }

    if (clientData.resetTime < now) {
      // Window has expired, reset
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + options.windowMs,
      });
      return null; // Allow request
    }

    if (clientData.count >= options.max) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((clientData.resetTime - now) / 1000);

      return NextResponse.json(
        {
          error: options.message,
          retryAfter: retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": options.max.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(clientData.resetTime).toISOString(),
          },
        },
      );
    }

    // Increment counter
    clientData.count++;
    rateLimitStore.set(clientId, clientData);

    return null; // Allow request
  };
}

// Specific rate limiters for different endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window for auth endpoints
  message: "Too many authentication attempts, please try again later.",
});

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window for general API
  message: "Too many API requests, please try again later.",
});

export const strictRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute for sensitive operations
  message: "Rate limit exceeded for this operation.",
});
