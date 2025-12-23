import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { WebsiteContactInfo } from "../models/app_store_developer_data";

/**
 * Configuration for WebsiteContactClient.
 *
 * WebsiteContactClientの設定。
 */
export interface WebsiteContactClientConfig {
    /** Page load timeout in ms (default: 10000) / ページ読み込みタイムアウト（ミリ秒） */
    pageTimeout?: number;
    /** Maximum contact pages to visit (default: 2) / 最大訪問コンタクトページ数 */
    maxContactPages?: number;
}

/**
 * Client for extracting contact information from websites using Puppeteer.
 *
 * Puppeteerを使用してWebサイトからコンタクト情報を抽出するクライアント。
 */
export class WebsiteContactClient {
    private config: Required<WebsiteContactClientConfig>;
    private browser: Browser | null = null;

    /** Email regex pattern / メールアドレスの正規表現パターン */
    private readonly emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

    /** Contact page URL patterns / コンタクトページのURLパターン */
    private readonly contactPatterns = [
        /contact/i,
        /support/i,
        /about/i,
        /inquiry/i,
        /enquiry/i,
        /お問い合わせ/,
        /お問合せ/,
        /連絡先/,
        /お問合/,
        /問い合わせ/
    ];

    /** Email addresses to exclude (common false positives) / 除外するメールアドレス */
    private readonly excludeEmails = [
        /example\.com$/i,
        /test\.com$/i,
        /localhost$/i,
        /your-?domain/i,
        /domain\.com$/i,
        /email\.com$/i,
        /@2x\./i,
        /@3x\./i,
        /\.png$/i,
        /\.jpg$/i,
        /\.svg$/i
    ];

    constructor(config: WebsiteContactClientConfig = {}) {
        this.config = {
            pageTimeout: config.pageTimeout ?? 10000,
            maxContactPages: config.maxContactPages ?? 2
        };
    }

    /**
     * Get or create browser instance.
     *
     * ブラウザインスタンスを取得または作成。
     */
    private async getBrowser(): Promise<Browser> {
        if (this.browser) {
            return this.browser;
        }

        // Configure chromium for Cloud Functions environment
        chromium.setGraphicsMode = false;

        this.browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: true
        });

        return this.browser;
    }

    /**
     * Extract contact information from a website.
     *
     * Webサイトからコンタクト情報を抽出。
     *
     * @param websiteUrl Website URL / WebサイトURL
     * @returns Contact information / コンタクト情報
     */
    async extractContactInfo(websiteUrl: string): Promise<WebsiteContactInfo> {
        const result: WebsiteContactInfo = {
            emails: [],
            contactPageUrls: []
        };

        let page: Page | null = null;

        try {
            const browser = await this.getBrowser();
            page = await browser.newPage();

            // Set timeout and user agent
            await page.setDefaultNavigationTimeout(this.config.pageTimeout);
            await page.setUserAgent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            );

            // Navigate to the main page
            console.log(`Navigating to: ${websiteUrl}`);
            await page.goto(websiteUrl, { waitUntil: "networkidle2" });

            // Extract emails from main page
            const mainPageEmails = await this.extractEmailsFromPage(page);
            result.emails.push(...mainPageEmails);

            // Find contact page URLs
            const contactPageUrls = await this.findContactPageUrls(page, websiteUrl);
            result.contactPageUrls = contactPageUrls;

            // Visit contact pages to find more emails
            const pagesToVisit = contactPageUrls.slice(0, this.config.maxContactPages);
            for (const contactUrl of pagesToVisit) {
                try {
                    console.log(`Visiting contact page: ${contactUrl}`);
                    await page.goto(contactUrl, { waitUntil: "networkidle2" });
                    const contactPageEmails = await this.extractEmailsFromPage(page);
                    result.emails.push(...contactPageEmails);
                } catch (err) {
                    console.warn(`Failed to visit contact page: ${contactUrl}`, err);
                }
            }

            // Remove duplicates and filter invalid emails
            result.emails = this.filterEmails([...new Set(result.emails)]);

        } catch (error) {
            console.warn(`Failed to extract contact info from: ${websiteUrl}`, error);
        } finally {
            if (page) {
                await page.close();
            }
        }

        return result;
    }

    /**
     * Extract email addresses from a page (after JS rendering).
     *
     * ページからメールアドレスを抽出（JSレンダリング後）。
     *
     * @param page Puppeteer page / Puppeteerページ
     * @returns List of email addresses / メールアドレス一覧
     */
    private async extractEmailsFromPage(page: Page): Promise<string[]> {
        const emails: string[] = [];

        try {
            // Method 1: Extract from mailto: links
            const mailtoEmails = await page.evaluate(() => {
                const links = document.querySelectorAll('a[href^="mailto:"]');
                return Array.from(links).map(link => {
                    const href = link.getAttribute("href") || "";
                    const email = href.replace(/^mailto:/i, "").split("?")[0];
                    return email.trim();
                }).filter(e => e.length > 0);
            });
            emails.push(...mailtoEmails);

            // Method 2: Extract from page content using regex
            const pageContent = await page.evaluate(() => {
                return document.body.innerText || "";
            });
            const contentEmails = pageContent.match(this.emailRegex) || [];
            emails.push(...contentEmails);

            // Method 3: Check common email display elements
            const elementEmails = await page.evaluate(() => {
                const selectors = [
                    '[class*="email"]',
                    '[class*="contact"]',
                    '[id*="email"]',
                    '[id*="contact"]',
                    'address',
                    '.footer',
                    '#footer'
                ];
                const found: string[] = [];
                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const text = el.textContent || "";
                        found.push(text);
                    });
                }
                return found;
            });

            for (const text of elementEmails) {
                const matches = text.match(this.emailRegex) || [];
                emails.push(...matches);
            }

        } catch (error) {
            console.warn("Failed to extract emails from page", error);
        }

        return emails;
    }

    /**
     * Find contact page URLs on the current page.
     *
     * 現在のページからコンタクトページのURLを探索。
     *
     * @param page Puppeteer page / Puppeteerページ
     * @param baseUrl Base URL for resolving relative URLs / 相対URLを解決するためのベースURL
     * @returns List of contact page URLs / コンタクトページURL一覧
     */
    private async findContactPageUrls(page: Page, baseUrl: string): Promise<string[]> {
        try {
            const allLinks = await page.evaluate(() => {
                const links = document.querySelectorAll("a[href]");
                return Array.from(links).map(link => ({
                    href: link.getAttribute("href") || "",
                    text: link.textContent?.trim() || ""
                }));
            });

            const contactUrls: string[] = [];
            const baseUrlObj = new URL(baseUrl);

            for (const link of allLinks) {
                // Check if link text or href matches contact patterns
                const isContactLink = this.contactPatterns.some(pattern =>
                    pattern.test(link.href) || pattern.test(link.text)
                );

                if (isContactLink && link.href) {
                    try {
                        // Resolve relative URL
                        const fullUrl = new URL(link.href, baseUrl);

                        // Only include URLs from the same domain
                        if (fullUrl.hostname === baseUrlObj.hostname) {
                            contactUrls.push(fullUrl.href);
                        }
                    } catch {
                        // Invalid URL, skip
                    }
                }
            }

            // Remove duplicates
            return [...new Set(contactUrls)];

        } catch (error) {
            console.warn("Failed to find contact page URLs", error);
            return [];
        }
    }

    /**
     * Filter out invalid or unwanted email addresses.
     *
     * 無効または不要なメールアドレスを除外。
     *
     * @param emails List of emails / メールアドレス一覧
     * @returns Filtered emails / フィルタリングされたメールアドレス一覧
     */
    private filterEmails(emails: string[]): string[] {
        return emails.filter(email => {
            // Check if email matches any exclude pattern
            const isExcluded = this.excludeEmails.some(pattern => pattern.test(email));
            if (isExcluded) {
                return false;
            }

            // Basic email validation
            const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            return isValid;
        });
    }

    /**
     * Close the browser instance.
     *
     * ブラウザインスタンスを閉じる。
     */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
