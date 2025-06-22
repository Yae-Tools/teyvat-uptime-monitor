import worker, { MONITORED_SITES, type Env } from '../src/index';

// Mock KV namespace
const createMockKV = (): KVNamespace => ({
  put: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  list: jest.fn().mockResolvedValue({ keys: [] }),
  delete: jest.fn().mockResolvedValue(undefined),
  getWithMetadata: jest.fn().mockResolvedValue({ value: null, metadata: null }),
});

// Mock fetch for external requests
const mockFetch = jest.fn();
// Store original fetch
const originalFetch = globalThis.fetch;

describe('Worker Integration Tests', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      UPTIME_KV: createMockKV(),
    };
    
    jest.clearAllMocks();
    
    // Mock fetch for external HTTP requests
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });

  describe('fetch handler', () => {
    it('should return API description for root path', async () => {
      // Arrange
      const request = new Request('https://example.com/');

      // Act
      const response = await worker.fetch(request, mockEnv);
      const result = await response.text();

      // Assert
      expect(response.status).toBe(200);
      expect(result).toBe('Teyvat Archive Uptime Monitor API');
    });

    it('should route to getStatus for /api/status', async () => {
      // Arrange
      const request = new Request('https://example.com/api/status');
      (mockEnv.UPTIME_KV.get as jest.Mock).mockResolvedValue(null);

      // Act
      const response = await worker.fetch(request, mockEnv);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(mockEnv.UPTIME_KV.get).toHaveBeenCalledWith('current_main');
    });

    it('should route to getHistory for /api/history with site parameter', async () => {
      // Arrange
      const request = new Request('https://example.com/api/history?site=main');
      (mockEnv.UPTIME_KV.list as jest.Mock).mockResolvedValue({ keys: [] });

      // Act
      const response = await worker.fetch(request, mockEnv);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(mockEnv.UPTIME_KV.list).toHaveBeenCalledWith({ prefix: 'history_main_' });
    });

    it('should return 400 for /api/history without site parameter', async () => {
      // Arrange
      const request = new Request('https://example.com/api/history');

      // Act
      const response = await worker.fetch(request, mockEnv);
      const result = await response.text();

      // Assert
      expect(response.status).toBe(400);
      expect(result).toBe('Site parameter required');
    });
  });

  describe('scheduled handler', () => {
    it('should check all monitored sites', async () => {
      // Arrange
      const mockEvent = {} as ScheduledEvent;
      const mockContext = {} as ExecutionContext;
      
      // Mock successful responses for all sites
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      // Mock Date.now for consistent timestamps
      const originalDateNow = Date.now;
      Date.now = jest.fn().mockReturnValue(1234567890);

      // Act
      await worker.scheduled(mockEvent, mockEnv, mockContext);

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(MONITORED_SITES.length);
      
      // Check that each site was called with correct parameters
      MONITORED_SITES.forEach((site, index) => {
        expect(mockFetch).toHaveBeenNthCalledWith(index + 1, site.url, {
          signal: expect.any(AbortSignal),
          headers: { 
            'User-Agent': 'Mozilla/5.0 (compatible; TeyvatArchive-Monitor/1.0)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
      });

      // Check that KV storage was called for each site
      // Each site makes 3 put calls: current, history, last_history (since it's first time)
      expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledTimes(MONITORED_SITES.length * 3);

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should handle mixed success/failure scenarios', async () => {
      // Arrange
      const mockEvent = {} as ScheduledEvent;
      const mockContext = {} as ExecutionContext;
      
      // Mock mixed responses - some succeed, some fail
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200 })  // main - success
        .mockResolvedValueOnce({ ok: false, status: 500 }) // dashboard - server error
        .mockRejectedValueOnce(new Error('Network error')) // api - network error
        .mockResolvedValueOnce({ ok: true, status: 200 });  // cdn - success

      const originalDateNow = Date.now;
      Date.now = jest.fn().mockReturnValue(1234567890);

      // Act
      await worker.scheduled(mockEvent, mockEnv, mockContext);

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(4);
      // Each site makes 3 put calls: current, history, last_history (since it's first time)
      expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledTimes(12); // 4 sites * 3 calls each

      // Verify that both current and history data was stored for each site
      expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
        'current_main',
        expect.stringContaining('"status":"up"')
      );
      expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
        'current_dashboard',
        expect.stringContaining('"status":"down"')
      );
      expect(mockEnv.UPTIME_KV.put).toHaveBeenCalledWith(
        'current_api',
        expect.stringContaining('"error":"Network error"')
      );

      Date.now = originalDateNow;
    });
  });

  describe('MONITORED_SITES configuration', () => {
    it('should have correct site configurations', () => {
      expect(MONITORED_SITES).toHaveLength(4);
      
      const siteNames = MONITORED_SITES.map(site => site.name);
      expect(siteNames).toEqual(['main', 'dashboard', 'api', 'cdn']);
      
      MONITORED_SITES.forEach(site => {
        expect(site.url).toMatch(/^https:\/\//);
        expect(site.timeout).toBe(10000);
        expect(typeof site.name).toBe('string');
      });
    });
  });
});
