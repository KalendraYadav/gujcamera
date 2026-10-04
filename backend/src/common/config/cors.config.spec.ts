import { parseCorsOrigins, isOriginAllowed, createCorsOptions } from './cors.config';

describe('CORS Configuration', () => {
  describe('parseCorsOrigins', () => {
    it('returns empty array when env is undefined or empty', () => {
      expect(parseCorsOrigins(undefined)).toEqual([]);
      expect(parseCorsOrigins('')).toEqual([]);
      expect(parseCorsOrigins('   ')).toEqual([]);
    });

    it('parses comma-separated origins', () => {
      const parsed = parseCorsOrigins('https://app.gujcamera.in, https://admin.gujcamera.in');
      expect(parsed).toEqual(['https://app.gujcamera.in', 'https://admin.gujcamera.in']);
    });

    it('parses semicolon-separated origins and strips outer quotes and trailing slashes', () => {
      const parsed = parseCorsOrigins('"https://gujcamera.vercel.app/";\'https://staging.gujcamera.in/\'');
      expect(parsed).toEqual(['https://gujcamera.vercel.app', 'https://staging.gujcamera.in']);
    });
  });

  describe('isOriginAllowed', () => {
    const configuredOrigins = ['https://custom-police-portal.gov.in'];

    it('allows requests with no origin (curl, server-to-server, healthchecks)', () => {
      expect(isOriginAllowed('', configuredOrigins)).toBe(true);
      expect(isOriginAllowed(undefined as any, configuredOrigins)).toBe(true);
    });

    it('allows localhost and loopback on any port', () => {
      expect(isOriginAllowed('http://localhost:3000', configuredOrigins)).toBe(true);
      expect(isOriginAllowed('http://localhost:4000', configuredOrigins)).toBe(true);
      expect(isOriginAllowed('http://127.0.0.1:3000', configuredOrigins)).toBe(true);
      expect(isOriginAllowed('https://localhost:3000', configuredOrigins)).toBe(true);
    });

    it('allows Cloudflare trycloudflare tunnels', () => {
      expect(isOriginAllowed('https://demo-tunnel-abc123.trycloudflare.com', configuredOrigins)).toBe(true);
    });

    it('allows EXACT deployed Vercel origin for NETRAVAHA', () => {
      expect(
        isOriginAllowed(
          'https://gujcamera-bj85w3tfw-kalendrayadavs-projects.vercel.app',
          configuredOrigins,
        ),
      ).toBe(true);
    });

    it('allows deployed Vercel origin even with accidental trailing slash', () => {
      expect(
        isOriginAllowed(
          'https://gujcamera-bj85w3tfw-kalendrayadavs-projects.vercel.app/',
          configuredOrigins,
        ),
      ).toBe(true);
    });

    it('allows Vercel production and branch domains for gujcamera', () => {
      expect(isOriginAllowed('https://gujcamera.vercel.app', configuredOrigins)).toBe(true);
      expect(isOriginAllowed('https://gujcamera-git-main.vercel.app', configuredOrigins)).toBe(true);
      expect(
        isOriginAllowed(
          'https://gujcamera-preview-kalendrayadavs-projects.vercel.app',
          configuredOrigins,
        ),
      ).toBe(true);
    });

    it('allows explicitly configured origins case-insensitively', () => {
      expect(isOriginAllowed('https://custom-police-portal.gov.in', configuredOrigins)).toBe(true);
      expect(isOriginAllowed('HTTPS://CUSTOM-POLICE-PORTAL.GOV.IN', configuredOrigins)).toBe(true);
    });

    it('blocks arbitrary unknown domains', () => {
      expect(isOriginAllowed('https://attacker.evil.com', configuredOrigins)).toBe(false);
      expect(isOriginAllowed('https://random-unrelated.vercel.app', configuredOrigins)).toBe(false);
      expect(isOriginAllowed('https://other-account-kalendrayadavs-projects.evil.com', configuredOrigins)).toBe(false);
    });
  });

  describe('createCorsOptions', () => {
    it('returns valid NestJS CorsOptions with credentials and standard methods', () => {
      const options = createCorsOptions('https://custom.portal');
      expect(options.credentials).toBe(true);
      expect(options.methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
      expect(options.allowedHeaders).toEqual(['Content-Type', 'Authorization', 'X-Request-Id']);

      const originFn = options.origin as Function;
      let callbackResult: boolean | undefined;

      originFn('https://gujcamera-bj85w3tfw-kalendrayadavs-projects.vercel.app', (err: any, allow: boolean) => {
        expect(err).toBeNull();
        callbackResult = allow;
      });
      expect(callbackResult).toBe(true);

      originFn('https://malicious.site', (err: any, allow: boolean) => {
        expect(err).toBeNull();
        callbackResult = allow;
      });
      expect(callbackResult).toBe(false);
    });
  });
});
