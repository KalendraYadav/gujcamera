import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertStatus } from '@prisma/client';

export class AlertTransitionDto {
  @ApiProperty({
    enum: AlertStatus,
    description: 'Target alert status in lifecycle state machine',
    example: AlertStatus.ACKNOWLEDGED,
  })
  @IsEnum(AlertStatus)
  @IsNotEmpty()
  status!: AlertStatus;

  @ApiPropertyOptional({
    description: 'Operational rationale or dismissal explanation',
    example: 'Operator verified visual frame matches flagged license plate',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

export class AlertDismissDto {
  @ApiProperty({
    description: 'Required reason explaining why the alert is dismissed (e.g. false positive OCR read)',
    example: 'False positive OCR read: visual frame shows different vehicle registration',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
