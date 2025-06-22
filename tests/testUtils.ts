/**
 * Test utilities for mocking Cloudflare Worker environment
 */

// Mock KV Namespace factory
export const createMockKV = (): KVNamespace => ({
  put: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  list: jest.fn().mockResolvedValue({ keys: [] }),
  delete: jest.fn().mockResolvedValue(undefined),
  getWithMetadata: jest.fn().mockResolvedValue({ value: null, metadata: null }),
});

// Mock Environment factory
export const createMockEnv = (): import('../src/index').Env => ({
  UPTIME_KV: createMockKV(),
});

// Mock fetch response factory
export const createMockResponse = (options: {
  ok?: boolean;
  status?: number;
  json?: any;
  text?: string;
}) => {
  const response = {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: jest.fn().mockResolvedValue(options.json ?? {}),
    text: jest.fn().mockResolvedValue(options.text ?? ''),
    headers: new Map(),
  };
  
  // Add common headers
  response.headers.set('Content-Type', 'application/json');
  
  return response;
};

// Mock UptimeData factory
export const createMockUptimeData = (overrides: Partial<import('../src/index').UptimeData> = {}): import('../src/index').UptimeData => ({
  status: 'up',
  responseTime: 100,
  statusCode: 200,
  timestamp: Date.now(),
  ...overrides,
});

// Date mocking utilities
export const mockDateNow = (timestamp: number = 1234567890) => {
  const originalDateNow = Date.now;
  Date.now = jest.fn().mockReturnValue(timestamp);
  return () => {
    Date.now = originalDateNow;
  };
};

// Fetch mocking utilities
export const mockFetch = (responses: Response | Response[]) => {
  const mockFn = jest.fn();
  
  if (Array.isArray(responses)) {
    responses.forEach((response, index) => {
      mockFn.mockResolvedValueOnce(response);
    });
  } else {
    mockFn.mockResolvedValue(responses);
  }
  
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFn;
  
  return {
    mockFn,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
};
