import {
  IsNumber,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NearbyCameraQueryDto {
  @ApiProperty({
    description: 'Center point latitude coordinate in WGS-84 decimal degrees (between -90 and 90)',
    example: 23.0225,
  })
  @IsNumber({}, { message: 'Latitude must be a valid number' })
  @Type(() => Number)
  lat: number;

  @ApiPropertyOptional({
    description: 'Center point longitude coordinate in WGS-84 decimal degrees (between -180 and 180) - alias: lng',
    example: 72.5714,
  })
  @IsNumber({}, { message: 'Longitude must be a valid number' })
  @IsOptional()
  @Type(() => Number)
  lng?: number;

  @ApiPropertyOptional({
    description: 'Center point longitude coordinate in WGS-84 decimal degrees (between -180 and 180) - alias: long',
    example: 72.5714,
  })
  @IsNumber({}, { message: 'Longitude must be a valid number' })
  @IsOptional()
  @Type(() => Number)
  long?: number;

  @ApiProperty({
    description: 'Proximity search radius in METERS (e.g. 5000 = 5km). Must be greater than 0 and max 500,000 meters.',
    example: 5000,
  })
  @IsNumber({}, { message: 'Radius must be a valid number' })
  @Type(() => Number)
  radius: number;

  @ApiPropertyOptional({
    description: 'Maximum number of cameras to return (default: 20, max: 100)',
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
}
