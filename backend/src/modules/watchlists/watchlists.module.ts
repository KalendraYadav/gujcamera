import { Module } from '@nestjs/common';
import { WatchlistsController } from './watchlists.controller';
import { WatchlistsService } from './watchlists.service';
import { WatchlistBackfillService } from './watchlist-backfill.service';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [AlertsModule],
  controllers: [WatchlistsController],
  providers: [WatchlistsService, WatchlistBackfillService],
  exports: [WatchlistsService, WatchlistBackfillService],
})
export class WatchlistsModule {}
