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
      headers: { 
        'User-Agent': 'Mozilla/5.0 (compatible; TeyvatArchive-Monitor/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
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
      { expirationTtl: 7 * 24 * 60 * 60 }
    );

    // Should also store last_history tracking
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'last_history_test-site',
      JSON.stringify(expectedData)
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

    // Should also store history on first check
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'history_test-site_1234567890',
      JSON.stringify(expectedData),
      { expirationTtl: 7 * 24 * 60 * 60 }
    );

    // Should also store last_history tracking
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'last_history_test-site',
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
      { expirationTtl: 7 * 24 * 60 * 60 }
    );

    // Should also store last_history tracking
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'last_history_test-site',
      JSON.stringify(expectedData)
    );
  });

  it('should not store history if status unchanged and within 2 hours', async () => {
    // Arrange
    const mockResponse = {
      ok: true,
      status: 200,
    };
    mockFetch.mockResolvedValue(mockResponse);

    // Mock existing last_history data (same status, within 2 hours)
    const existingData = {
      status: 'up',
      responseTime: 100,
      statusCode: 200,
      timestamp: 1234567890 - (1 * 60 * 60 * 1000), // 1 hour ago
    };
    (mockEnv.UPTIME_KV.get as jest.Mock).mockResolvedValue(JSON.stringify(existingData));

    // Act
    await checkSite(mockSite, mockEnv);

    // Assert
    const expectedData: UptimeData = {
      status: 'up',
      responseTime: 0,
      statusCode: 200,
      timestamp: 1234567890,
    };

    // Should update current status
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'current_test-site',
      JSON.stringify(expectedData)
    );

    // Should NOT store history (status unchanged, within 2 hours)
    expect(mockEnv.UPTIME_KV.put).not.toHaveBeenCalledWith(
      'history_test-site_1234567890',
      expect.any(String),
      expect.any(Object)
    );

    // Should NOT update last_history tracking
    expect(mockEnv.UPTIME_KV.put).not.toHaveBeenCalledWith(
      'last_history_test-site',
      expect.any(String)
    );
  });

  it('should store history when status changes', async () => {
    // Arrange
    const mockResponse = {
      ok: false,
      status: 500,
    };
    mockFetch.mockResolvedValue(mockResponse);

    // Mock existing last_history data (different status)
    const existingData = {
      status: 'up',
      responseTime: 100,
      statusCode: 200,
      timestamp: 1234567890 - (30 * 60 * 1000), // 30 minutes ago
    };
    (mockEnv.UPTIME_KV.get as jest.Mock).mockResolvedValue(JSON.stringify(existingData));

    // Act
    await checkSite(mockSite, mockEnv);

    // Assert
    const expectedData: UptimeData = {
      status: 'down',
      responseTime: 0,
      statusCode: 500,
      timestamp: 1234567890,
    };

    // Should update current status
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'current_test-site',
      JSON.stringify(expectedData)
    );

    // Should store history (status changed)
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'history_test-site_1234567890',
      JSON.stringify(expectedData),
      { expirationTtl: 7 * 24 * 60 * 60 }
    );

    // Should update last_history tracking
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'last_history_test-site',
      JSON.stringify(expectedData)
    );
  });

  it('should store history after 2 hours even if status unchanged', async () => {
    // Arrange
    const mockResponse = {
      ok: true,
      status: 200,
    };
    mockFetch.mockResolvedValue(mockResponse);

    // Mock existing last_history data (same status, over 2 hours ago)
    const existingData = {
      status: 'up',
      responseTime: 100,
      statusCode: 200,
      timestamp: 1234567890 - (3 * 60 * 60 * 1000), // 3 hours ago
    };
    (mockEnv.UPTIME_KV.get as jest.Mock).mockResolvedValue(JSON.stringify(existingData));

    // Act
    await checkSite(mockSite, mockEnv);

    // Assert
    const expectedData: UptimeData = {
      status: 'up',
      responseTime: 0,
      statusCode: 200,
      timestamp: 1234567890,
    };

    // Should update current status
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'current_test-site',
      JSON.stringify(expectedData)
    );

    // Should store history (over 2 hours passed)
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'history_test-site_1234567890',
      JSON.stringify(expectedData),
      { expirationTtl: 7 * 24 * 60 * 60 }
    );

    // Should update last_history tracking
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'last_history_test-site',
      JSON.stringify(expectedData)
    );
  });

  it('should handle invalid JSON in last_history gracefully', async () => {
    // Arrange
    const networkError = new Error('Network error');
    mockFetch.mockRejectedValue(networkError);

    // Mock invalid JSON in last_history
    (mockEnv.UPTIME_KV.get as jest.Mock).mockResolvedValue('invalid json');

    // Act
    await checkSite(mockSite, mockEnv);

    // Assert
    const expectedData: UptimeData = {
      status: 'down',
      error: 'Network error',
      responseTime: 0,
      timestamp: 1234567890,
    };

    // Should still update current status
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'current_test-site',
      JSON.stringify(expectedData)
    );

    // Should store history (treats invalid JSON as first time)
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'history_test-site_1234567890',
      JSON.stringify(expectedData),
      { expirationTtl: 7 * 24 * 60 * 60 }
    );

    // Should update last_history tracking
    expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
      'last_history_test-site',
      JSON.stringify(expectedData)
    );
  });
});
