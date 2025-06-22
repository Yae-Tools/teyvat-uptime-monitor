# Test Documentation

## Overview

This project uses Jest with TypeScript to test the Cloudflare Worker uptime monitor. The test suite covers all major functionality including site checking, status retrieval, history management, and the worker request routing.

## Test Structure

```
tests/
├── checkSite.test.ts      # Tests for the site checking function
├── getStatus.test.ts      # Tests for status endpoint
├── getHistory.test.ts     # Tests for history endpoint
├── worker.test.ts         # Integration tests for the worker handlers
└── setup.ts              # Test setup configuration
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Coverage

Current coverage: **98.07% statements, 100% branches, 87.5% functions**

## Test Features

### Mocking
- **KV Namespace**: All KV operations are mocked for isolated testing
- **Fetch API**: External HTTP requests are mocked to test network scenarios
- **Date.now()**: Mocked for consistent timestamp testing

### Test Scenarios Covered

#### checkSite Function
- ✅ Successful site checks (HTTP 200)
- ✅ Failed site checks (HTTP 5xx errors)
- ✅ Network errors and timeouts
- ✅ Proper KV storage of current and historical data
- ✅ Abort controller setup and cleanup

#### getStatus Function
- ✅ Retrieving status for all monitored sites
- ✅ Handling missing data gracefully
- ✅ JSON parsing error handling
- ✅ Proper CORS headers

#### getHistory Function
- ✅ Retrieving historical data for specific sites
- ✅ Proper sorting (newest first)
- ✅ Result limiting (max 100 entries)
- ✅ Missing site parameter validation
- ✅ Invalid JSON data handling

#### Worker Integration
- ✅ Request routing for all endpoints
- ✅ Scheduled event handling
- ✅ Mixed success/failure scenarios
- ✅ Site configuration validation

## Mock Utilities

The tests include comprehensive mocking utilities:

```typescript
// Mock KV Namespace
const createMockKV = (): KVNamespace => ({
  put: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  list: jest.fn().mockResolvedValue({ keys: [] }),
  delete: jest.fn().mockResolvedValue(undefined),
  getWithMetadata: jest.fn().mockResolvedValue({ value: null, metadata: null }),
});

// Mock fetch for external requests
const mockFetch = jest.fn();
globalThis.fetch = mockFetch;
```

## Error Handling Tests

The test suite validates robust error handling:
- Network timeouts and connection failures
- Invalid JSON data in KV storage
- Missing or malformed request parameters
- KV storage operation failures

## Best Practices

1. **Isolation**: Each test is isolated with proper setup/teardown
2. **Mocking**: External dependencies are mocked for reliability
3. **Coverage**: High test coverage ensures code reliability
4. **Error Scenarios**: Tests cover both success and failure paths
5. **Type Safety**: Full TypeScript support for better developer experience
