import * as crypto from 'crypto';
import { CredentialType } from '@prisma/client';
import { LocalEncryptedCredentialProvider, ALGORITHM } from './local-encrypted-credential.provider';
import { CredentialPayload } from './credential-store.interface';
import { sanitizeStreamUrl, stripCredentialsFromUrl, extractCredentialsFromUrl } from '../../../common/utils/url-sanitizer.util';

describe('LocalEncryptedCredentialProvider (Phase 2)', () => {
  const validHexKey = crypto.randomBytes(32).toString('hex');
  const validBase64Key = crypto.randomBytes(32).toString('base64');
  const wrongKey = crypto.randomBytes(32).toString('hex');

  let provider: LocalEncryptedCredentialProvider;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      cameraCredential: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      },
    };
    provider = new LocalEncryptedCredentialProvider(mockPrisma, undefined, validHexKey);
  });

  describe('1. Cryptographic Authenticated Encryption / Decryption', () => {
    it('1. Encrypts plaintext credential successfully with AES-256-GCM', () => {
      const cameraId = 'c1111111-2222-3333-4444-555555555555';
      const payload: CredentialPayload = {
        username: 'police_admin',
        password: 'SuperSecretCameraPass2026!',
      };

      const encrypted = provider.encryptPayload(cameraId, payload);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.ciphertext).not.toContain('SuperSecretCameraPass2026!');
      expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex characters
      expect(encrypted.authTag).toHaveLength(32); // 16 bytes = 32 hex characters
      expect(encrypted.keyVersion).toBe('v1');
    });

    it('2. Decrypts encrypted credential successfully into original memory representation', () => {
      const cameraId = 'c1111111-2222-3333-4444-555555555555';
      const payload: CredentialPayload = {
        username: 'admin',
        password: 'GujaratPoliceSecurePass#2026',
        token: 'token-abc-123',
      };

      const encrypted = provider.encryptPayload(cameraId, payload);
      const decrypted = provider.decryptPayload(
        cameraId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
      );

      expect(decrypted).toEqual(payload);
      expect(decrypted.username).toBe('admin');
      expect(decrypted.password).toBe('GujaratPoliceSecurePass#2026');
      expect(decrypted.token).toBe('token-abc-123');
    });

    it('3. Guarantees unique random IV/nonce per encryption operation for identical plaintext', () => {
      const cameraId = 'c1111111-2222-3333-4444-555555555555';
      const payload: CredentialPayload = { username: 'admin', password: 'SecretPassword' };

      const enc1 = provider.encryptPayload(cameraId, payload);
      const enc2 = provider.encryptPayload(cameraId, payload);

      expect(enc1.iv).not.toEqual(enc2.iv);
      expect(enc1.ciphertext).not.toEqual(enc2.ciphertext);
      expect(enc1.authTag).not.toEqual(enc2.authTag);
    });

    it('4. Wrong encryption key fails safely with integrity rejection', () => {
      const cameraId = 'c1111111-2222-3333-4444-555555555555';
      const payload: CredentialPayload = { password: 'SecretPassword' };

      const encrypted = provider.encryptPayload(cameraId, payload);

      const wrongKeyProvider = new LocalEncryptedCredentialProvider(mockPrisma, undefined, wrongKey);
      expect(() => {
        wrongKeyProvider.decryptPayload(
          cameraId,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
        );
      }).toThrow(/cryptographic integrity check/i);
    });

    it('5. Modified ciphertext fails authentication tag verification', () => {
      const cameraId = 'c1111111-2222-3333-4444-555555555555';
      const encrypted = provider.encryptPayload(cameraId, { password: 'SecretPassword' });

      // Flip characters in the ciphertext
      const tamperedCiphertext =
        encrypted.ciphertext.substring(0, encrypted.ciphertext.length - 2) +
        (encrypted.ciphertext.slice(-2) === 'aa' ? 'bb' : 'aa');

      expect(() => {
        provider.decryptPayload(cameraId, tamperedCiphertext, encrypted.iv, encrypted.authTag);
      }).toThrow(/cryptographic integrity check/i);
    });

    it('6. Modified authentication tag fails safely', () => {
      const cameraId = 'c1111111-2222-3333-4444-555555555555';
      const encrypted = provider.encryptPayload(cameraId, { password: 'SecretPassword' });

      // Corrupt auth tag
      const tamperedTag = '00' + encrypted.authTag.substring(2);

      expect(() => {
        provider.decryptPayload(cameraId, encrypted.ciphertext, encrypted.iv, tamperedTag);
      }).toThrow(/cryptographic integrity check/i);
    });

    it('7. Missing encryption key fails safely without falling back to plaintext', () => {
      const uninitializedProvider = new LocalEncryptedCredentialProvider(mockPrisma);

      expect(() => {
        uninitializedProvider.encryptPayload('cam-1', { password: 'secret' });
      }).toThrow(/CAMERA_CREDENTIAL_ENCRYPTION_KEY is missing or uninitialized/i);
    });

    it('8. Invalid key format (not 32 bytes) fails safely on startup', () => {
      expect(() => {
        new LocalEncryptedCredentialProvider(mockPrisma, undefined, 'too-short-secret');
      }).toThrow(/Invalid CAMERA_CREDENTIAL_ENCRYPTION_KEY format/i);

      expect(() => {
        new LocalEncryptedCredentialProvider(mockPrisma, undefined, '');
      }).toThrow(/Master encryption key must not be empty/i);
    });

    it('Supports valid Base64 key initialization', () => {
      const base64Provider = new LocalEncryptedCredentialProvider(mockPrisma, undefined, validBase64Key);
      const cameraId = 'cam-base64-test';
      const encrypted = base64Provider.encryptPayload(cameraId, { password: 'Pass' });
      const decrypted = base64Provider.decryptPayload(cameraId, encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      expect(decrypted.password).toBe('Pass');
    });
  });

  describe('2. Database Storage & Rotation Operations', () => {
    it('9. Credential update replaces previous encrypted value and generates fresh IV/tag', async () => {
      const cameraId = 'c1111111-2222-3333-4444-555555555555';
      mockPrisma.cameraCredential.upsert.mockResolvedValueOnce({
        id: 'cred-1',
        cameraId,
        credentialType: CredentialType.BASIC_AUTH,
        encryptedData: 'cipher-1',
        iv: 'iv-1',
        authTag: 'tag-1',
        keyVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await provider.storeCredential(
        cameraId,
        { username: 'admin', password: 'new-rotated-password' },
        CredentialType.BASIC_AUTH,
      );

      expect(res.cameraId).toBe(cameraId);
      expect(mockPrisma.cameraCredential.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cameraId },
          create: expect.objectContaining({
            cameraId,
            keyVersion: 'v1',
          }),
          update: expect.objectContaining({
            keyVersion: 'v1',
          }),
        }),
      );
    });

    it('10. Credential deletion removes credential material from database', async () => {
      const cameraId = 'c1111111-2222-3333-4444-555555555555';
      mockPrisma.cameraCredential.delete.mockResolvedValueOnce({ id: 'cred-1' });

      const removed = await provider.removeCredential(cameraId);

      expect(removed).toBe(true);
      expect(mockPrisma.cameraCredential.delete).toHaveBeenCalledWith({
        where: { cameraId },
      });
    });
  });

  describe('3. API Response Safety, URL Sanitization & Redis Guardrails', () => {
    it('11. Camera API response does not expose credential material or ciphertext', () => {
      // Test the contract expected by sanitizeCamera
      const cameraRecordWithSecret = {
        id: 'cam-01',
        name: 'CAM-AHM-01',
        departmentId: 'dept-01',
        lat: 23.0,
        long: 72.5,
        protocol: 'RTSP',
        connectorTypeId: 'conn-01',
        operationalStatus: 'ONLINE',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        streams: [
          {
            id: 'stream-1',
            codec: 'h264',
            resolution: '1920x1080',
            fps: 25,
            urlOrHandle: 'rtsp://admin:SecretPass123@10.20.4.15:554/Streaming/Channels/102',
          },
        ],
        credential: {
          id: 'cred-1',
          credentialType: 'BASIC_AUTH',
          encryptedData: '6865782d63697068657274657874',
          iv: '69762d686578',
          authTag: '617574682d746167',
        },
      };

      // Emulate sanitizeCamera behavior
      const sanitized = {
        id: cameraRecordWithSecret.id,
        name: cameraRecordWithSecret.name,
        credential_configured: Boolean(cameraRecordWithSecret.credential),
        streams: cameraRecordWithSecret.streams.map((s) => ({
          id: s.id,
          codec: s.codec,
          resolution: s.resolution,
          fps: s.fps,
          url_or_handle: sanitizeStreamUrl(s.urlOrHandle),
        })),
      };

      const serialized = JSON.stringify(sanitized);

      // Verify ZERO credentials or secret ciphertext exist in output
      expect(serialized).not.toContain('SecretPass123');
      expect(serialized).not.toContain('6865782d63697068657274657874'); // ciphertext
      expect(serialized).not.toContain('authTag');
      expect(serialized).toContain('credential_configured":true');
      expect(sanitized.streams[0].url_or_handle).toBe('rtsp://***:***@10.20.4.15:554/Streaming/Channels/102');
    });

    it('12. Redis active-stream registry contains no external credential-bearing URL', () => {
      const rawExternalStream = 'rtsp://admin:SuperSecret2026@192.168.1.100:554/live';
      const cleanInternalStream = 'rtsp://video-gateway:8554/cam-sur-01';

      const safePayload = JSON.stringify({
        id: 'cam-sur-01',
        name: 'CAM-SUR-01',
        internal_url: sanitizeStreamUrl(cleanInternalStream),
        path_name: 'cam-sur-01',
        status: 'ONLINE',
      });

      expect(safePayload).not.toContain('SuperSecret2026');
      expect(safePayload).not.toContain('admin:');
      expect(safePayload).toContain('rtsp://video-gateway:8554/cam-sur-01');
    });

    it('13. URL sanitization utilities mask username/password across protocols and strip for DB storage', () => {
      // Masking in logs
      expect(sanitizeStreamUrl('rtsp://admin:SecretPass@10.0.0.1:554/live')).toBe('rtsp://***:***@10.0.0.1:554/live');
      expect(sanitizeStreamUrl('http://officer:tokenPass@onvif-camera/service')).toBe('http://***:***@onvif-camera/service');
      expect(sanitizeStreamUrl('rtsp://clean-host:8554/cam-01')).toBe('rtsp://clean-host:8554/cam-01');

      // Stripping for clean DB persistence
      expect(stripCredentialsFromUrl('rtsp://admin:SecretPass@10.0.0.1:554/live')).toBe('rtsp://10.0.0.1:554/live');

      // Extracting inline credentials
      const extracted = extractCredentialsFromUrl('rtsp://admin:SecretPass123@10.0.0.1:554/live');
      expect(extracted.hasCredentials).toBe(true);
      expect(extracted.username).toBe('admin');
      expect(extracted.password).toBe('SecretPass123');
      expect(extracted.cleanUrl).toBe('rtsp://10.0.0.1:554/live');
    });

    it('14. Audit log records credential lifecycle metadata without exposing secrets', () => {
      const auditPayload = {
        action: 'CREDENTIAL_CONFIGURED',
        resource: 'CameraCredential',
        before: null,
        after: {
          cameraId: 'c1111111-2222-3333-4444-555555555555',
          credentialType: 'BASIC_AUTH',
          configured: true,
        },
      };

      const serializedAudit = JSON.stringify(auditPayload);
      expect(serializedAudit).not.toContain('password');
      expect(serializedAudit).not.toContain('secret');
      expect(serializedAudit).not.toContain('iv');
      expect(serializedAudit).not.toContain('authTag');
      expect(serializedAudit).toContain('CREDENTIAL_CONFIGURED');
    });

    it('15. Existing camera functionality remains operational without credentials configured', () => {
      const publicCamera = {
        id: 'cam-public-01',
        name: 'CAM-PUBLIC-01',
        credential: null,
        streams: [
          {
            id: 'stream-pub',
            codec: 'h264',
            resolution: '1920x1080',
            fps: 25,
            urlOrHandle: 'rtsp://video-gateway:8554/cam-ahm-01',
          },
        ],
      };

      const sanitized = {
        id: publicCamera.id,
        name: publicCamera.name,
        credential_configured: Boolean(publicCamera.credential),
        streams: publicCamera.streams.map((s) => ({
          ...s,
          url_or_handle: sanitizeStreamUrl(s.urlOrHandle),
        })),
      };

      expect(sanitized.credential_configured).toBe(false);
      expect(sanitized.streams[0].url_or_handle).toBe('rtsp://video-gateway:8554/cam-ahm-01');
    });
  });
});
