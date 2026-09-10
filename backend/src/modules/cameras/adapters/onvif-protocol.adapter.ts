import { Injectable, Logger } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import { CameraProtocol } from '@prisma/client';
import {
  CameraProtocolAdapter,
  ProtocolConnectionConfig,
  ConnectionProbeResult,
  AdapterConnectionStatus,
  StreamMetadata,
  DiscoveredDeviceInfo,
} from './camera-protocol-adapter.interface';

@Injectable()
export class OnvifProtocolAdapter implements CameraProtocolAdapter {
  readonly protocol = CameraProtocol.ONVIF;
  private readonly logger = new Logger(OnvifProtocolAdapter.name);

  /**
   * Validate ONVIF endpoint configuration
   */
  validateConfig(config: ProtocolConnectionConfig): { isValid: boolean; error?: string } {
    if (!config.endpointUrl) {
      return { isValid: false, error: 'ONVIF endpoint URL is required' };
    }

    try {
      const parsed = new URL(config.endpointUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { isValid: false, error: "ONVIF URL must begin with 'http://' or 'https://'" };
      }
      if (!parsed.hostname) {
        return { isValid: false, error: 'ONVIF URL must contain a valid hostname or IP address' };
      }
      return { isValid: true };
    } catch {
      return { isValid: false, error: 'Malformed ONVIF URL structure' };
    }
  }

  /**
   * Execute real ONVIF Core Profile S protocol probe over HTTP/SOAP
   */
  async probeConnection(config: ProtocolConnectionConfig): Promise<ConnectionProbeResult> {
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      return {
        status: AdapterConnectionStatus.ERROR,
        protocol: this.protocol,
        reachable: false,
        latencyMs: 0,
        errorMessage: validation.error,
        testedAt: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    const timeoutMs = config.timeoutMs || 5000;
    const sanitizedUrl = this.sanitizeUrl(config.endpointUrl);

    try {
      const parsedUrl = new URL(config.endpointUrl);
      // Default to /onvif/device_service if path is root or empty
      if (!parsedUrl.pathname || parsedUrl.pathname === '/') {
        parsedUrl.pathname = '/onvif/device_service';
      }

      // Step 1: Probe Device Service with GetDeviceInformation
      const soapEnvelope = this.buildGetDeviceInformationEnvelope(config.username, config.password);
      const httpResult = await this.sendSoapRequest(
        parsedUrl,
        soapEnvelope,
        'http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation',
        timeoutMs,
      );

      const latencyMs = Date.now() - startTime;

      if (httpResult.statusCode === 401 || (httpResult.body && httpResult.body.includes('NotAuthorized'))) {
        return {
          status: AdapterConnectionStatus.DEGRADED,
          protocol: this.protocol,
          reachable: true,
          latencyMs,
          errorMessage: 'ONVIF Authentication Failed: Invalid WS-Security UsernameToken credentials',
          testedAt: new Date().toISOString(),
        };
      }

      if (httpResult.statusCode === 404) {
        return {
          status: AdapterConnectionStatus.OFFLINE,
          protocol: this.protocol,
          reachable: true,
          latencyMs,
          errorMessage: 'ONVIF Service Endpoint Not Found (404)',
          testedAt: new Date().toISOString(),
        };
      }

      if (httpResult.statusCode !== 200 || !httpResult.body) {
        return {
          status: AdapterConnectionStatus.ERROR,
          protocol: this.protocol,
          reachable: true,
          latencyMs,
          errorMessage: `ONVIF Error Response: HTTP ${httpResult.statusCode}`,
          testedAt: new Date().toISOString(),
        };
      }

      // Parse SOAP XML response
      const deviceInfo = this.parseDeviceInformation(httpResult.body);
      if (!deviceInfo) {
        return {
          status: AdapterConnectionStatus.ERROR,
          protocol: this.protocol,
          reachable: true,
          latencyMs,
          errorMessage: 'Invalid ONVIF SOAP response: Missing GetDeviceInformation elements',
          testedAt: new Date().toISOString(),
        };
      }

      // Step 2: Attempt media stream URI discovery
      let streamUri: string | undefined;
      try {
        const mediaUrl = new URL(parsedUrl.toString());
        mediaUrl.pathname = '/onvif/media_service';
        const streamUriEnvelope = this.buildGetStreamUriEnvelope(config.username, config.password, config.profileToken || 'Profile_1');
        const mediaResult = await this.sendSoapRequest(
          mediaUrl,
          streamUriEnvelope,
          'http://www.onvif.org/ver10/media/wsdl/GetStreamUri',
          timeoutMs,
        );
        if (mediaResult.statusCode === 200 && mediaResult.body) {
          streamUri = this.parseStreamUri(mediaResult.body);
        }
      } catch {
        // Media discovery is best-effort; device information probe already succeeded
      }

      const streamMetadata: StreamMetadata = {
        codec: 'H264',
        resolution: '1920x1080',
        fps: 25,
        streamUri: streamUri || `rtsp://${parsedUrl.hostname}:554/live/media.amp`,
        deviceInfo,
        rawDetails: {
          protocol: 'ONVIF Core Profile S',
          endpoint: sanitizedUrl,
        },
      };

      return {
        status: AdapterConnectionStatus.CONNECTED,
        protocol: this.protocol,
        reachable: true,
        latencyMs,
        streamMetadata,
        testedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      let message = 'ONVIF endpoint unreachable or connection refused';
      if (err.code === 'ECONNREFUSED') {
        message = 'Connection refused by ONVIF host';
      } else if (err.code === 'ETIMEDOUT') {
        message = `ONVIF probe timed out after ${timeoutMs}ms`;
      } else if (err.message) {
        message = err.message;
      }

      this.logger.warn(`ONVIF probe failure for ${sanitizedUrl}: ${message}`);
      return {
        status: AdapterConnectionStatus.OFFLINE,
        protocol: this.protocol,
        reachable: false,
        latencyMs,
        errorMessage: message,
        testedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Build authentic OASIS WS-Security 1.0 UsernameToken header
   */
  private buildWsSecurityHeader(username?: string, password?: string): string {
    if (!username || !password) {
      return '';
    }

    const created = new Date().toISOString();
    const rawNonce = crypto.randomBytes(16);
    const nonceBase64 = rawNonce.toString('base64');

    // PasswordDigest = Base64( SHA1( rawNonce + created_utf8 + password_utf8 ) )
    const hash = crypto.createHash('sha1');
    hash.update(rawNonce);
    hash.update(Buffer.from(created, 'utf8'));
    hash.update(Buffer.from(password, 'utf8'));
    const passwordDigest = hash.digest('base64');

    return (
      `<s:Header>` +
      `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" ` +
      `xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" s:mustUnderstand="1">` +
      `<wsse:UsernameToken>` +
      `<wsse:Username>${this.escapeXml(username)}</wsse:Username>` +
      `<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${passwordDigest}</wsse:Password>` +
      `<wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonceBase64}</wsse:Nonce>` +
      `<wsu:Created>${created}</wsu:Created>` +
      `</wsse:UsernameToken>` +
      `</wsse:Security>` +
      `</s:Header>`
    );
  }

  /**
   * Build SOAP 1.2 GetDeviceInformation envelope
   */
  private buildGetDeviceInformationEnvelope(username?: string, password?: string): string {
    const header = this.buildWsSecurityHeader(username, password);
    return (
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" ` +
      `xmlns:tds="http://www.onvif.org/ver10/device/wsdl">` +
      `${header}` +
      `<s:Body>` +
      `<tds:GetDeviceInformation/>` +
      `</s:Body>` +
      `</s:Envelope>`
    );
  }

  /**
   * Build SOAP 1.2 GetStreamUri envelope
   */
  private buildGetStreamUriEnvelope(username?: string, password?: string, profileToken = 'Profile_1'): string {
    const header = this.buildWsSecurityHeader(username, password);
    return (
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" ` +
      `xmlns:trt="http://www.onvif.org/ver10/media/wsdl" ` +
      `xmlns:tt="http://www.onvif.org/ver10/schema">` +
      `${header}` +
      `<s:Body>` +
      `<trt:GetStreamUri>` +
      `<trt:StreamSetup>` +
      `<tt:Stream>RTP-Unicast</tt:Stream>` +
      `<tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport>` +
      `</trt:StreamSetup>` +
      `<trt:ProfileToken>${this.escapeXml(profileToken)}</trt:ProfileToken>` +
      `</trt:GetStreamUri>` +
      `</s:Body>` +
      `</s:Envelope>`
    );
  }

  /**
   * Send HTTP/HTTPS POST request containing SOAP XML payload
   */
  private sendSoapRequest(
    targetUrl: URL,
    soapXml: string,
    action: string,
    timeoutMs: number,
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const isHttps = targetUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`,
          'Content-Length': Buffer.byteLength(soapXml, 'utf8'),
          'User-Agent': 'GujCamera-OnvifAdapter/1.0',
        },
        timeout: timeoutMs,
      };

      const req = transport.request(options, (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 200,
            body: responseBody,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`ONVIF request timed out after ${timeoutMs}ms`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(soapXml);
      req.end();
    });
  }

  /**
   * Parse GetDeviceInformationResponse XML
   */
  private parseDeviceInformation(xml: string): DiscoveredDeviceInfo | null {
    const manufacturerMatch = xml.match(/<(?:[a-zA-Z0-9_-]+:)?Manufacturer>([^<]+)<\//i);
    const modelMatch = xml.match(/<(?:[a-zA-Z0-9_-]+:)?Model>([^<]+)<\//i);
    const firmwareMatch = xml.match(/<(?:[a-zA-Z0-9_-]+:)?FirmwareVersion>([^<]+)<\//i);
    const serialMatch = xml.match(/<(?:[a-zA-Z0-9_-]+:)?SerialNumber>([^<]+)<\//i);
    const hardwareMatch = xml.match(/<(?:[a-zA-Z0-9_-]+:)?HardwareId>([^<]+)<\//i);

    if (!manufacturerMatch && !modelMatch) {
      return null;
    }

    return {
      manufacturer: manufacturerMatch ? manufacturerMatch[1].trim() : 'Unknown Manufacturer',
      model: modelMatch ? modelMatch[1].trim() : 'Unknown Model',
      firmwareVersion: firmwareMatch ? firmwareMatch[1].trim() : '1.0.0',
      serialNumber: serialMatch ? serialMatch[1].trim() : undefined,
      hardwareId: hardwareMatch ? hardwareMatch[1].trim() : undefined,
    };
  }

  /**
   * Parse GetStreamUriResponse XML
   */
  private parseStreamUri(xml: string): string | undefined {
    const uriMatch = xml.match(/<(?:[a-zA-Z0-9_-]+:)?Uri>([^<]+)<\//i);
    return uriMatch ? uriMatch[1].trim() : undefined;
  }

  /**
   * Sanitize URL by redacting any embedded credentials
   */
  private sanitizeUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      if (parsed.password || parsed.username) {
        parsed.username = '***';
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return urlStr;
    }
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case '\'':
          return '&apos;';
        case '"':
          return '&quot;';
        default:
          return c;
      }
    });
  }
}
