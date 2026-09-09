import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MatchSightingDto {
  @ApiProperty({
    description: 'Vehicle sighting UUID to evaluate against active watchlists',
    example: 'vs-001-uuid',
  })
  @IsUUID('4')
  @IsNotEmpty()
  sighting_id!: string;
}
