import { CredentialType } from '@prisma/client';

export interface CredentialPayload {
  username?: string;
  password?: string;
  token?: string;
  custom?: Record<string, any>;
}

export interface StoredCredentialMetadata {
  id: string;
  cameraId: string;
  credentialType: CredentialType;
  keyVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export const CREDENTIAL_STORE_TOKEN = Symbol('ICredentialStore');

export interface ICredentialStore {
  /**
   * Encrypt and store camera credentials.
   * If a credential record already exists for the camera, updates it with a new IV and ciphertext.
   */
  storeCredential(
    cameraId: string,
    payload: CredentialPayload,
    type?: CredentialType,
  ): Promise<StoredCredentialMetadata>;

  /**
   * Retrieve and decrypt credential payload in memory for authorized internal operations.
   * Decrypted payload must NEVER be logged, persisted to DB, or returned across API responses.
   */
  getDecryptedCredential(cameraId: string): Promise<CredentialPayload | null>;

  /**
   * Determine whether a credential record is configured for a specific camera.
   */
  hasCredential(cameraId: string): Promise<boolean>;

  /**
   * Safely remove credential material for a camera.
   */
  removeCredential(cameraId: string): Promise<boolean>;

  /**
   * Rotate camera credentials with a new secret, generating a fresh IV and auth tag.
   */
  rotateCredential(
    cameraId: string,
    payload: CredentialPayload,
    type?: CredentialType,
  ): Promise<StoredCredentialMetadata>;
}
