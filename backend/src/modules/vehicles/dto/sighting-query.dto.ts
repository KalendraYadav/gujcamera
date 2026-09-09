import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsIn,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SightingQueryDto {
  @ApiPropertyOptional({
    description: 'Filter sightings on or after this ISO-8601 timestamp',
    example: '2026-09-09T00:00:00.000Z',
  })
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter sightings on or before this ISO-8601 timestamp',
    example: '2026-09-09T23:59:59.000Z',
  })
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description: 'Filter sightings captured by a specific Camera UUID (snake_case)',
  })
  @IsUUID('all', { message: 'camera_id must be a valid UUID' })
  @IsOptional()
  camera_id?: string;

  @ApiPropertyOptional({
    description: 'Filter sightings captured by a specific Camera UUID (camelCase)',
  })
  @IsUUID('all', { message: 'cameraId must be a valid UUID' })
  @IsOptional()
  cameraId?: string;

  @ApiPropertyOptional({
    description: 'Filter sightings captured by cameras in a specific Department UUID',
  })
  @IsUUID('all', { message: 'department_id must be a valid UUID' })
  @IsOptional()
  department_id?: string;

  @ApiPropertyOptional({
    description: 'Sort order by sighting timestamp (asc = chronological, desc = newest first)',
    default: 'asc',
    enum: ['asc', 'desc'],
  })
  @IsIn(['asc', 'desc'], { message: 'sort must be either asc or desc' })
  @IsOptional()
  sort?: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({
    description: 'Number of sightings per page (default: 20, max: 100)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Page number (1-indexed, default: 1)',
    default: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  get resolvedCameraId(): string | undefined {
    return this.camera_id || this.cameraId;
  }

  get resolvedDepartmentId(): string | undefined {
    return this.department_id;
  }
}
