// ==============================================================================
// Real-Time Alert WebSocket Client
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7.1, Section 8.2: WS /ws/alerts)
// ==============================================================================

import { AlertItem, ConnectionStatus } from '@/types/alert';
import { tokenStorage } from '@/lib/auth/session';

export interface AlertSocketCallbacks {
  onAlertCreated?: (alert: AlertItem) => void;
  onAlertUpdated?: (alert: AlertItem) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onError?: (err: { error_code: string; message: string }) => void;
}

export class AlertWebSocketClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'OFFLINE';
  private callbacks: AlertSocketCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private isExplicitDisconnect = false;

  constructor(callbacks: AlertSocketCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Connect to backend WebSocket gateway /ws/alerts
   */
  connect(): void {
    if (typeof window === 'undefined') return;

    this.isExplicitDisconnect = false;

    // Determine target WS URL
    const envWs = process.env.NEXT_PUBLIC_WS_URL;
    let wsUrl = envWs;
    if (!wsUrl) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
      wsUrl = apiUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '') + '/ws/alerts';
    }

    const token = tokenStorage.getAccessToken();
    if (!token) {
      this.updateStatus('OFFLINE');
      return;
    }

    try {
      this.updateStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'OFFLINE');
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // Authenticate immediately upon connection using in-band message
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'auth', token }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.event === 'connection_ack') {
            this.reconnectAttempts = 0;
            this.updateStatus('LIVE');
            this.startPing();
          } else if (payload.event === 'alert.created') {
            if (this.callbacks.onAlertCreated && payload.data) {
              this.callbacks.onAlertCreated(payload.data);
            }
          } else if (payload.event === 'alert.updated') {
            if (this.callbacks.onAlertUpdated && payload.data) {
              this.callbacks.onAlertUpdated(payload.data);
            }
          } else if (payload.event === 'error') {
            if (this.callbacks.onError) {
              this.callbacks.onError(payload.data);
            }
          }
        } catch (parseErr) {
          // Ignore malformed message
        }
      };

      this.ws.onerror = () => {
        // Handled in onclose
      };

      this.ws.onclose = (event) => {
        this.stopPing();

        if (this.isExplicitDisconnect) {
          this.updateStatus('OFFLINE');
          return;
        }

        // If closed due to auth rejection (4401 or 4403), switch to POLLING FALLBACK directly
        if (event.code === 4401 || event.code === 4403) {
          this.updateStatus('POLLING FALLBACK');
          return;
        }

        // Attempt reconnect with backoff
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 5000);
          this.updateStatus('RECONNECTING');

          this.reconnectTimer = setTimeout(() => {
            this.connect();
          }, delay);
        } else {
          // Reconnect exhausted: Switch to POLLING FALLBACK
          this.updateStatus('POLLING FALLBACK');
        }
      };
    } catch (connErr) {
      this.updateStatus('POLLING FALLBACK');
    }
  }

  /**
   * Explicitly disconnect and cleanup resources
   */
  disconnect(): void {
    this.isExplicitDisconnect = true;
    this.stopPing();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }

    this.updateStatus('OFFLINE');
  }

  /**
   * Periodic keepalive ping
   */
  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // Ignore ping error
        }
      }
    }, 20000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private updateStatus(newStatus: ConnectionStatus): void {
    this.status = newStatus;
    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange(newStatus);
    }
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }
}
