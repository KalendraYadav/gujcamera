import { IsString, IsNotEmpty, IsOptional, IsUUID, MinLength, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWatchlistDto {
  @ApiProperty({ description: 'Watchlist display name', example: 'Ahmedabad Stolen Vehicles Watchlist' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'Owning department UUID', example: 'd1111111-0000-0000-0000-000000000001' })
  @IsUUID('4')
  @IsNotEmpty()
  department_id!: string;

  @ApiProperty({ description: 'Owner unit, team, or officer name', example: 'Crime Branch Unit 3' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  owner!: string;
}

export class UpdateWatchlistDto {
  @ApiPropertyOptional({ description: 'Updated watchlist display name', example: 'Ahmedabad Stolen Vehicles — High Priority' })
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Updated owner unit or officer name', example: 'Crime Branch Unit 4' })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  owner?: string;
}

export class WatchlistQueryDto {
  @ApiPropertyOptional({ description: 'Filter by department UUID' })
  @IsUUID('4')
  @IsOptional()
  department_id?: string;

  @ApiPropertyOptional({ description: 'Search term by watchlist name or owner' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'UUID cursor for keyset pagination' })
  @IsUUID('4')
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Results per page (1-100)', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
