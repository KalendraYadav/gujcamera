import {
  IsString,
  IsEnum,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OperationalStatus } from '@prisma/client';

export class CameraQueryDto {
  @ApiPropertyOptional({
    description: 'Bounding box formatted as minLong,minLat,maxLong,maxLat',
    example: '72.45,22.95,72.65,23.15',
  })
  @IsString()
  @IsOptional()
  bbox?: string;

  @ApiPropertyOptional({ enum: OperationalStatus, description: 'Filter by operational status' })
  @IsEnum(OperationalStatus)
  @IsOptional()
  status?: OperationalStatus;

  @ApiPropertyOptional({ description: 'Filter by owning department UUID (snake_case)' })
  @IsUUID()
  @IsOptional()
  department_id?: string;

  @ApiPropertyOptional({ description: 'Filter by owning department UUID (camelCase)' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Cursor ID for keyset pagination' })
  @IsUUID()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Filter by active status (default: true)', default: true })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === '1' || value === 1) return true;
    if (value === 'false' || value === false || value === '0' || value === 0) return false;
    return undefined;
  })
  is_active?: boolean;

  get resolvedDepartmentId(): string | undefined {
    return this.department_id || this.departmentId;
  }
}
