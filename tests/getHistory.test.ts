import { getHistory, type Env, type UptimeData } from '../src/index';

// Mock KV namespace
const createMockKV = (): KVNamespace => ({
  put: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  list: jest.fn(),
  delete: jest.fn().mockResolvedValue(undefined),
  getWithMetadata: jest.fn().mockResolvedValue({ value: null, metadata: null }),
});

describe('getHistory', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      UPTIME_KV: createMockKV(),
    };
    jest.clearAllMocks();
  });

  it('should return history for a specific site', async () => {
    // Arrange
    const mockData1: UptimeData = {
      status: 'up',
      responseTime: 100,
      statusCode: 200,
      timestamp: 1234567890,
    };

    const mockData2: UptimeData = {
      status: 'down',
      responseTime: 0,
      error: 'Connection failed',
      timestamp: 1234567800,
    };

    (mockEnv.UPTIME_KV.list as jest.Mock).mockResolvedValue({
      keys: [
        { name: 'history_main_1234567890' },
        { name: 'history_main_1234567800' },
      ]
    });

    (mockEnv.UPTIME_KV.get as jest.Mock)
      .mockResolvedValueOnce(JSON.stringify(mockData1))
      .mockResolvedValueOnce(JSON.stringify(mockData2));

    // Act
    const response = await getHistory(mockEnv, 'main');
    const result = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');

    expect(mockEnv.UPTIME_KV.list).toHaveBeenCalledWith({ prefix: 'history_main_' });

    // Should be sorted by timestamp (descending) and limited to 100
    expect(result).toEqual([mockData1, mockData2]);
  });

  it('should return 400 when site parameter is missing', async () => {
    // Act
    const response = await getHistory(mockEnv, null);
    const result = await response.text();

    // Assert
    expect(response.status).toBe(400);
    expect(result).toBe('Site parameter required');
  });

  it('should handle empty history', async () => {
    // Arrange
    (mockEnv.UPTIME_KV.list as jest.Mock).mockResolvedValue({ keys: [] });

    // Act
    const response = await getHistory(mockEnv, 'main');
    const result = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(result).toEqual([]);
  });

  it('should handle invalid JSON data gracefully', async () => {
    // Arrange
    (mockEnv.UPTIME_KV.list as jest.Mock).mockResolvedValue({
      keys: [
        { name: 'history_main_1234567890' },
        { name: 'history_main_1234567800' },
      ]
    });

    (mockEnv.UPTIME_KV.get as jest.Mock)
      .mockResolvedValueOnce('invalid json')
      .mockResolvedValueOnce(JSON.stringify({ status: 'up', timestamp: 123 }));

    // Act
    const response = await getHistory(mockEnv, 'main');
    const result = await response.json();

    // Assert
    expect(response.status).toBe(200);
    // Should only include valid JSON entries
    expect(result).toEqual([{ status: 'up', timestamp: 123 }]);
  });

  it('should limit results to 100 entries', async () => {
    // Arrange
    const keys = Array.from({ length: 150 }, (_, i) => ({
      name: `history_main_${1234567890 + i}`
    }));

    (mockEnv.UPTIME_KV.list as jest.Mock).mockResolvedValue({ keys });

    const mockData = {
      status: 'up' as const,
      responseTime: 100,
      statusCode: 200,
      timestamp: 1234567890,
    };

    (mockEnv.UPTIME_KV.get as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

    // Act
    const response = await getHistory(mockEnv, 'main');
    const result = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBeLessThanOrEqual(100);
  });
});
