import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CredentialType } from '@prisma/client';

export class ConfigureCameraCredentialsDto {
  @ApiPropertyOptional({
    enum: CredentialType,
    default: CredentialType.BASIC_AUTH,
    description: 'Type of credential (BASIC_AUTH, ONVIF_TOKEN, BEARER_TOKEN, CUSTOM)',
  })
  @IsEnum(CredentialType)
  @IsOptional()
  credential_type?: CredentialType = CredentialType.BASIC_AUTH;

  @ApiPropertyOptional({
    enum: CredentialType,
    default: CredentialType.BASIC_AUTH,
    description: 'Type of credential (camelCase alias)',
  })
  @IsEnum(CredentialType)
  @IsOptional()
  credentialType?: CredentialType;

  get resolvedCredentialType(): CredentialType {
    return this.credential_type || this.credentialType || CredentialType.BASIC_AUTH;
  }

  @ApiPropertyOptional({
    description: 'Authentication username (stored only encrypted in credential vault)',
    example: 'admin',
  })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiProperty({
    description: 'Authentication password or secret (never returned in responses)',
    example: 'SecretPolicePass2026',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password or secret is required when configuring credentials' })
  password: string;

  @ApiPropertyOptional({
    description: 'Optional API bearer token for token-authenticated streams',
  })
  @IsString()
  @IsOptional()
  token?: string;
}
