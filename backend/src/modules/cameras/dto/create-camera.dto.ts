import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsUUID,
  IsOptional,
  ValidateNested,
  IsInt,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CameraProtocol, OperationalStatus } from '@prisma/client';

export class CameraLocationDto {
  @ApiProperty({ description: 'Street address or physical landmark', example: 'Pakwan Crossroad, SG Highway' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address: string;

  @ApiProperty({ description: 'City police administrative zone', example: 'West Zone' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  zone: string;

  @ApiProperty({ description: 'Administrative district', example: 'Ahmedabad' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  district: string;
}

export class CameraStreamDto {
  @ApiPropertyOptional({ description: 'Video codec', default: 'h264' })
  @IsString()
  @IsOptional()
  codec?: string = 'h264';

  @ApiPropertyOptional({ description: 'Video frame resolution', default: '1920x1080' })
  @IsString()
  @IsOptional()
  resolution?: string = '1920x1080';

  @ApiPropertyOptional({ description: 'Nominal frame rate', default: 25 })
  @IsInt()
  @Min(1)
  @Max(120)
  @IsOptional()
  fps?: number = 25;

  @ApiPropertyOptional({ description: 'RTSP URL or ingestion stream handle (snake_case)', example: 'rtsp://simulator:8554/live/cam-01' })
  @IsString()
  @IsOptional()
  url_or_handle?: string;

  @ApiPropertyOptional({ description: 'RTSP URL or ingestion stream handle (camelCase)', example: 'rtsp://simulator:8554/live/cam-01' })
  @IsString()
  @IsOptional()
  urlOrHandle?: string;

  get resolvedUrlOrHandle(): string | undefined {
    return this.url_or_handle || this.urlOrHandle;
  }
}

export class CreateCameraDto {
  @ApiProperty({ description: 'Human-readable identifier / name of CCTV camera', example: 'CAM-AHM-06: Iscon Crossroad Junction' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ description: 'Department UUID (snake_case)', example: 'd1111111-0000-0000-0000-000000000001' })
  @IsUUID()
  @IsOptional()
  department_id?: string;

  @ApiPropertyOptional({ description: 'Department UUID (camelCase)', example: 'd1111111-0000-0000-0000-000000000001' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiProperty({ description: 'Latitude coordinate in WGS-84 decimal degrees', example: 23.029841, minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  lat: number;

  @ApiProperty({ description: 'Longitude coordinate in WGS-84 decimal degrees', example: 72.504218, minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  long: number;

  @ApiPropertyOptional({ enum: CameraProtocol, default: CameraProtocol.RTSP })
  @IsEnum(CameraProtocol, { message: 'Protocol must be one of: RTSP, ONVIF, MOCK_VENDOR, VENDOR_API' })
  @IsOptional()
  protocol?: CameraProtocol = CameraProtocol.RTSP;

  @ApiPropertyOptional({ description: 'Connector UUID (snake_case)', example: 'conn-001-uuid' })
  @IsUUID()
  @IsOptional()
  connector_type_id?: string;

  @ApiPropertyOptional({ description: 'Connector UUID (camelCase)', example: 'conn-001-uuid' })
  @IsUUID()
  @IsOptional()
  connectorTypeId?: string;

  @ApiPropertyOptional({ enum: OperationalStatus, default: OperationalStatus.OFFLINE })
  @IsEnum(OperationalStatus)
  @IsOptional()
  operational_status?: OperationalStatus;

  @ApiPropertyOptional({ enum: OperationalStatus, default: OperationalStatus.OFFLINE })
  @IsEnum(OperationalStatus)
  @IsOptional()
  operationalStatus?: OperationalStatus;

  @ApiPropertyOptional({ type: () => CameraLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CameraLocationDto)
  location?: CameraLocationDto;

  @ApiPropertyOptional({ type: () => CameraStreamDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CameraStreamDto)
  stream?: CameraStreamDto;

  get resolvedDepartmentId(): string {
    return (this.department_id || this.departmentId)!;
  }

  get resolvedConnectorTypeId(): string {
    return (this.connector_type_id || this.connectorTypeId)!;
  }

  get resolvedOperationalStatus(): OperationalStatus {
    return this.operational_status || this.operationalStatus || OperationalStatus.OFFLINE;
  }
}
