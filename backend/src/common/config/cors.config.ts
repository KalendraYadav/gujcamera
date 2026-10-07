import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Safely parses and normalizes comma- or semicolon-separated allowed CORS origins.
 * Strips wrapping quotes and trailing slashes.
 */
export function parseCorsOrigins(rawEnv?: string): string[] {
  if (!rawEnv || typeof rawEnv !== 'string') return [];
  return rawEnv
    .split(/[,;]/)
    .map((origin) => origin.trim().replace(/^['"]+|['"]+$/g, '').replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Validates whether an incoming HTTP Origin is authorized to access the API.
 * Preserves security without using wildcards for authenticated credentialed CORS.
 */
export function isOriginAllowed(origin: string, configuredOrigins: string[]): boolean {
  if (!origin) return true;

  const normalized = origin.trim().replace(/\/+$/, '');

  // 1. Localhost and loopback interfaces (dev, e2e, local docker)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
    return true;
  }

  // 2. Cloudflare development and judge demo tunnels
  if (/^https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com$/i.test(normalized)) {
    return true;
  }

  // 3. Vercel deployments for NETRAVA (preview deployments, team aliases, and production domains)
  // Matches exact Vercel project URLs such as:
  // - https://gujcamera-bj85w3tfw-kalendrayadavs-projects.vercel.app
  // - https://gujcamera-kalendrayadavs-projects.vercel.app
  // - https://gujcamera.vercel.app
  // - https://gujcamera-*.vercel.app
  if (
    /^https:\/\/[a-zA-Z0-9-]+-kalendrayadavs-projects\.vercel\.app$/i.test(normalized) ||
    /^https:\/\/gujcamera(-[a-zA-Z0-9-]+)?\.vercel\.app$/i.test(normalized)
  ) {
    return true;
  }

  // 4. Explicitly configured origins from CORS_ORIGINS environment variable
  return configuredOrigins.some((allowed) => allowed.toLowerCase() === normalized.toLowerCase());
}

/**
 * Builds standard NestJS/Express CorsOptions for secure cross-origin communication.
 */
export function createCorsOptions(rawOrigins?: string): CorsOptions {
  const configuredOrigins = parseCorsOrigins(rawOrigins);

  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Non-browser or server-to-server requests have no origin header
      if (!origin || isOriginAllowed(origin, configuredOrigins)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
  };
}
