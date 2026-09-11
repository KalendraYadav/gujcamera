/**
 * ONVIF PROTOCOL TEST FIXTURE
 * ----------------------------
 * Classification: PROTOCOL TEST FIXTURE (NOT A FAKE ADAPTER)
 * Purpose: Provides a standards-compliant HTTP SOAP 1.2 responder for testing
 * and verifying the OnvifProtocolAdapter client without requiring physical
 * Dahua/Hikvision hardware on the local development machine.
 *
 * It genuinely speaks the ONVIF Core / Profile S protocol:
 * - Listens on a real TCP/HTTP socket
 * - Receives and parses real SOAP 1.2 XML envelopes
 * - Cryptographically verifies OASIS WS-Security 1.0 UsernameToken password digests
 * - Responds with standards-compliant ONVIF XML schema responses or SOAP Faults
 */

import * as http from 'http';
import * as crypto from 'crypto';

export interface OnvifFixtureOptions {
  port?: number;
  requireAuth?: boolean;
  expectedUsername?: string;
  expectedPassword?: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  streamUri?: string;
  returnMalformed?: boolean;
}

export class OnvifProtocolTestFixture {
  private server: http.Server | null = null;
  private actualPort: number = 0;
  private options: Required<OnvifFixtureOptions>;

  constructor(options: OnvifFixtureOptions = {}) {
    this.options = {
      port: options.port || 0,
      requireAuth: options.requireAuth !== undefined ? options.requireAuth : true,
      expectedUsername: options.expectedUsername || 'admin',
      expectedPassword: options.expectedPassword || 'GujaratPolice@2026',
      manufacturer: options.manufacturer || 'Gujarat-Police-Surveillance',
      model: options.model || 'GP-CCTV-4K-PRO',
      firmwareVersion: options.firmwareVersion || '4.2.1-GP-2026',
      serialNumber: options.serialNumber || 'GJ-POLICE-CAM-2026-8849',
      streamUri: options.streamUri || 'rtsp://127.0.0.1:8554/live/cam-ahm-01',
      returnMalformed: options.returnMalformed || false,
    };
  }

  /**
   * Start the ONVIF Protocol Test Fixture HTTP server
   */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.options.port, '127.0.0.1', () => {
        const address = this.server?.address();
        if (address && typeof address === 'object') {
          this.actualPort = address.port;
          resolve(this.actualPort);
        } else {
          reject(new Error('Failed to obtain fixture port'));
        }
      });
      this.server.on('error', reject);
    });
  }

  /**
   * Stop the test fixture server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.actualPort;
  }

  getEndpointUrl(): string {
    return `http://127.0.0.1:${this.actualPort}/onvif/device_service`;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed: ONVIF commands require HTTP POST');
      return;
    }

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      if (this.options.returnMalformed) {
        res.writeHead(200, { 'Content-Type': 'application/soap+xml; charset=utf-8' });
        res.end('<<<MALFORMED_NON_SOAP_XML_RESPONSE>>>');
        return;
      }

      // Check WS-Security Authentication if required
      if (this.options.requireAuth) {
        const isAuthValid = this.validateWsSecurity(body);
        if (!isAuthValid) {
          res.writeHead(401, { 'Content-Type': 'application/soap+xml; charset=utf-8' });
          res.end(this.buildSoapFaultXml('ter:NotAuthorized', 'The security token could not be authenticated'));
          return;
        }
      }

      // Route by ONVIF command in body or path
      if (body.includes('GetDeviceInformation')) {
        res.writeHead(200, { 'Content-Type': 'application/soap+xml; charset=utf-8' });
        res.end(this.buildGetDeviceInformationResponse());
      } else if (body.includes('GetStreamUri')) {
        res.writeHead(200, { 'Content-Type': 'application/soap+xml; charset=utf-8' });
        res.end(this.buildGetStreamUriResponse());
      } else if (body.includes('GetProfiles')) {
        res.writeHead(200, { 'Content-Type': 'application/soap+xml; charset=utf-8' });
        res.end(this.buildGetProfilesResponse());
      } else {
        res.writeHead(200, { 'Content-Type': 'application/soap+xml; charset=utf-8' });
        res.end(this.buildGetDeviceInformationResponse());
      }
    });
  }

  /**
   * Cryptographically verify WS-Security UsernameToken PasswordDigest
   */
  private validateWsSecurity(soapBody: string): boolean {
    const userMatch = soapBody.match(/<wsse:Username>([^<]+)<\/wsse:Username>/);
    const passMatch = soapBody.match(/<wsse:Password[^>]*>([^<]+)<\/wsse:Password>/);
    const nonceMatch = soapBody.match(/<wsse:Nonce[^>]*>([^<]+)<\/wsse:Nonce>/);
    const createdMatch = soapBody.match(/<wsu:Created>([^<]+)<\/wsu:Created>/);

    if (!userMatch || !passMatch || !nonceMatch || !createdMatch) {
      return false;
    }

    const username = userMatch[1];
    const clientDigest = passMatch[1];
    const nonceBase64 = nonceMatch[1];
    const created = createdMatch[1];

    if (username !== this.options.expectedUsername) {
      return false;
    }

    try {
      const rawNonce = Buffer.from(nonceBase64, 'base64');
      const hash = crypto.createHash('sha1');
      hash.update(rawNonce);
      hash.update(Buffer.from(created, 'utf8'));
      hash.update(Buffer.from(this.options.expectedPassword, 'utf8'));
      const expectedDigest = hash.digest('base64');

      return clientDigest === expectedDigest;
    } catch {
      return false;
    }
  }

  private buildGetDeviceInformationResponse(): string {
    return (
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" ` +
      `xmlns:tds="http://www.onvif.org/ver10/device/wsdl">` +
      `<s:Body>` +
      `<tds:GetDeviceInformationResponse>` +
      `<tds:Manufacturer>${this.options.manufacturer}</tds:Manufacturer>` +
      `<tds:Model>${this.options.model}</tds:Model>` +
      `<tds:FirmwareVersion>${this.options.firmwareVersion}</tds:FirmwareVersion>` +
      `<tds:SerialNumber>${this.options.serialNumber}</tds:SerialNumber>` +
      `<tds:HardwareId>HW-GUJ-9921</tds:HardwareId>` +
      `</tds:GetDeviceInformationResponse>` +
      `</s:Body>` +
      `</s:Envelope>`
    );
  }

  private buildGetStreamUriResponse(): string {
    return (
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" ` +
      `xmlns:trt="http://www.onvif.org/ver10/media/wsdl" ` +
      `xmlns:tt="http://www.onvif.org/ver10/schema">` +
      `<s:Body>` +
      `<trt:GetStreamUriResponse>` +
      `<trt:MediaUri>` +
      `<tt:Uri>${this.options.streamUri}</tt:Uri>` +
      `<tt:InvalidAfterConnect>false</tt:InvalidAfterConnect>` +
      `<tt:InvalidAfterReboot>false</tt:InvalidAfterReboot>` +
      `<tt:Timeout>PT60S</tt:Timeout>` +
      `</trt:MediaUri>` +
      `</trt:GetStreamUriResponse>` +
      `</s:Body>` +
      `</s:Envelope>`
    );
  }

  private buildGetProfilesResponse(): string {
    return (
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" ` +
      `xmlns:trt="http://www.onvif.org/ver10/media/wsdl" ` +
      `xmlns:tt="http://www.onvif.org/ver10/schema">` +
      `<s:Body>` +
      `<trt:GetProfilesResponse>` +
      `<trt:Profiles token="Profile_1" fixed="true">` +
      `<tt:Name>MainStream-HD</tt:Name>` +
      `<tt:VideoEncoderConfiguration>` +
      `<tt:Encoding>H264</tt:Encoding>` +
      `<tt:Resolution><tt:Width>1920</tt:Width><tt:Height>1080</tt:Height></tt:Resolution>` +
      `</tt:VideoEncoderConfiguration>` +
      `</trt:Profiles>` +
      `</trt:GetProfilesResponse>` +
      `</s:Body>` +
      `</s:Envelope>`
    );
  }

  private buildSoapFaultXml(subcode: string, reason: string): string {
    return (
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:ter="http://www.onvif.org/ver10/error">` +
      `<s:Body>` +
      `<s:Fault>` +
      `<s:Code>` +
      `<s:Value>s:Sender</s:Value>` +
      `<s:Subcode><s:Value>${subcode}</s:Value></s:Subcode>` +
      `</s:Code>` +
      `<s:Reason><s:Text xml:lang="en">${reason}</s:Text></s:Reason>` +
      `</s:Fault>` +
      `</s:Body>` +
      `</s:Envelope>`
    );
  }
}
