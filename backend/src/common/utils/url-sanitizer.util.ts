/**
 * Centralized URL Sanitization and Credential Extraction Utility
 * NETRAVAHA — Unified CCTV Intelligence Platform
 *
 * Guarantees that camera credentials are never logged, exposed in error messages,
 * published to Redis, or returned across API boundaries.
 */

export interface ExtractedUrlCredentials {
  cleanUrl: string;
  hasCredentials: boolean;
  username?: string;
  password?: string;
}

/**
 * Mask credentials in any URL for safe logging, metrics, audit logs, and error responses.
 * Example: 'rtsp://admin:SecretPass123@10.20.4.15:554/live' -> 'rtsp://***:***@10.20.4.15:554/live'
 * Example: 'rtsp://admin@10.20.4.15:554/live' -> 'rtsp://***@10.20.4.15:554/live'
 */
export function sanitizeStreamUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed.includes('@')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = parsed.password ? '***' : '';
      return parsed.toString();
    }
  } catch {
    // URL parser failure fallback (e.g., custom rtsp:// scheme in older environments)
  }

  // Regex fallback: mask everything between '//' and the last '@' before host
  return trimmed.replace(/(\/\/[^:\s@]+)(:[^@\s]+)?@/, '//$1:***@').replace(/\/\/[^@\s]+@/, '//***:***@');
}

/**
 * Completely strip credentials from a URL, leaving only protocol, host, port, and path.
 * Used when saving endpoints to CameraStream.urlOrHandle so secrets are never persisted in DB.
 * Example: 'rtsp://admin:SecretPass123@10.20.4.15:554/live' -> 'rtsp://10.20.4.15:554/live'
 */
export function stripCredentialsFromUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed.includes('@')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    // Regex fallback
    return trimmed.replace(/\/\/[^@\s]+@/, '//');
  }
}

/**
 * Extract inline credentials and return a clean endpoint URL.
 * Enables backward-compatible camera onboarding where inline credentials can be extracted,
 * stored in the secure credential store, and the clean URL stored in CameraStream.
 */
export function extractCredentialsFromUrl(url: string | null | undefined): ExtractedUrlCredentials {
  if (!url) {
    return { cleanUrl: '', hasCredentials: false };
  }

  const trimmed = url.trim();
  if (!trimmed.includes('@')) {
    return { cleanUrl: trimmed, hasCredentials: false };
  }

  try {
    const parsed = new URL(trimmed);
    const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;

    parsed.username = '';
    parsed.password = '';

    return {
      cleanUrl: parsed.toString(),
      hasCredentials: Boolean(username || password),
      username,
      password,
    };
  } catch {
    // Regex fallback
    const match = trimmed.match(/^([a-zA-Z0-9+.-]+:\/\/)([^:@\s]+)(?::([^@\s]*))?@(.*)$/);
    if (match) {
      return {
        cleanUrl: `${match[1]}${match[4]}`,
        hasCredentials: true,
        username: match[2],
        password: match[3] || undefined,
      };
    }

    return { cleanUrl: trimmed, hasCredentials: false };
  }
}
