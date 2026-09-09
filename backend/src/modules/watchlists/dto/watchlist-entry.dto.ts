import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsISO8601,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertSeverity } from '@prisma/client';

export class CreateWatchlistEntryDto {
  @ApiProperty({ description: 'License plate string to flag (e.g. "GJ 01 AB 1234")', example: 'GJ01AB1234' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  plate!: string;

  @ApiProperty({ description: 'Flagging category (e.g. STOLEN_VEHICLE, HIT_AND_RUN, WANTED_SUSPECT)', example: 'STOLEN_VEHICLE' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(60)
  category!: string;

  @ApiProperty({ description: 'Official policing reason or FIR reference', example: 'FIR #102/2026 - Vastrapur Police Station' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ enum: AlertSeverity, default: AlertSeverity.HIGH, description: 'Alert priority/severity' })
  @IsEnum(AlertSeverity)
  @IsOptional()
  priority?: AlertSeverity = AlertSeverity.HIGH;

  @ApiPropertyOptional({ description: 'Optional ISO-8601 expiry timestamp after which matches will not trigger alerts', example: '2026-12-31T23:59:59.000Z' })
  @IsISO8601()
  @IsOptional()
  expires_at?: string;
}

export class UpdateWatchlistEntryDto {
  @ApiPropertyOptional({ description: 'Updated category', example: 'RECOVERED_VEHICLE' })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({ description: 'Updated reason or notes', example: 'Vehicle recovered, pending verification' })
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ enum: AlertSeverity, description: 'Updated alert severity' })
  @IsEnum(AlertSeverity)
  @IsOptional()
  priority?: AlertSeverity;

  @ApiPropertyOptional({ description: 'Updated expiry timestamp' })
  @IsISO8601()
  @IsOptional()
  expires_at?: string;

  @ApiPropertyOptional({ description: 'Active status flag (false = deactivated)', example: false })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  active?: boolean;
}

export class WatchlistEntryQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active status (true/false)' })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    return value === true || value === 'true';
  })
  active?: boolean;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Search by plate or reason' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'UUID cursor for keyset pagination' })
  @IsUUID('4')
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Results per page (1-100)', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
