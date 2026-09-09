import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsString,
  IsISO8601,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AlertStatus, AlertSeverity } from '@prisma/client';

export class AlertQueryDto {
  @ApiPropertyOptional({ enum: AlertStatus, description: 'Filter by alert status' })
  @IsEnum(AlertStatus)
  @IsOptional()
  status?: AlertStatus;

  @ApiPropertyOptional({ enum: AlertSeverity, description: 'Filter by severity/priority' })
  @IsEnum(AlertSeverity)
  @IsOptional()
  severity?: AlertSeverity;

  @ApiPropertyOptional({ description: 'Filter by watchlist UUID' })
  @IsUUID('4')
  @IsOptional()
  watchlist_id?: string;

  @ApiPropertyOptional({ description: 'Filter by vehicle plate (exact or prefix, auto-normalized)' })
  @IsString()
  @IsOptional()
  plate?: string;

  @ApiPropertyOptional({ description: 'Filter by observing camera UUID' })
  @IsUUID('4')
  @IsOptional()
  camera_id?: string;

  @ApiPropertyOptional({ description: 'Filter by camera owning department UUID' })
  @IsUUID('4')
  @IsOptional()
  department_id?: string;

  @ApiPropertyOptional({ description: 'Filter alerts on or after ISO timestamp' })
  @IsISO8601()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter alerts on or before ISO timestamp' })
  @IsISO8601()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ description: 'Results per page (1-100)', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Page number (1-indexed)', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'UUID cursor for keyset pagination' })
  @IsUUID('4')
  @IsOptional()
  cursor?: string;
}
