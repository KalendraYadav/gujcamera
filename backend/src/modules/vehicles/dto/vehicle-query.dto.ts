import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class VehicleQueryDto {
  @ApiPropertyOptional({
    description: 'Search string: normalized or partial license plate (e.g. GJ01AB or GJ01AB1234)',
    example: 'GJ01AB',
  })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    description: 'Alias for q: license plate search query',
    example: 'GJ01AB1234',
  })
  @IsString()
  @IsOptional()
  plate?: string;

  @ApiPropertyOptional({
    description: 'Filter vehicles first/last seen after this ISO-8601 timestamp',
    example: '2026-09-09T00:00:00.000Z',
  })
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter vehicles first/last seen before this ISO-8601 timestamp',
    example: '2026-09-09T23:59:59.000Z',
  })
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description: 'Results limit per page (default: 20, max: 100)',
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

  get resolvedSearchQuery(): string | undefined {
    return this.q || this.plate;
  }
}
