// ==============================================================================
// Real-Time Alert WebSocket Gateway
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7.1, Section 8.2: WS /ws/alerts)
// ==============================================================================

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { Logger, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IncomingMessage } from 'http';

export interface AuthenticatedClientContext {
  userId: string;
  email: string;
  role: string;
  departmentId?: string;
  connectedAt: Date;
}

const AUTHORIZED_ROLES = new Set([
  'OPERATOR',
  'INVESTIGATOR',
  'DEPARTMENT_ADMIN',
  'SUPER_ADMIN',
]);

const AUTH_TIMEOUT_MS = 5000;

@Injectable()
@WebSocketGateway({ path: '/ws/alerts' })
export class AlertsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AlertsGateway.name);

  @WebSocketServer()
  server: Server;

  private readonly authenticatedClients = new Map<WebSocket, AuthenticatedClientContext>();
  private readonly pendingAuthTimeouts = new Map<WebSocket, NodeJS.Timeout>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('AlertsGateway initialized on path /ws/alerts');
  }

  async handleConnection(client: WebSocket, req: IncomingMessage) {
    this.logger.debug('New WebSocket connection attempt on /ws/alerts');

    // 1. Try immediate authentication from HTTP headers or URL query parameter
    const tokenFromHeader = this.extractTokenFromRequest(req);
    if (tokenFromHeader) {
      const authResult = await this.validateToken(tokenFromHeader);
      if (authResult.valid && authResult.context) {
        this.registerAuthenticatedClient(client, authResult.context);
        return;
      } else {
        this.rejectClient(client, authResult.errorCode || 'UNAUTHORIZED', authResult.message || 'Authentication failed', 4401);
        return;
      }
    }

    // 2. No immediate token: Wait for in-band auth message within AUTH_TIMEOUT_MS
    const timeout = setTimeout(() => {
      if (!this.authenticatedClients.has(client)) {
        this.logger.warn('WebSocket client failed to authenticate within timeout. Closing connection.');
        this.rejectClient(client, 'AUTH_TIMEOUT', 'Authentication timeout: auth message expected within 5 seconds', 4408);
      }
    }, AUTH_TIMEOUT_MS);

    this.pendingAuthTimeouts.set(client, timeout);

    // Setup message listener for in-band authentication
    client.on('message', async (data: any) => {
      try {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        const message = JSON.parse(text);

        if (message.type === 'auth') {
          const authResult = await this.validateToken(message.token);
          if (authResult.valid && authResult.context) {
            this.registerAuthenticatedClient(client, authResult.context);
          } else {
            this.rejectClient(
              client,
              authResult.errorCode || 'UNAUTHORIZED',
              authResult.message || 'Authentication failed',
              authResult.errorCode === 'FORBIDDEN_RESOURCE' ? 4403 : 4401,
            );
          }
        } else if (message.type === 'ping') {
          this.safeSend(client, { event: 'pong', timestamp: new Date().toISOString() });
        }
      } catch (err: any) {
        this.logger.warn(`Malformed WebSocket message from client: ${err.message}`);
      }
    });
  }

  handleDisconnect(client: WebSocket) {
    // Clear pending timeout if any
    const timeout = this.pendingAuthTimeouts.get(client);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingAuthTimeouts.delete(client);
    }

    const context = this.authenticatedClients.get(client);
    if (context) {
      this.authenticatedClients.delete(client);
      this.logger.debug(
        `WebSocket client disconnected [User: ${context.email} (${context.role})]. Remaining active: ${this.authenticatedClients.size}`,
      );
    }
  }

  /**
   * Broadcast newly created alert to all authenticated and authorized clients
   */
  broadcastAlert(alert: any) {
    if (this.authenticatedClients.size === 0) {
      this.logger.debug(`[WS Broadcast] No connected clients to receive alert '${alert.id}'`);
      return;
    }

    const payload = {
      event: 'alert.created',
      data: alert,
      timestamp: new Date().toISOString(),
    };

    let deliveredCount = 0;
    for (const [client, context] of this.authenticatedClients.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        this.safeSend(client, payload);
        deliveredCount++;
      }
    }

    this.logger.log(
      `[WS Broadcast] Alert '${alert.id}' (${alert.severity}) broadcast to ${deliveredCount}/${this.authenticatedClients.size} authenticated clients`,
    );
  }

  /**
   * Broadcast alert status transition (acknowledged, investigating, resolved, dismissed)
   */
  broadcastAlertUpdate(alert: any) {
    if (this.authenticatedClients.size === 0) {
      return;
    }

    const payload = {
      event: 'alert.updated',
      data: alert,
      timestamp: new Date().toISOString(),
    };

    for (const [client] of this.authenticatedClients.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        this.safeSend(client, payload);
      }
    }

    this.logger.log(
      `[WS Broadcast] Alert update '${alert.id}' (${alert.status}) broadcast to ${this.authenticatedClients.size} clients`,
    );
  }

  /**
   * Get active authenticated client count
   */
  getConnectedClientsCount(): number {
    return this.authenticatedClients.size;
  }

  /**
   * Register validated client, clear timeout, and send connection acknowledgement
   */
  private registerAuthenticatedClient(client: WebSocket, context: AuthenticatedClientContext) {
    // Clear auth timeout
    const timeout = this.pendingAuthTimeouts.get(client);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingAuthTimeouts.delete(client);
    }

    this.authenticatedClients.set(client, context);

    this.logger.log(
      `WebSocket client authenticated [User: ${context.email}, Role: ${context.role}]. Active connections: ${this.authenticatedClients.size}`,
    );

    // Send explicit connection acknowledgement
    this.safeSend(client, {
      event: 'connection_ack',
      data: {
        status: 'AUTHENTICATED',
        user_id: context.userId,
        email: context.email,
        role: context.role,
        department_id: context.departmentId,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Validate JWT access token and ensure role authorization
   */
  private async validateToken(token?: string): Promise<{
    valid: boolean;
    context?: AuthenticatedClientContext;
    errorCode?: string;
    message?: string;
  }> {
    if (!token || typeof token !== 'string') {
      return { valid: false, errorCode: 'UNAUTHORIZED', message: 'Missing authentication token' };
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      const decoded: any = await this.jwtService.verifyAsync(token, { secret });

      if (!decoded || !decoded.sub || !decoded.role) {
        return { valid: false, errorCode: 'UNAUTHORIZED', message: 'Malformed token payload' };
      }

      // Role check: Only authorized law enforcement roles can subscribe to live alerts
      if (!AUTHORIZED_ROLES.has(decoded.role)) {
        return {
          valid: false,
          errorCode: 'FORBIDDEN_RESOURCE',
          message: `Role '${decoded.role}' is not authorized to subscribe to live alert telemetry`,
        };
      }

      return {
        valid: true,
        context: {
          userId: decoded.sub,
          email: decoded.email || 'unknown',
          role: decoded.role,
          departmentId: decoded.departmentId,
          connectedAt: new Date(),
        },
      };
    } catch (err: any) {
      return {
        valid: false,
        errorCode: 'UNAUTHORIZED',
        message: 'Invalid or expired JWT token',
      };
    }
  }

  /**
   * Extract token from HTTP upgrade request (header or query param)
   */
  private extractTokenFromRequest(req: IncomingMessage): string | null {
    // 1. Authorization header: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }

    // 2. Query parameter: ?token=<token>
    if (req.url && req.url.includes('token=')) {
      try {
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');
        if (token) return token.trim();
      } catch {
        // Ignore URL parse error
      }
    }

    return null;
  }

  /**
   * Reject and terminate an unauthorized or malformed client connection
   */
  private rejectClient(client: WebSocket, errorCode: string, message: string, closeCode = 4401) {
    this.safeSend(client, {
      event: 'error',
      data: {
        error_code: errorCode,
        message,
      },
      timestamp: new Date().toISOString(),
    });

    setTimeout(() => {
      try {
        client.close(closeCode, message);
      } catch {
        // Ignore error if already closed
      }
    }, 50);
  }

  /**
   * Safely transmit stringified JSON over active WebSocket
   */
  private safeSend(client: WebSocket, payload: any) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(payload));
      } catch (err: any) {
        this.logger.warn(`Failed to send WebSocket message: ${err.message}`);
      }
    }
  }
}
