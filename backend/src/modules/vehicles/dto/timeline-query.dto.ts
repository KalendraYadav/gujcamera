import {
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TimelineQueryDto {
  @ApiPropertyOptional({
    description: 'Filter timeline route from this ISO-8601 start timestamp',
    example: '2026-09-09T00:00:00.000Z',
  })
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter timeline route up to this ISO-8601 end timestamp',
    example: '2026-09-09T23:59:59.000Z',
  })
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description: 'PoC heuristic plausibility maximum speed threshold in km/h (default: 150 km/h)',
    default: 150,
    minimum: 10,
    maximum: 500,
  })
  @IsNumber()
  @Min(10)
  @Max(500)
  @IsOptional()
  @Type(() => Number)
  max_speed_kmh?: number = 150;
}
