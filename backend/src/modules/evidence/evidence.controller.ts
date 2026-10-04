import {
  Controller,
  Get,
  Param,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { EvidenceService } from './evidence.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Evidence & Chain of Custody')
@ApiBearerAuth()
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Get(':id')
  @Roles('INVESTIGATOR', 'SUPER_ADMIN', 'SYSTEM_AUDITOR')
  @ApiOperation({
    summary: 'Inspect single evidence artifact with live SHA-256 verification (FR-019)',
    description: 'Retrieves evidence metadata and executes live cryptographic verification of stored MinIO bytes against the canonical database hash.',
  })
  @ApiResponse({ status: 200, description: 'Evidence record with verification status' })
  @ApiResponse({ status: 404, description: 'Evidence not found' })
  async getEvidence(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.evidenceService.getEvidenceById(id, user);
  }

  @Get('by-sighting/:sightingId')
  @Roles('INVESTIGATOR', 'SUPER_ADMIN', 'SYSTEM_AUDITOR')
  @ApiOperation({
    summary: 'Lookup evidence artifact by vehicle sighting ID',
  })
  @ApiResponse({ status: 200, description: 'Evidence record with verification status' })
  @ApiResponse({ status: 404, description: 'Evidence not found for sighting' })
  async getEvidenceBySighting(
    @Param('sightingId') sightingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.evidenceService.getEvidenceBySightingId(sightingId, user);
  }

  @Get(':id/frame')
  @Roles('INVESTIGATOR', 'SUPER_ADMIN', 'SYSTEM_AUDITOR')
  @ApiOperation({
    summary: 'Stream raw evidence JPEG frame directly from vault with live SHA-256 verification',
    description: 'Streams original unmodified JPEG bytes from MinIO storage vault. Validates SHA-256 integrity digest before serving. Blocks streaming on hash mismatch.',
  })
  @ApiResponse({ status: 200, description: 'Raw JPEG binary frame stream', content: { 'image/jpeg': {} } })
  @ApiResponse({ status: 404, description: 'Evidence not found or frame missing from storage vault' })
  @ApiResponse({ status: 409, description: 'INTEGRITY_VERIFICATION_FAILED: Tampered or corrupted evidence' })
  @ApiResponse({ status: 503, description: 'Evidence vault storage unreachable' })
  async getEvidenceFrame(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { frameBuffer, hash } = await this.evidenceService.getEvidenceFrame(id, user);

    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': frameBuffer.length.toString(),
      'X-Evidence-Integrity': 'VERIFIED_MATCH',
      'X-Evidence-Hash': hash,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    });

    res.end(frameBuffer);
  }

  @Get(':id/export')
  @Roles('INVESTIGATOR', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Export certified Evidence Integrity Package (ZIP bundle)',
    description: 'Generates an authenticated ZIP bundle containing the raw JPEG frame, metadata JSON, and technical verification certificate. Blocks export on hash mismatch.',
  })
  @ApiResponse({ status: 200, description: 'Authenticated ZIP evidence package' })
  @ApiResponse({ status: 404, description: 'Evidence not found' })
  @ApiResponse({ status: 409, description: 'INTEGRITY_VERIFICATION_FAILED: Tampered or corrupted evidence' })
  async exportEvidencePackage(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { zipBuffer, filename } = await this.evidenceService.exportEvidencePackage(id, user);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': zipBuffer.length.toString(),
      'X-Evidence-Integrity': 'VERIFIED_MATCH',
    });

    res.end(zipBuffer);
  }
}
