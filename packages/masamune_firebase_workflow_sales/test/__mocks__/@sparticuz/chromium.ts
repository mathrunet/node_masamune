/**
 * Mock for @sparticuz/chromium in Jest tests
 */

const chromium = {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1920, height: 1080 },
    executablePath: jest.fn().mockResolvedValue("/usr/bin/chromium"),
    setGraphicsMode: false
};

export default chromium;
