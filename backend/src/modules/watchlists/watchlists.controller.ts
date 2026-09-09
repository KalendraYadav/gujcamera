import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WatchlistsService } from './watchlists.service';
import { CreateWatchlistDto, UpdateWatchlistDto, WatchlistQueryDto } from './dto/watchlist.dto';
import { CreateWatchlistEntryDto, UpdateWatchlistEntryDto, WatchlistEntryQueryDto } from './dto/watchlist-entry.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Watchlists')
@ApiBearerAuth()
@Controller(['watchlists', 'watchlist'])
export class WatchlistsController {
  constructor(private readonly watchlistsService: WatchlistsService) {}

  @Get()
  @ApiOperation({ summary: 'List watchlists with entry count' })
  @ApiResponse({ status: 200, description: 'Watchlists list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listWatchlists(
    @Query() query: WatchlistQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.listWatchlists(query, user, requestId);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
  @ApiOperation({ summary: 'Create new watchlist' })
  @ApiResponse({ status: 201, description: 'Watchlist created' })
  @ApiResponse({ status: 400, description: 'Validation failed or department not found' })
  @ApiResponse({ status: 403, description: 'Forbidden: Cannot create watchlist outside assigned department' })
  async createWatchlist(
    @Body() dto: CreateWatchlistDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.createWatchlist(dto, user, requestId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single watchlist detail and statistics' })
  @ApiResponse({ status: 200, description: 'Watchlist deep-dive' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_NOT_FOUND' })
  async getWatchlist(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.getWatchlist(id, user, requestId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
  @ApiOperation({ summary: 'Update watchlist name or owner' })
  @ApiResponse({ status: 200, description: 'Watchlist updated' })
  @ApiResponse({ status: 403, description: 'Forbidden: Department boundary violation' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_NOT_FOUND' })
  async updateWatchlist(
    @Param('id') id: string,
    @Body() dto: UpdateWatchlistDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.updateWatchlist(id, dto, user, requestId);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
  @ApiOperation({ summary: 'Activate all entries in watchlist' })
  @ApiResponse({ status: 200, description: 'Watchlist activated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_NOT_FOUND' })
  async activateWatchlist(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.activateWatchlist(id, user, requestId);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
  @ApiOperation({ summary: 'Deactivate all entries in watchlist' })
  @ApiResponse({ status: 200, description: 'Watchlist deactivated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_NOT_FOUND' })
  async deactivateWatchlist(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.deactivateWatchlist(id, user, requestId);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
  @ApiOperation({ summary: 'Soft-decommission/deactivate watchlist' })
  @ApiResponse({ status: 200, description: 'Watchlist deactivated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_NOT_FOUND' })
  async deleteWatchlist(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.deactivateWatchlist(id, user, requestId);
  }

  // ----------------------------------------------------------------------------
  // WATCHLIST ENTRIES
  // ----------------------------------------------------------------------------

  @Post(':id/entries')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR')
  @ApiOperation({ summary: 'Flag and add vehicle license plate to a watchlist' })
  @ApiResponse({ status: 201, description: 'Plate entry added to watchlist' })
  @ApiResponse({ status: 400, description: 'INVALID_PLATE_FORMAT' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient privileges' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_WATCHLIST_ENTRY' })
  async addEntry(
    @Param('id') watchlistId: string,
    @Body() dto: CreateWatchlistEntryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.addEntry(watchlistId, dto, user, requestId);
  }

  @Get(':id/entries')
  @ApiOperation({ summary: 'List flagged plate entries in a watchlist' })
  @ApiResponse({ status: 200, description: 'Watchlist entries list' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_NOT_FOUND' })
  async listEntries(
    @Param('id') watchlistId: string,
    @Query() query: WatchlistEntryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.listEntries(watchlistId, query, user, requestId);
  }

  @Get('entries/:entryId')
  @ApiOperation({ summary: 'Get single watchlist entry details' })
  @ApiResponse({ status: 200, description: 'Watchlist entry details' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_ENTRY_NOT_FOUND' })
  async getEntry(
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.getEntry(entryId, user, requestId);
  }

  @Patch('entries/:entryId')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR')
  @ApiOperation({ summary: 'Update watchlist entry reason, category, priority, or active status' })
  @ApiResponse({ status: 200, description: 'Watchlist entry updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_ENTRY_NOT_FOUND' })
  async updateEntry(
    @Param('entryId') entryId: string,
    @Body() dto: UpdateWatchlistEntryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.updateEntry(entryId, dto, user, requestId);
  }

  @Post('entries/:entryId/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR')
  @ApiOperation({ summary: 'Deactivate single watchlist entry (soft-delete)' })
  @ApiResponse({ status: 200, description: 'Watchlist entry deactivated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_ENTRY_NOT_FOUND' })
  async deactivateEntry(
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.deactivateEntry(entryId, user, requestId);
  }

  @Delete('entries/:entryId')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR')
  @ApiOperation({ summary: 'Deactivate watchlist entry (soft-delete alias for DELETE)' })
  @ApiResponse({ status: 200, description: 'Watchlist entry deactivated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'WATCHLIST_ENTRY_NOT_FOUND' })
  async deleteEntry(
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.watchlistsService.deactivateEntry(entryId, user, requestId);
  }
}
