import {
  Controller,
  Get,
  Post,
  Patch,
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
import { AlertsService } from './alerts.service';
import { AlertQueryDto } from './dto/alert-query.dto';
import { AlertTransitionDto, AlertDismissDto } from './dto/alert-transition.dto';
import { MatchSightingDto } from './dto/match-sighting.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AlertStatus } from '@prisma/client';

@ApiTags('Alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Roles('OPERATOR', 'INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List and filter active or historical alerts' })
  @ApiResponse({ status: 200, description: 'Alerts list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient privileges' })
  async listAlerts(
    @Query() query: AlertQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.alertsService.listAlerts(query, user, requestId);
  }

  @Post('match-sighting')
  @Roles('OPERATOR', 'INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Evaluate sighting against active watchlists and generate alert on match' })
  @ApiResponse({ status: 201, description: 'Match evaluated and alerts generated if matched' })
  @ApiResponse({ status: 404, description: 'SIGHTING_NOT_FOUND' })
  async matchSighting(
    @Body() dto: MatchSightingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.alertsService.processSightingMatch(dto.sighting_id, requestId);
  }

  @Get(':id')
  @Roles('OPERATOR', 'INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get single alert deep-dive with linked sighting and camera evidence' })
  @ApiResponse({ status: 200, description: 'Alert deep-dive' })
  @ApiResponse({ status: 404, description: 'ALERT_NOT_FOUND' })
  async getAlert(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.alertsService.getAlert(id, user, requestId);
  }

  @Patch(':id')
  @Roles('OPERATOR', 'INVESTIGATOR', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Transition alert lifecycle status' })
  @ApiResponse({ status: 200, description: 'Alert status transitioned' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN_RESOURCE: Role not authorized for this transition' })
  @ApiResponse({ status: 404, description: 'ALERT_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'INVALID_STATE_TRANSITION' })
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: AlertTransitionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.alertsService.transitionAlertStatus(id, dto, user, requestId);
  }

  @Patch(':id/status')
  @Roles('OPERATOR', 'INVESTIGATOR', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Transition alert lifecycle status (Alias for /alerts/:id)' })
  @ApiResponse({ status: 200, description: 'Alert status transitioned' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN_RESOURCE' })
  @ApiResponse({ status: 404, description: 'ALERT_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'INVALID_STATE_TRANSITION' })
  async transitionStatusAlias(
    @Param('id') id: string,
    @Body() dto: AlertTransitionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.alertsService.transitionAlertStatus(id, dto, user, requestId);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @Roles('OPERATOR', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Acknowledge a NEW alert (Operator triage)' })
  @ApiResponse({ status: 200, description: 'Alert ACKNOWLEDGED' })
  @ApiResponse({ status: 409, description: 'INVALID_STATE_TRANSITION' })
  async acknowledgeAlert(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.alertsService.transitionAlertStatus(
      id,
      { status: AlertStatus.ACKNOWLEDGED },
      user,
      requestId,
    );
  }

  @Post(':id/investigate')
  @HttpCode(HttpStatus.OK)
  @Roles('INVESTIGATOR', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Open formal investigation on ACKNOWLEDGED alert' })
  @ApiResponse({ status: 200, description: 'Alert INVESTIGATING' })
  @ApiResponse({ status: 409, description: 'INVALID_STATE_TRANSITION' })
  async investigateAlert(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.alertsService.transitionAlertStatus(
      id,
      { status: AlertStatus.INVESTIGATING },
      user,
      requestId,
    );
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles('INVESTIGATOR', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Resolve an alert under investigation' })
  @ApiResponse({ status: 200, description: 'Alert RESOLVED' })
  @ApiResponse({ status: 409, description: 'INVALID_STATE_TRANSITION' })
  async resolveAlert(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.alertsService.transitionAlertStatus(
      id,
      { status: AlertStatus.RESOLVED, reason: body.reason },
      user,
      requestId,
    );
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @Roles('OPERATOR', 'INVESTIGATOR', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Dismiss an alert (false positive or non-actionable)' })
  @ApiResponse({ status: 200, description: 'Alert DISMISSED' })
  @ApiResponse({ status: 409, description: 'INVALID_STATE_TRANSITION' })
  async dismissAlert(
    @Param('id') id: string,
    @Body() dto: AlertDismissDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.alertsService.transitionAlertStatus(
      id,
      { status: AlertStatus.DISMISSED, reason: dto.reason },
      user,
      requestId,
    );
  }
}
