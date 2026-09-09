import {
  IsString,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsUUID,
  IsOptional,
  ValidateNested,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CameraProtocol, OperationalStatus } from '@prisma/client';
import { CameraLocationDto } from './create-camera.dto';

export class UpdateCameraDto {
  @ApiPropertyOptional({ description: 'Human-readable name of CCTV camera', example: 'CAM-AHM-01: SG Highway - Pakwan Crossroad' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ description: 'Department UUID (snake_case)' })
  @IsUUID()
  @IsOptional()
  department_id?: string;

  @ApiPropertyOptional({ description: 'Department UUID (camelCase)' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Latitude coordinate in WGS-84 decimal degrees', minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude coordinate in WGS-84 decimal degrees', minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  @IsOptional()
  long?: number;

  @ApiPropertyOptional({ enum: CameraProtocol })
  @IsEnum(CameraProtocol)
  @IsOptional()
  protocol?: CameraProtocol;

  @ApiPropertyOptional({ description: 'Connector UUID (snake_case)' })
  @IsUUID()
  @IsOptional()
  connector_type_id?: string;

  @ApiPropertyOptional({ description: 'Connector UUID (camelCase)' })
  @IsUUID()
  @IsOptional()
  connectorTypeId?: string;

  @ApiPropertyOptional({ enum: OperationalStatus })
  @IsEnum(OperationalStatus)
  @IsOptional()
  operational_status?: OperationalStatus;

  @ApiPropertyOptional({ enum: OperationalStatus })
  @IsEnum(OperationalStatus)
  @IsOptional()
  operationalStatus?: OperationalStatus;

  @ApiPropertyOptional({ description: 'Active status of camera (snake_case)' })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Active status of camera (camelCase)' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ type: () => CameraLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CameraLocationDto)
  location?: CameraLocationDto;

  get resolvedDepartmentId(): string | undefined {
    return this.department_id || this.departmentId;
  }

  get resolvedConnectorTypeId(): string | undefined {
    return this.connector_type_id || this.connectorTypeId;
  }

  get resolvedOperationalStatus(): OperationalStatus | undefined {
    return this.operational_status || this.operationalStatus;
  }

  get resolvedIsActive(): boolean | undefined {
    return this.is_active !== undefined ? this.is_active : this.isActive;
  }
}
