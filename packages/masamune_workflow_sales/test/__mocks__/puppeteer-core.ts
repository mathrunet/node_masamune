/**
 * Mock for puppeteer-core in Jest tests
 */

const mockPage = {
    setDefaultNavigationTimeout: jest.fn(),
    setUserAgent: jest.fn(),
    goto: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined)
};

const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn().mockResolvedValue(undefined)
};

const puppeteer = {
    launch: jest.fn().mockResolvedValue(mockBrowser)
};

export default puppeteer;
export { mockBrowser, mockPage };
