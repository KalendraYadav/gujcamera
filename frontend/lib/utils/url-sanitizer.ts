/**
 * Centralized URL Sanitization & Inline Credential Extraction Utility
 * NETRAVA — Fleet Administration & Camera Onboarding
 */

export interface ExtractedUrlCredentials {
  cleanUrl: string;
  hasCredentials: boolean;
  username?: string;
  password?: string;
}

/**
 * Extract inline credentials and return a clean endpoint URL.
 * Example: 'rtsp://admin:pass123@10.20.4.15:554/live' -> { cleanUrl: 'rtsp://10.20.4.15:554/live', hasCredentials: true, username: 'admin', password: 'pass123' }
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
        username: decodeURIComponent(match[2]),
        password: match[3] ? decodeURIComponent(match[3]) : undefined,
      };
    }
    return { cleanUrl: trimmed, hasCredentials: false };
  }
}

/**
 * Strip any inline credentials from URL.
 */
export function stripCredentialsFromUrl(url: string | null | undefined): string {
  return extractCredentialsFromUrl(url).cleanUrl;
}

/**
 * Mask credentials in URL for safe UI display or diagnostics.
 */
export function sanitizeStreamUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed.includes('@')) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = parsed.password ? '***' : '';
      return parsed.toString();
    }
  } catch {
    // Regex fallback
  }

  return trimmed.replace(/(\/\/[^:\s@]+)(:[^@\s]+)?@/, '//$1:***@').replace(/\/\/[^@\s]+@/, '//***:***@');
}
