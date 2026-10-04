import { CameraHealthPollerService, CameraRuntimeHealth } from './camera-health-poller.service';
import { OperationalStatus, CameraProtocol, CredentialType } from '@prisma/client';

describe('CameraHealthPollerService (Phase 4: Health Monitoring & Reconnection)', () => {
  let service: CameraHealthPollerService;
  let mockPrisma: any;
  let mockConfigService: any;
  let mockMediaGateway: any;
  let mockRedisClient: any;
  let mockCredentialStore: any;

  const mockCameraOnline = {
    id: 'c1111111-1111-1111-1111-111111111111',
    name: 'CAM-AHM-01: SG Highway',
    operationalStatus: OperationalStatus.ONLINE,
    isActive: true,
    protocol: CameraProtocol.RTSP,
    streams: [
      {
        id: 's1',
        urlOrHandle: 'rtsp://video-gateway:8554/cam-ahm-01',
      },
    ],
    health: {
      status: OperationalStatus.ONLINE,
      lastHeartbeat: new Date(),
      fpsActual: 15.0,
      packetLoss: 0.0,
    },
    credential: null,
  };

  const mockCameraExternal = {
    id: 'c2222222-2222-2222-2222-222222222222',
    name: 'CAM-SUR-01: Ring Road',
    operationalStatus: OperationalStatus.ONLINE,
    isActive: true,
    protocol: CameraProtocol.RTSP,
    streams: [
      {
        id: 's2',
        urlOrHandle: 'rtsp://10.20.4.15:554/live',
      },
    ],
    health: {
      status: OperationalStatus.ONLINE,
      lastHeartbeat: new Date(),
      fpsActual: 15.0,
      packetLoss: 0.0,
    },
    credential: {
      id: 'cred-1',
      credentialType: CredentialType.BASIC_AUTH,
    },
  };

  beforeEach(() => {
    mockPrisma = {
      camera: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      cameraHealth: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((actions) => {
        if (typeof actions === 'function') {
          return actions(mockPrisma);
        }
        return Promise.all(actions);
      }),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultVal?: string) => {
        if (key === 'CAMERA_HEALTH_AUTO_START') return 'false';
        if (key === 'CAMERA_HEALTH_POLL_INTERVAL_MS') return '15000';
        if (key === 'CAMERA_RECONNECT_INITIAL_DELAY_MS') return '2000';
        if (key === 'CAMERA_RECONNECT_MAX_DELAY_MS') return '30000';
        if (key === 'CAMERA_RECONNECT_MAX_ATTEMPTS') return '5';
        if (key === 'CAMERA_HEALTH_POLL_BATCH_SIZE') return '50';
        return defaultVal;
      }),
    };

    mockMediaGateway = {
      apiUrl: 'http://localhost:9997',
      normalizePathName: jest.fn((name: string, id: string) => {
        const match = name.match(/^(cam[-_][a-z0-9_-]+)/i);
        if (match) return match[1].toLowerCase();
        return `cam-${id.slice(0, 8)}`;
      }),
      isInternalGatewayStream: jest.fn((url: string) => url.includes('video-gateway:8554') || url.includes('simulator:8554')),
      isPullableExternalSource: jest.fn((url: string) => !url.includes('video-gateway') && !url.includes('simulator') && !url.startsWith('mock://') && !url.startsWith('placeholder://')),
      isPlaceholderStream: jest.fn((url: string) => url.startsWith('mock://') || url.startsWith('placeholder://')),
      extractStreamPath: jest.fn((url: string) => {
        const match = url.match(/(?:rtsp:\/\/[^\/]+\/|mock:\/\/[^\/]+\/)(.*)/i);
        return match ? match[1].replace(/^\/+|\/+$/g, '') : '';
      }),
      listPathStates: jest.fn(),
      getPathState: jest.fn(),
      registerPath: jest.fn().mockResolvedValue({ success: true, internalRtspUrl: 'rtsp://video-gateway:8554/cam-sur-01' }),
      removePath: jest.fn().mockResolvedValue({ success: true }),
    };

    mockRedisClient = {
      hset: jest.fn().mockResolvedValue(1),
      hdel: jest.fn().mockResolvedValue(1),
      pubsubPublish: jest.fn().mockResolvedValue(1),
    };

    mockCredentialStore = {
      getDecryptedCredential: jest.fn().mockResolvedValue({
        username: 'surat_admin',
        password: 'VaultSecretPassword2026!',
      }),
    };

    service = new CameraHealthPollerService(
      mockPrisma,
      mockConfigService,
      mockMediaGateway,
      mockRedisClient,
      mockCredentialStore,
    );
  });

  afterEach(() => {
    service.stopPollingLoop();
    jest.clearAllMocks();
  });

  // ============================================================================
  // TEST 1: ONLINE -> ONLINE (No unnecessary DB or audit writes)
  // ============================================================================
  it('1. ONLINE -> ONLINE: does NOT write to database or audit logs when stream remains healthy', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraOnline]);

    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: true });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    // Initial poll: establishes baseline state
    await service.pollActiveCameras();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();

    // Subsequent poll: state is still ONLINE -> ONLINE
    await service.pollActiveCameras();

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.camera.update).not.toHaveBeenCalled();
    expect(mockPrisma.cameraHealth.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();

    const metrics = service.getMetrics();
    expect(metrics.camerasOnline).toBe(1);
    expect(metrics.camerasDegraded).toBe(0);
    expect(metrics.camerasOffline).toBe(0);
  });

  // ============================================================================
  // TEST 2: ONLINE -> DEGRADED
  // ============================================================================
  it('2. ONLINE -> DEGRADED: transitions camera to DEGRADED and records transition when stream drops', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraOnline]);

    // Path is not ready in MediaMTX
    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: false });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    await service.pollActiveCameras();

    // Must persist transition to database
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.camera.update).toHaveBeenCalledWith({
      where: { id: mockCameraOnline.id },
      data: { operationalStatus: OperationalStatus.DEGRADED },
    });
    expect(mockPrisma.cameraHealth.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cameraId: mockCameraOnline.id },
        update: expect.objectContaining({ status: OperationalStatus.DEGRADED }),
      }),
    );

    // Must record audit log for degradation
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CAMERA_HEALTH_DEGRADED',
          resource: 'CameraHealth',
          before: { status: OperationalStatus.ONLINE },
          after: expect.objectContaining({ status: OperationalStatus.DEGRADED }),
        }),
      }),
    );

    // Must sync degraded state to Redis
    expect(mockRedisClient.hset).toHaveBeenCalledWith(
      'gujcamera:registry:active-streams',
      mockCameraOnline.id,
      expect.stringContaining('"status":"DEGRADED"'),
    );

    const runtime = service.getRuntimeState(mockCameraOnline.id);
    expect(runtime?.status).toBe(OperationalStatus.DEGRADED);
    expect(runtime?.consecutiveFailures).toBe(1);
  });

  // ============================================================================
  // TEST 3: DEGRADED -> OFFLINE
  // ============================================================================
  it('3. DEGRADED -> OFFLINE: transitions to OFFLINE when reconnect attempts reach max limit', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraOnline]);

    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: false });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    // Simulate camera reaching max retry threshold in runtime
    const runtime = (service as any).getOrCreateRuntimeState(mockCameraOnline, 'cam-ahm-01');
    runtime.status = OperationalStatus.DEGRADED;
    runtime.reconnectAttempts = 5; // max threshold configured in beforeEach

    await service.pollActiveCameras();

    // Must persist OFFLINE state
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.camera.update).toHaveBeenCalledWith({
      where: { id: mockCameraOnline.id },
      data: { operationalStatus: OperationalStatus.OFFLINE },
    });

    // Must record CAMERA_RECONNECT_EXHAUSTED and CAMERA_OFFLINE audit records
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CAMERA_RECONNECT_EXHAUSTED',
        }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CAMERA_OFFLINE',
        }),
      }),
    );

    expect(runtime.status).toBe(OperationalStatus.OFFLINE);
  });

  // ============================================================================
  // TEST 4: OFFLINE -> ONLINE recovery
  // ============================================================================
  it('4. OFFLINE -> ONLINE recovery: restores camera to ONLINE and publishes ACTIVATE event', async () => {
    const offlineCamera = {
      ...mockCameraOnline,
      operationalStatus: OperationalStatus.OFFLINE,
      health: {
        status: OperationalStatus.OFFLINE,
        lastHeartbeat: new Date(),
        fpsActual: 0,
        packetLoss: null,
      },
    };
    mockPrisma.camera.findMany.mockResolvedValue([offlineCamera]);

    // Stream recovers in MediaMTX
    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: true });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    await service.pollActiveCameras();

    // Must persist recovery to ONLINE
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.camera.update).toHaveBeenCalledWith({
      where: { id: offlineCamera.id },
      data: { operationalStatus: OperationalStatus.ONLINE },
    });

    // Must record CAMERA_RECOVERED audit log
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CAMERA_RECOVERED',
          after: expect.objectContaining({ status: OperationalStatus.ONLINE }),
        }),
      }),
    );

    // Must publish Redis ACTIVATE event for AI worker
    expect(mockRedisClient.pubsubPublish).toHaveBeenCalledWith(
      'gujcamera:control:camera-events',
      expect.stringContaining('"action":"ACTIVATE"'),
    );

    const runtime = service.getRuntimeState(offlineCamera.id);
    expect(runtime?.status).toBe(OperationalStatus.ONLINE);
    expect(runtime?.reconnectAttempts).toBe(0);
    expect(runtime?.consecutiveFailures).toBe(0);
    expect(runtime?.recoveryAt).toBeInstanceOf(Date);
  });

  // ============================================================================
  // TEST 5: ERROR state caused by authentication/configuration failure
  // ============================================================================
  it('5. ERROR state: transitions to ERROR when gateway reports authentication rejection', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraExternal]);
    mockPrisma.camera.findUnique.mockResolvedValue(mockCameraExternal);

    // MediaMTX path is missing/not ready
    const pathStates = new Map();
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    // Reconnection path registration fails due to 401 Unauthorized
    mockMediaGateway.registerPath.mockResolvedValueOnce({
      success: false,
      error: 'MediaMTX ADD failed with HTTP 401: Unauthorized',
    });

    await service.pollActiveCameras();

    // Must transition to ERROR state
    expect(mockPrisma.camera.update).toHaveBeenCalledWith({
      where: { id: mockCameraExternal.id },
      data: { operationalStatus: OperationalStatus.ERROR },
    });

    // Must record CAMERA_ERROR audit log
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CAMERA_ERROR',
          after: expect.objectContaining({
            status: OperationalStatus.ERROR,
            reason: 'Authentication failure from camera source',
          }),
        }),
      }),
    );

    const runtime = service.getRuntimeState(mockCameraExternal.id);
    expect(runtime?.status).toBe(OperationalStatus.ERROR);
  });

  // ============================================================================
  // TEST 6: Exponential backoff calculation
  // ============================================================================
  it('6. Exponential backoff: calculates bounded exponential delays and respects backoff window', async () => {
    const runtime = (service as any).getOrCreateRuntimeState(mockCameraExternal, 'cam-sur-01');
    runtime.status = OperationalStatus.DEGRADED;
    runtime.reconnectAttempts = 0;
    runtime.nextReconnectAt = 0;

    mockPrisma.camera.findUnique.mockResolvedValue(mockCameraExternal);

    // First reconnect attempt: delay = min(2000 * 2^0, 30000) = 2000ms
    const beforeAttempt1 = Date.now();
    await service.attemptReconnection(mockCameraExternal, runtime, 'cam-sur-01');
    expect(runtime.reconnectAttempts).toBe(1);
    expect(runtime.nextReconnectAt).toBeGreaterThanOrEqual(beforeAttempt1 + 1900);
    expect(runtime.nextReconnectAt).toBeLessThanOrEqual(beforeAttempt1 + 2500);

    // Second reconnect attempt: delay = min(2000 * 2^1, 30000) = 4000ms
    const beforeAttempt2 = Date.now();
    await service.attemptReconnection(mockCameraExternal, runtime, 'cam-sur-01');
    expect(runtime.reconnectAttempts).toBe(2);
    expect(runtime.nextReconnectAt).toBeGreaterThanOrEqual(beforeAttempt2 + 3900);
    expect(runtime.nextReconnectAt).toBeLessThanOrEqual(beforeAttempt2 + 4500);

    // High attempt index capped at 30000ms max delay
    runtime.reconnectAttempts = 10;
    const beforeAttemptCapped = Date.now();
    await service.attemptReconnection(mockCameraExternal, runtime, 'cam-sur-01');
    expect(runtime.nextReconnectAt).toBeLessThanOrEqual(beforeAttemptCapped + 30100);
  });

  // ============================================================================
  // TEST 7: Maximum reconnect attempts
  // ============================================================================
  it('7. Maximum reconnect attempts: stops reconnecting after exceeding max configured attempts', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraOnline]);

    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: false });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    const runtime = (service as any).getOrCreateRuntimeState(mockCameraOnline, 'cam-ahm-01');
    runtime.status = OperationalStatus.DEGRADED;
    runtime.reconnectAttempts = 5; // equals maxAttempts = 5

    await service.pollActiveCameras();

    // Should transition to OFFLINE and not attempt further reconciliation
    expect(runtime.status).toBe(OperationalStatus.OFFLINE);
    expect(mockMediaGateway.registerPath).not.toHaveBeenCalled();
  });

  // ============================================================================
  // TEST 8: Recovery resets retry state
  // ============================================================================
  it('8. Recovery resets retry state: cleared backoff counters when camera recovers', async () => {
    const runtime = (service as any).getOrCreateRuntimeState(mockCameraOnline, 'cam-ahm-01');
    runtime.status = OperationalStatus.DEGRADED;
    runtime.consecutiveFailures = 4;
    runtime.reconnectAttempts = 3;
    runtime.failureReason = 'Temporary gateway drop';

    mockPrisma.camera.findMany.mockResolvedValue([mockCameraOnline]);

    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: true });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    await service.pollActiveCameras();

    expect(runtime.status).toBe(OperationalStatus.ONLINE);
    expect(runtime.reconnectAttempts).toBe(0);
    expect(runtime.consecutiveFailures).toBe(0);
    expect(runtime.failureReason).toBeNull();
  });

  // ============================================================================
  // TEST 9: Decommissioned camera is never resurrected
  // ============================================================================
  it('9. Decommission safety: decommissioned camera is removed from tracking and never resurrected', async () => {
    const decommissionedCamera = {
      ...mockCameraOnline,
      isActive: false,
      operationalStatus: OperationalStatus.OFFLINE,
    };

    // Pre-populate runtime state
    const runtime = (service as any).getOrCreateRuntimeState(decommissionedCamera, 'cam-ahm-01');
    expect(service.getRuntimeState(decommissionedCamera.id)).toBeDefined();

    // Call forgetCamera (as done by decommission flow)
    service.forgetCamera(decommissionedCamera.id);
    expect(service.getRuntimeState(decommissionedCamera.id)).toBeUndefined();

    // If evaluated directly, immediately drops tracking and returns OFFLINE without resurrecting
    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: true });
    const res = await service.evaluateCameraHealth(decommissionedCamera, pathStates, true);

    expect(res).toBe(OperationalStatus.OFFLINE);
    expect(mockPrisma.camera.update).not.toHaveBeenCalled();
    expect(mockMediaGateway.registerPath).not.toHaveBeenCalled();
  });

  // ============================================================================
  // TEST 10: Credential rotation does not reintroduce old credentials
  // ============================================================================
  it('10. Credential rotation: clears retry state and fetches current decrypted credential during reconnect', async () => {
    const runtime = (service as any).getOrCreateRuntimeState(mockCameraExternal, 'cam-sur-01');
    runtime.consecutiveFailures = 3;
    runtime.reconnectAttempts = 2;
    runtime.failureReason = 'Old credentials expired';

    // Notification of credential rotation
    service.notifyCredentialRotated(mockCameraExternal.id);

    expect(runtime.consecutiveFailures).toBe(0);
    expect(runtime.reconnectAttempts).toBe(0);
    expect(runtime.failureReason).toBeNull();

    mockPrisma.camera.findUnique.mockResolvedValue(mockCameraExternal);
    mockCredentialStore.getDecryptedCredential.mockResolvedValueOnce({
      username: 'new_operator',
      password: 'NewVaultPassword2026!',
    });

    await service.attemptReconnection(mockCameraExternal, runtime, 'cam-sur-01');

    // Reconnection used fresh decrypted credentials from the store
    expect(mockCredentialStore.getDecryptedCredential).toHaveBeenCalledWith(mockCameraExternal.id);
    expect(mockMediaGateway.registerPath).toHaveBeenCalledWith(
      'cam-sur-01',
      'rtsp://new_operator:NewVaultPassword2026!@10.20.4.15:554/live',
    );
  });

  // ============================================================================
  // TEST 11: MediaMTX unavailable
  // ============================================================================
  it('11. MediaMTX unavailable: handles gateway failure gracefully without unhandled exceptions', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraOnline]);
    mockMediaGateway.listPathStates.mockResolvedValue({
      success: false,
      paths: new Map(),
      error: 'connect ECONNREFUSED 127.0.0.1:9997',
    });

    await service.pollActiveCameras();

    const metrics = service.getMetrics();
    expect(metrics.healthCheckFailures).toBe(1);
    expect(metrics.camerasDegraded).toBe(1);

    const runtime = service.getRuntimeState(mockCameraOnline.id);
    expect(runtime?.status).toBe(OperationalStatus.DEGRADED);
    expect(runtime?.failureReason).toBe('Media gateway control plane unreachable');
  });

  // ============================================================================
  // TEST 12: MediaMTX path missing
  // ============================================================================
  it('12. MediaMTX path missing: triggers reconciliation when registered camera path is absent in gateway', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraExternal]);
    mockPrisma.camera.findUnique.mockResolvedValue(mockCameraExternal);

    // Empty path map (path missing)
    const emptyPaths = new Map();
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: emptyPaths });

    await service.pollActiveCameras();

    // Must trigger path registration reconciliation
    expect(mockMediaGateway.registerPath).toHaveBeenCalledWith(
      'cam-sur-01',
      expect.stringContaining('10.20.4.15:554/live'),
    );
  });

  // ============================================================================
  // TEST 13: Redis unavailable/failure handling
  // ============================================================================
  it('13. Redis failure resilience: continues operational health tracking even if Redis operations fail', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraOnline]);
    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: false });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    mockRedisClient.hset.mockRejectedValueOnce(new Error('Redis connection timed out'));

    // Should complete without throwing
    await expect(service.pollActiveCameras()).resolves.not.toThrow();

    // Database state was still persisted
    expect(mockPrisma.camera.update).toHaveBeenCalled();
  });

  // ============================================================================
  // TEST 14: Duplicate reconnect prevention
  // ============================================================================
  it('14. Duplicate reconnect prevention: skips concurrent reconnects while an active reconnect is underway', async () => {
    const runtime = (service as any).getOrCreateRuntimeState(mockCameraExternal, 'cam-sur-01');
    runtime.isReconnecting = true; // currently executing reconnect

    mockPrisma.camera.findMany.mockResolvedValue([mockCameraExternal]);
    const pathStates = new Map();
    pathStates.set('cam-sur-01', { name: 'cam-sur-01', ready: false });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    await service.pollActiveCameras();

    // Did not initiate a second reconnect while isReconnecting was true
    expect(mockMediaGateway.registerPath).not.toHaveBeenCalled();
  });

  // ============================================================================
  // TEST 15: Duplicate AI worker consumer prevention
  // ============================================================================
  it('15. Duplicate consumer prevention: only publishes ACTIVATE on genuine state recovery', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraOnline]);

    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: true });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    // Cycle 1: steady state ONLINE
    await service.pollActiveCameras();
    // Cycle 2: steady state ONLINE
    await service.pollActiveCameras();

    // ACTIVATE should not be published on steady-state ticks
    expect(mockRedisClient.pubsubPublish).not.toHaveBeenCalled();
  });

  // ============================================================================
  // TEST 16: No secret leakage in logs/errors/events
  // ============================================================================
  it('16. Zero secret leakage: never includes plaintext passwords in audit logs, Redis, or errors', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraExternal]);
    mockPrisma.camera.findUnique.mockResolvedValue(mockCameraExternal);

    const pathStates = new Map();
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    mockMediaGateway.registerPath.mockResolvedValueOnce({
      success: false,
      error: 'Authentication failed for user surat_admin: invalid secret',
    });

    await service.pollActiveCameras();

    // Verify all audit log payloads contain zero password material
    for (const call of mockPrisma.auditLog.create.mock.calls) {
      const payloadStr = JSON.stringify(call[0]);
      expect(payloadStr).not.toContain('VaultSecretPassword2026!');
      expect(payloadStr).not.toContain('password');
    }

    // Verify Redis stream registry contains no password
    for (const call of mockRedisClient.hset.mock.calls) {
      const payloadStr = JSON.stringify(call);
      expect(payloadStr).not.toContain('VaultSecretPassword2026!');
    }
  });

  // ============================================================================
  // TEST 17: Multiple cameras can be polled without blocking each other
  // ============================================================================
  it('17. Multi-camera bounded polling: checks multiple cameras concurrently in batches', async () => {
    const cameras = [
      { ...mockCameraOnline, id: 'cam-1', name: 'CAM-AHM-01' },
      { ...mockCameraOnline, id: 'cam-2', name: 'CAM-AHM-02' },
      { ...mockCameraOnline, id: 'cam-3', name: 'CAM-AHM-03' },
    ];
    mockPrisma.camera.findMany.mockResolvedValue(cameras);

    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: true });
    pathStates.set('cam-ahm-02', { name: 'cam-ahm-02', ready: false }); // Degraded
    pathStates.set('cam-ahm-03', { name: 'cam-ahm-03', ready: true });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    await service.pollActiveCameras();

    const metrics = service.getMetrics();
    expect(metrics.camerasChecked).toBe(3);
    expect(metrics.camerasOnline).toBe(2);
    expect(metrics.camerasDegraded).toBe(1);
  });

  // ============================================================================
  // TEST 18: Poller does not continuously write unchanged health state
  // ============================================================================
  it('18. Write storm prevention: 5 continuous polling cycles generate 0 database writes when state is steady', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([mockCameraOnline]);

    const pathStates = new Map();
    pathStates.set('cam-ahm-01', { name: 'cam-ahm-01', ready: true });
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    // Execute 5 continuous polling cycles
    for (let i = 0; i < 5; i++) {
      await service.pollActiveCameras();
    }

    // Zero DB writes across all 5 cycles
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.camera.update).not.toHaveBeenCalled();
    expect(mockPrisma.cameraHealth.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();

    const metrics = service.getMetrics();
    expect(metrics.totalPollCycles).toBe(5);
  });

  // ============================================================================
  // TEST 19: Placeholder/Mock cameras do not trigger MediaMTX registration
  // ============================================================================
  it('19. Placeholder stream isolation: mock:// cameras remain in configured status and never attempt MediaMTX registration', async () => {
    const mockCameraPlaceholder = {
      id: 'mock-gnd-01',
      name: 'CAM-GND-01: Gandhinagar Secretariat',
      isActive: true,
      operationalStatus: OperationalStatus.OFFLINE,
      departmentId: 'dept-01',
      streams: [
        {
          id: 'stream-mock-01',
          urlOrHandle: 'mock://vendor-a/gnd-sec-01',
          streamType: 'SUB',
          protocol: 'MOCK',
        },
      ],
      health: {
        status: OperationalStatus.OFFLINE,
        lastHeartbeat: new Date(),
        fpsActual: 0,
        packetLoss: 100,
      },
    };

    mockPrisma.camera.findMany.mockResolvedValue([mockCameraPlaceholder]);

    const pathStates = new Map();
    mockMediaGateway.listPathStates.mockResolvedValue({ success: true, paths: pathStates });

    await service.pollActiveCameras();

    // Must NOT call registerPath or flood MediaMTX
    expect(mockMediaGateway.registerPath).not.toHaveBeenCalled();

    // Verify runtime state preserves configured status without reconnection loops
    const runtime = service.getRuntimeState('mock-gnd-01');
    expect(runtime).toBeDefined();
    expect(runtime?.status).toBe(OperationalStatus.OFFLINE);
    expect(runtime?.reconnectAttempts).toBe(0);
  });
});
