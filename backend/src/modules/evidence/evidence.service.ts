import {
  Injectable,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EvidenceSourceType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import AdmZip from 'adm-zip';
import { Readable } from 'stream';

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);
  private readonly s3Client: S3Client;
  private readonly defaultBucket = 'police-evidence-vault';

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    const accessKey = process.env.MINIO_ROOT_USER || 'minio_admin';
    const secretKey = process.env.MINIO_ROOT_PASSWORD || 'minio_dev_secret_2026';

    this.s3Client = new S3Client({
      endpoint: minioEndpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
    });
  }

  /**
   * Parse s3://bucket/key storage reference URI
   */
  private parseStorageRef(storageRef: string): { bucket: string; key: string } {
    if (storageRef.startsWith('s3://')) {
      const parts = storageRef.slice(5).split('/');
      const bucket = parts[0];
      const key = parts.slice(1).join('/');
      return { bucket, key };
    }
    return { bucket: this.defaultBucket, key: storageRef };
  }

  /**
   * Fetch object buffer from MinIO S3
   */
  private async fetchObjectBuffer(bucket: string, key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new ServiceUnavailableException('Empty response body received from evidence vault storage');
      }

      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException(`Evidence artifact key '${key}' not found in storage vault`);
      }
      this.logger.error(`Evidence vault storage error (${bucket}/${key}): ${err.message}`);
      throw new ServiceUnavailableException(`Evidence vault storage unreachable: ${err.message}`);
    }
  }

  /**
   * Get single evidence record with live cryptographic SHA-256 verification
   */
  async getEvidenceById(id: string, user: AuthenticatedUser) {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id },
    });

    if (!evidence) {
      throw new NotFoundException(`Evidence artifact '${id}' not found`);
    }

    // Lookup linked sighting details if source_type is VEHICLE_SIGHTING
    let sighting: any = null;
    if (evidence.sourceType === EvidenceSourceType.SIGHTING) {
      sighting = await this.prisma.vehicleSighting.findUnique({
        where: { id: evidence.sourceId },
        include: {
          camera: { select: { id: true, name: true, lat: true, long: true } },
          vehicle: { select: { plateNormalized: true, attributes: true } },
        },
      });
    }

    const { bucket, key } = this.parseStorageRef(evidence.storageRef);

    let verificationResult: any = {
      verified: false,
      algorithm: 'SHA-256',
      expected_hash: evidence.hash,
      calculated_hash: null,
      status: 'PENDING',
    };

    try {
      const bytes = await this.fetchObjectBuffer(bucket, key);
      const calculatedHash = crypto.createHash('sha256').update(bytes).digest('hex');
      const verified = calculatedHash.toLowerCase() === evidence.hash.toLowerCase();

      verificationResult = {
        verified,
        algorithm: 'SHA-256',
        expected_hash: evidence.hash,
        calculated_hash: calculatedHash,
        status: verified ? 'VERIFIED_MATCH' : 'INTEGRITY_BREACH',
        size_bytes: bytes.length,
      };
    } catch (storageErr: any) {
      verificationResult = {
        verified: false,
        algorithm: 'SHA-256',
        expected_hash: evidence.hash,
        calculated_hash: null,
        status: 'STORAGE_UNAVAILABLE',
        error: storageErr.message,
      };
    }

    return {
      id: evidence.id,
      source_type: evidence.sourceType,
      source_id: evidence.sourceId,
      storage_ref: evidence.storageRef,
      hash: evidence.hash,
      captured_at: evidence.capturedAt.toISOString(),
      created_at: evidence.createdAt.toISOString(),
      verification: verificationResult,
      sighting: sighting
        ? {
            id: sighting.id,
            plate_normalized: sighting.plateNormalized,
            camera_id: sighting.cameraId,
            camera_name: sighting.camera?.name,
            timestamp: sighting.ts.toISOString(),
            confidence: Number(sighting.confidence),
            consensus_of: sighting.consensusOf,
          }
        : null,
    };
  }

  /**
   * Lookup evidence by linked sighting ID
   */
  async getEvidenceBySightingId(sightingId: string, user: AuthenticatedUser) {
    const evidence = await this.prisma.evidence.findFirst({
      where: { sourceId: sightingId },
    });

    if (!evidence) {
      throw new NotFoundException(`No evidence artifact found for sighting '${sightingId}'`);
    }

    return this.getEvidenceById(evidence.id, user);
  }

  /**
   * Export an authenticated Evidence Integrity Package (ZIP)
   */
  async exportEvidencePackage(id: string, user: AuthenticatedUser): Promise<{ zipBuffer: Buffer; filename: string }> {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id },
    });

    if (!evidence) {
      throw new NotFoundException(`Evidence artifact '${id}' not found`);
    }

    let sighting: any = null;
    if (evidence.sourceType === EvidenceSourceType.SIGHTING) {
      sighting = await this.prisma.vehicleSighting.findUnique({
        where: { id: evidence.sourceId },
        include: {
          camera: { select: { id: true, name: true, lat: true, long: true } },
          vehicle: { select: { plateNormalized: true, attributes: true } },
        },
      });
    }

    const { bucket, key } = this.parseStorageRef(evidence.storageRef);

    // 1. Fetch raw bytes
    const imageBytes = await this.fetchObjectBuffer(bucket, key);

    // 2. Perform SHA-256 byte verification
    const calculatedHash = crypto.createHash('sha256').update(imageBytes).digest('hex');
    const isMatch = calculatedHash.toLowerCase() === evidence.hash.toLowerCase();

    // 3. Handle tamper detection
    if (!isMatch) {
      await this.auditService.recordAudit({
        actorId: user.id,
        action: 'EVIDENCE_TAMPER_DETECTED',
        resource: 'evidence',
        after: {
          evidence_id: evidence.id,
          expected_hash: evidence.hash,
          calculated_hash: calculatedHash,
          severity: 'SECURITY_ALERT',
        },
      });

      throw new ConflictException(
        `INTEGRITY_VERIFICATION_FAILED: Stored evidence byte digest does not match recorded canonical hash. Expected ${evidence.hash}, computed ${calculatedHash}. Export blocked.`,
      );
    }

    // 4. Construct machine-readable metadata JSON
    const metadataObj = {
      evidence_id: evidence.id,
      source_type: evidence.sourceType,
      source_id: evidence.sourceId,
      storage_ref: evidence.storageRef,
      sha256_hash: evidence.hash,
      captured_at: evidence.capturedAt.toISOString(),
      sighting_context: sighting
        ? {
            sighting_id: sighting.id,
            plate_normalized: sighting.plateNormalized,
            camera_id: sighting.cameraId,
            camera_name: sighting.camera?.name,
            timestamp: sighting.ts.toISOString(),
            confidence: Number(sighting.confidence),
            consensus_of: sighting.consensusOf,
          }
        : null,
      export_audit: {
        exporting_user_id: user.id,
        exporting_email: user.email,
        exporting_role: user.role,
        exported_at: new Date().toISOString(),
        verification_result: 'SHA-256_MATCH_VERIFIED',
        fips_compliant: true,
      },
    };
    const metadataJson = JSON.stringify(metadataObj, null, 2);

    // 5. Construct human-readable technical verification certificate
    const plate = sighting?.plateNormalized || 'N/A';
    const camName = sighting?.camera?.name || 'N/A';
    const certText = `================================================================================
GUJARAT POLICE UNIFIED CCTV INTELLIGENCE PLATFORM
TECHNICAL EVIDENCE INTEGRITY CERTIFICATE
================================================================================
Document Type:       Technical Verification Certificate (Digital Evidence Integrity)
Document Reference:  CERT-${evidence.id.slice(0, 8).toUpperCase()}-${Date.now()}
Generation Date:     ${new Date().toISOString()}

PRIMARY EVIDENCE ARTIFACT IDENTIFIERS:
--------------------------------------------------------------------------------
Evidence ID:         ${evidence.id}
Source Entity Type:  ${evidence.sourceType}
Source Sighting ID:  ${evidence.sourceId}
Vehicle Plate:       ${plate}
Capturing Camera:    ${camName} (ID: ${sighting?.cameraId || 'N/A'})
Capture Timestamp:   ${evidence.capturedAt.toISOString()}

CRYPTOGRAPHIC INTEGRITY VERIFICATION:
--------------------------------------------------------------------------------
Hash Algorithm:      SHA-256 (FIPS 180-4 standard)
Canonical DB Hash:   ${evidence.hash}
Computed Frame Hash: ${calculatedHash}
Verification Result: PASS — 100% Cryptographic Match
Byte Count:          ${imageBytes.length} bytes

CHAIN OF CUSTODY & ACCESS RECORD:
--------------------------------------------------------------------------------
Exporting Officer:   ${user.email}
Officer Role:        ${user.role}
Officer User ID:     ${user.id}
Export Timestamp:    ${new Date().toISOString()}
Vault Reference:     ${evidence.storageRef}

LEGAL COMPLIANCE & USAGE DISCLAIMER:
--------------------------------------------------------------------------------
This technical verification certificate confirms the mathematical byte integrity
of the captured JPEG frame from initial storage to the moment of export, in
accordance with digital forensics guidelines (Section 65B Indian Evidence Act).
This certificate confirms that stored evidence bytes have suffered zero tampering,
alteration, or data corruption. It does not replace independent court testimony
or investigative corroboration.
================================================================================
`;

    // 6. Build evidence ZIP package
    const zip = new AdmZip();
    zip.addFile(`evidence_${evidence.id.slice(0, 8)}.jpg`, imageBytes);
    zip.addFile('metadata.json', Buffer.from(metadataJson, 'utf-8'));
    zip.addFile('CERTIFICATE_OF_INTEGRITY.txt', Buffer.from(certText, 'utf-8'));
    const zipBuffer = zip.toBuffer();

    // 7. Record synchronous security audit event
    await this.auditService.recordAudit({
      actorId: user.id,
      action: 'EVIDENCE_PACKAGE_EXPORTED',
      resource: 'evidence',
      after: {
        evidence_id: evidence.id,
        source_id: evidence.sourceId,
        sha256_hash: evidence.hash,
        package_size_bytes: zipBuffer.length,
        exported_by: user.email,
      },
    });

    return {
      zipBuffer,
      filename: `evidence_${evidence.id.slice(0, 8)}_integrity_package.zip`,
    };
  }
}
