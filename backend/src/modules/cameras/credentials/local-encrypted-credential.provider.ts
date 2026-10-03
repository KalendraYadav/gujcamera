import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { CredentialType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ICredentialStore,
  CredentialPayload,
  StoredCredentialMetadata,
} from './credential-store.interface';

export const ALGORITHM = 'aes-256-gcm';
export const IV_LENGTH_BYTES = 12; // 96-bit IV recommended for GCM
export const AUTH_TAG_LENGTH_BYTES = 16; // 128-bit authentication tag
export const KEY_VERSION = 'v1';

/**
 * Injection token for the optional explicit AES-256 master key.
 * Used when the key is injected via the Nest DI container rather than
 * read from ConfigService at onModuleInit time.
 * Tests that instantiate LocalEncryptedCredentialProvider directly
 * (without the DI container) pass the raw key as the third constructor
 * argument — no token is needed in that path.
 */
export const CREDENTIAL_ENCRYPTION_KEY_TOKEN = 'CREDENTIAL_ENCRYPTION_KEY';

@Injectable()
export class LocalEncryptedCredentialProvider implements ICredentialStore, OnModuleInit {
  private readonly logger = new Logger(LocalEncryptedCredentialProvider.name);
  private masterKeyBuffer: Buffer | null = null;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() @Inject(CREDENTIAL_ENCRYPTION_KEY_TOKEN) explicitKey?: string | Buffer,
  ) {
    if (explicitKey !== undefined) {
      this.initKey(explicitKey);
    }
  }

  onModuleInit(): void {
    if (!this.masterKeyBuffer && this.configService) {
      const keyStr = this.configService.get<string>('CAMERA_CREDENTIAL_ENCRYPTION_KEY');
      if (keyStr) {
        this.initKey(keyStr);
      } else {
        this.logger.warn(
          'CAMERA_CREDENTIAL_ENCRYPTION_KEY is not configured. Encrypted credential operations will fail safely.',
        );
      }
    }
  }

  /**
   * Parse and validate 32-byte (256-bit) encryption key from Base64 or Hex.
   */
  public initKey(keyInput: string | Buffer): void {
    if (!keyInput) {
      throw new Error('Master encryption key must not be empty');
    }

    if (Buffer.isBuffer(keyInput)) {
      if (keyInput.length !== 32) {
        throw new Error(
          `Invalid master key buffer length: expected 32 bytes (256 bits), got ${keyInput.length} bytes`,
        );
      }
      this.masterKeyBuffer = Buffer.from(keyInput);
      return;
    }

    const trimmed = keyInput.trim();

    // Check Hex encoding (64 hex characters)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      this.masterKeyBuffer = Buffer.from(trimmed, 'hex');
      return;
    }

    // Check Base64 encoding (44 characters for 32 bytes)
    try {
      const buf = Buffer.from(trimmed, 'base64');
      if (buf.length === 32) {
        this.masterKeyBuffer = buf;
        return;
      }
    } catch {}

    throw new Error(
      'Invalid CAMERA_CREDENTIAL_ENCRYPTION_KEY format: must be a 32-byte key encoded in Base64 (44 chars) or Hex (64 chars)',
    );
  }

  /**
   * Verify master key availability or throw safe error
   */
  private getMasterKey(): Buffer {
    if (!this.masterKeyBuffer) {
      throw new Error(
        'Credential store unavailable: CAMERA_CREDENTIAL_ENCRYPTION_KEY is missing or uninitialized',
      );
    }
    return this.masterKeyBuffer;
  }

  /**
   * Encrypt a plaintext credential payload using AES-256-GCM with unique IV and camera-bound AAD.
   */
  public encryptPayload(cameraId: string, payload: CredentialPayload): {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: string;
  } {
    const key = this.getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const plaintext = JSON.stringify(payload);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    // Bind cameraId as Additional Authenticated Data (AAD) to prevent cross-camera ciphertext substitution
    cipher.setAAD(Buffer.from(cameraId, 'utf8'));

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyVersion: KEY_VERSION,
    };
  }

  /**
   * Decrypt a ciphertext record using AES-256-GCM, verifying authentication tag and camera AAD.
   */
  public decryptPayload(
    cameraId: string,
    ciphertext: string,
    ivHex: string,
    authTagHex: string,
  ): CredentialPayload {
    const key = this.getMasterKey();

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      if (iv.length !== IV_LENGTH_BYTES) {
        throw new Error(`Invalid IV length: expected ${IV_LENGTH_BYTES} bytes`);
      }
      if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
        throw new Error(`Invalid Auth Tag length: expected ${AUTH_TAG_LENGTH_BYTES} bytes`);
      }

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAAD(Buffer.from(cameraId, 'utf8'));
      decipher.setAuthTag(authTag);

      let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
      plaintext += decipher.final('utf8');

      return JSON.parse(plaintext);
    } catch (err: any) {
      this.logger.error(`Decryption failed for camera ${cameraId}: cryptographic integrity check failed`);
      throw new Error(
        'Decryption failed: cryptographic integrity check rejected corrupted ciphertext, invalid auth tag, or incorrect key',
      );
    }
  }

  /**
   * Encrypt and store camera credentials in database.
   */
  async storeCredential(
    cameraId: string,
    payload: CredentialPayload,
    type: CredentialType = CredentialType.BASIC_AUTH,
  ): Promise<StoredCredentialMetadata> {
    if (!this.prisma) {
      throw new Error('PrismaService is required for database-backed credential storage');
    }

    const { ciphertext, iv, authTag, keyVersion } = this.encryptPayload(cameraId, payload);

    const record = await this.prisma.cameraCredential.upsert({
      where: { cameraId },
      create: {
        cameraId,
        credentialType: type,
        encryptedData: ciphertext,
        iv,
        authTag,
        keyVersion,
      },
      update: {
        credentialType: type,
        encryptedData: ciphertext,
        iv,
        authTag,
        keyVersion,
      },
    });

    return {
      id: record.id,
      cameraId: record.cameraId,
      credentialType: record.credentialType,
      keyVersion: record.keyVersion,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Retrieve and decrypt credential payload in memory.
   */
  async getDecryptedCredential(cameraId: string): Promise<CredentialPayload | null> {
    if (!this.prisma) {
      throw new Error('PrismaService is required for database-backed credential storage');
    }

    const record = await this.prisma.cameraCredential.findUnique({
      where: { cameraId },
    });

    if (!record) {
      return null;
    }

    return this.decryptPayload(cameraId, record.encryptedData, record.iv, record.authTag);
  }

  /**
   * Check if a camera has configured credentials.
   */
  async hasCredential(cameraId: string): Promise<boolean> {
    if (!this.prisma) {
      throw new Error('PrismaService is required for database-backed credential storage');
    }

    const count = await this.prisma.cameraCredential.count({
      where: { cameraId },
    });
    return count > 0;
  }

  /**
   * Remove credentials for a camera.
   */
  async removeCredential(cameraId: string): Promise<boolean> {
    if (!this.prisma) {
      throw new Error('PrismaService is required for database-backed credential storage');
    }

    try {
      await this.prisma.cameraCredential.delete({
        where: { cameraId },
      });
      return true;
    } catch (err: any) {
      // Record not found is safe to ignore
      return false;
    }
  }

  /**
   * Rotate camera credentials with new secret material.
   */
  async rotateCredential(
    cameraId: string,
    payload: CredentialPayload,
    type: CredentialType = CredentialType.BASIC_AUTH,
  ): Promise<StoredCredentialMetadata> {
    return this.storeCredential(cameraId, payload, type);
  }
}
