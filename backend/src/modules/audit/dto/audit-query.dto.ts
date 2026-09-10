import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsISO8601,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AuditQueryDto {
  @ApiPropertyOptional({
    description: 'Filter audit records by actor UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsOptional()
  actor_id?: string;

  @ApiPropertyOptional({
    description: 'Filter audit records by action type (e.g. USER_LOGIN_SUCCESS, CAMERA_REGISTERED, ALERT_ACKNOWLEDGED)',
    example: 'ALERT_ACKNOWLEDGED',
  })
  @IsString()
  @IsOptional()
  action?: string;

  @ApiPropertyOptional({
    description: 'Filter audit records by target resource (e.g. auth, cameras, alerts, watchlists, evidence)',
    example: 'alerts',
  })
  @IsString()
  @IsOptional()
  resource?: string;

  @ApiPropertyOptional({
    description: 'Filter audit records occurring on or after this ISO-8601 timestamp',
    example: '2026-09-09T00:00:00.000Z',
  })
  @IsISO8601({}, { message: 'start_date must be a valid ISO 8601 timestamp' })
  @IsOptional()
  start_date?: string;

  @ApiPropertyOptional({
    description: 'Filter audit records occurring on or before this ISO-8601 timestamp',
    example: '2026-09-10T23:59:59.000Z',
  })
  @IsISO8601({}, { message: 'end_date must be a valid ISO 8601 timestamp' })
  @IsOptional()
  end_date?: string;

  @ApiPropertyOptional({
    description: 'Whether to include system read logs (AUDIT_LOG_ACCESSED) in output. Defaults to false to prevent recursion.',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  include_system_reads?: boolean;

  @ApiPropertyOptional({
    description: '1-indexed page number for pagination',
    example: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Page size limit (bounded: 1 to 100)',
    example: 20,
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;
}
