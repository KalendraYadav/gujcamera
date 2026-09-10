import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CameraProtocol } from '@prisma/client';

export class TestConnectionDto {
  @ApiProperty({
    enum: CameraProtocol,
    description: 'Target camera protocol adapter to test',
    example: CameraProtocol.RTSP,
  })
  @IsEnum(CameraProtocol, {
    message: 'Protocol must be one of the registered adapters: RTSP, ONVIF',
  })
  protocol: CameraProtocol;

  @ApiPropertyOptional({
    description: 'Endpoint URL or RTSP stream URI (snake_case)',
    example: 'rtsp://simulator:8554/live/cam-ahm-01',
  })
  @IsString()
  @IsOptional()
  url_or_handle?: string;

  @ApiPropertyOptional({
    description: 'Endpoint URL or RTSP stream URI (camelCase)',
    example: 'rtsp://simulator:8554/live/cam-ahm-01',
  })
  @IsString()
  @IsOptional()
  urlOrHandle?: string;

  @ApiPropertyOptional({
    description: 'Optional authentication username (never returned in responses)',
    example: 'admin',
  })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({
    description: 'Optional authentication password (never returned in responses)',
    example: 'SecurePolicePass2026',
  })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({
    description: 'Socket/HTTP connection timeout in milliseconds',
    default: 5000,
    minimum: 500,
    maximum: 15000,
  })
  @IsInt()
  @Min(500)
  @Max(15000)
  @IsOptional()
  timeoutMs?: number = 5000;

  @ApiPropertyOptional({
    description: 'Target ONVIF media profile token',
    example: 'Profile_1',
  })
  @IsString()
  @IsOptional()
  profileToken?: string;

  get resolvedUrlOrHandle(): string {
    return (this.url_or_handle || this.urlOrHandle || '').trim();
  }
}
