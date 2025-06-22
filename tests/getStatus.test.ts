import { getStatus, type Env, type UptimeData } from '../src/index';

// Mock KV namespace
const createMockKV = (): KVNamespace => ({
  put: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  list: jest.fn().mockResolvedValue({ keys: [] }),
  delete: jest.fn().mockResolvedValue(undefined),
  getWithMetadata: jest.fn().mockResolvedValue({ value: null, metadata: null }),
});

describe('getStatus', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      UPTIME_KV: createMockKV(),
    };
    jest.clearAllMocks();
  });

  it('should return status for all sites', async () => {
    // Arrange
    const mockData: UptimeData = {
      status: 'up',
      responseTime: 100,
      statusCode: 200,
      timestamp: 1234567890,
    };

    (mockEnv.UPTIME_KV.get as jest.Mock)
      .mockResolvedValueOnce(JSON.stringify(mockData)) // main
      .mockResolvedValueOnce(JSON.stringify(mockData)) // dashboard
      .mockResolvedValueOnce(JSON.stringify(mockData)) // api
      .mockResolvedValueOnce(JSON.stringify(mockData)); // cdn

    // Act
    const response = await getStatus(mockEnv);
    const result: Record<string, UptimeData | null> = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');

    expect(mockEnv.UPTIME_KV.get).toHaveBeenCalledWith('current_main');
    expect(mockEnv.UPTIME_KV.get).toHaveBeenCalledWith('current_dashboard');
    expect(mockEnv.UPTIME_KV.get).toHaveBeenCalledWith('current_api');
    expect(mockEnv.UPTIME_KV.get).toHaveBeenCalledWith('current_cdn');

    expect(result).toEqual({
      main: mockData,
      dashboard: mockData,
      api: mockData,
      cdn: mockData,
    });
  });

  it('should handle missing data', async () => {
    // Arrange
    (mockEnv.UPTIME_KV.get as jest.Mock)
      .mockResolvedValueOnce(null) // main - no data
      .mockResolvedValueOnce('invalid json') // dashboard - invalid JSON
      .mockResolvedValueOnce(JSON.stringify({ status: 'up' })) // api - valid
      .mockResolvedValueOnce(null); // cdn - no data

    // Act
    const response = await getStatus(mockEnv);
    const result: Record<string, UptimeData | null> = await response.json();

    // Assert
    expect(result.main).toBeNull();
    expect(result.dashboard).toBeNull(); // Should be null due to JSON parse error
    expect(result.api).toEqual({ status: 'up' });
    expect(result.cdn).toBeNull();
  });

  it('should handle KV errors gracefully', async () => {
    // Arrange
    (mockEnv.UPTIME_KV.get as jest.Mock).mockRejectedValue(new Error('KV error'));

    // Act & Assert
    await expect(getStatus(mockEnv)).rejects.toThrow('KV error');
  });
});
