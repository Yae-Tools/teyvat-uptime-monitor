import { checkSite, type SiteCheck, type Env, type UptimeData } from '../src/index';

// Mock KV namespace
const createMockKV = (): KVNamespace => ({
  put: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  list: jest.fn().mockResolvedValue({ keys: [] }),
  delete: jest.fn().mockResolvedValue(undefined),
  getWithMetadata: jest.fn().mockResolvedValue({ value: null, metadata: null }),
});

// Mock fetch
const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

describe('checkSite', () => {
  let mockEnv: Env;
  let mockSite: SiteCheck;
  let originalDateNow: () => number;

  beforeEach(() => {
    mockEnv = {
      UPTIME_KV: createMockKV(),
    };
    
    mockSite = {
      name: 'test-site',
      url: 'https://example.com',
      timeout: 5000,
    };

    jest.clearAllMocks();
    
    // Mock Date.now to return consistent timestamps
    originalDateNow = Date.now;
    Date.now = jest.fn().mockReturnValue(1234567890);
  });

  afterEach(() => {
    // Restore Date.now
    Date.now = originalDateNow;
  });

  it('should record successful site check', async () => {
    // Arrange
    const mockResponse = {
      ok: true,
      status: 200,
    };
    mockFetch.mockResolvedValue(mockResponse);

    // Act
    await checkSite(mockSite, mockEnv);

    // Assert
    expect(mockFetch).toHaveBeenCalledWith(mockSite.url, {
      signal: expect.any(AbortSignal),
      headers: { 'User-Agent': 'TeyvatArchive-Uptime-Monitor/1.0' }
    });

    const expectedData: UptimeData = {
      status: 'up',
      responseTime: 0, // Date.now() mocked to return same value
      statusCode: 200,
      timestamp: 1234567890,
    };

    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'current_test-site',
      JSON.stringify(expectedData)
    );

    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'history_test-site_1234567890',
      JSON.stringify(expectedData),
      { expirationTtl: 30 * 24 * 60 * 60 }
    );
  });

  it('should record failed site check with error status code', async () => {
    // Arrange
    const mockResponse = {
      ok: false,
      status: 500,
    };
    mockFetch.mockResolvedValue(mockResponse);

    // Act
    await checkSite(mockSite, mockEnv);

    // Assert
    const expectedData: UptimeData = {
      status: 'down',
      responseTime: 0,
      statusCode: 500,
      timestamp: 1234567890,
    };

    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'current_test-site',
      JSON.stringify(expectedData)
    );
  });

  it('should handle network errors', async () => {
    // Arrange
    const networkError = new Error('Network error');
    mockFetch.mockRejectedValue(networkError);

    // Act
    await checkSite(mockSite, mockEnv);

    // Assert
    const expectedData: UptimeData = {
      status: 'down',
      error: 'Network error',
      responseTime: 0,
      timestamp: 1234567890,
    };

    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'current_test-site',
      JSON.stringify(expectedData)
    );

    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'history_test-site_1234567890',
      JSON.stringify(expectedData),
      { expirationTtl: 30 * 24 * 60 * 60 }
    );
  });
});
