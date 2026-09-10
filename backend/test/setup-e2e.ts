import { NestApplication } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';

// Automatically configure WsAdapter for all E2E test suites when AppModule initializes
const originalInit = NestApplication.prototype.init;
NestApplication.prototype.init = async function (...args: any[]) {
  try {
    this.useWebSocketAdapter(new WsAdapter(this as any));
  } catch {
    // Ignore if already set or not applicable
  }
  return originalInit.apply(this, args);
};
