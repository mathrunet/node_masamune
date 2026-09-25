import { deploy, NoneAuthAdapter } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";
import { SendMailError, sendMail } from "../src/lib/send_mail";
import { SendEmailBinding, SendMailMessage } from "../src/lib/interface";

const API_TOKEN = "secret-api-token-xyz";
const ACCOUNT_ID = "account-123";
const API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/email/sending/send`;

type FetchCall = [string, { method: string; headers: Record<string, string>; body: string }];

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function successBody(result: Record<string, unknown> = {}) {
    return {
        success: true,
        errors: [],
        messages: [],
        result: {
            delivered: ["recipient@example.com"],
            permanent_bounces: [],
            queued: [],
            ...result,
        },
    };
}

function mockFetch(response: Response | (() => Promise<Response>)) {
    return jest.fn(async (_url: string, _init: unknown) => typeof response === "function" ? response() : response);
}

function mockBinding(impl?: (message: unknown) => Promise<{ messageId: string }>) {
    const send = jest.fn(impl ?? (async () => ({ messageId: "<binding-id@example.com>" })));
    return { binding: { send } as unknown as SendEmailBinding, send };
}

const baseMessage: SendMailMessage = {
    to: "recipient@example.com",
    from: "sender@example.com",
    subject: "Hello",
    text: "Hello text",
};

async function expectSendMailError(promise: Promise<unknown>): Promise<SendMailError> {
    try {
        await promise;
    } catch (err) {
        expect(err).toBeInstanceOf(SendMailError);
        return err as SendMailError;
    }
    throw new Error("Expected SendMailError to be thrown.");
}

describe("sendMail (api transport)", () => {
    test("sends a POST request with the documented URL, headers and body", async () => {
        const fetchMock = mockFetch(jsonResponse(200, successBody({
            message_id: "<abc@example.com>",
            queued: ["queued@example.com"],
            permanent_bounces: ["bounce@example.com"],
        })));
        const result = await sendMail({
            transport: { type: "api", accountId: ACCOUNT_ID, apiToken: API_TOKEN, fetch: fetchMock as unknown as typeof fetch },
            message: {
                to: ["a@example.com", { email: "b@example.com", name: "Bee" }, { email: "c@example.com" }],
                cc: "cc@example.com",
                bcc: [{ email: "bcc@example.com", name: "Hidden" }],
                from: { email: "sender@example.com", name: "Sender Team" },
                replyTo: "reply@example.com",
                subject: "Subject",
                text: "Plain",
                html: "<p>Html</p>",
                headers: { "X-Campaign-ID": "c1" },
            },
        });
        const calls = fetchMock.mock.calls as unknown as FetchCall[];
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe(API_URL);
        expect(calls[0][1].method).toBe("POST");
        expect(calls[0][1].headers["Authorization"]).toBe(`Bearer ${API_TOKEN}`);
        expect(calls[0][1].headers["Content-Type"]).toBe("application/json");
        expect(JSON.parse(calls[0][1].body)).toEqual({
            to: ["a@example.com", { address: "b@example.com", name: "Bee" }, "c@example.com"],
            cc: "cc@example.com",
            bcc: [{ address: "bcc@example.com", name: "Hidden" }],
            from: { address: "sender@example.com", name: "Sender Team" },
            reply_to: "reply@example.com",
            subject: "Subject",
            text: "Plain",
            html: "<p>Html</p>",
            headers: { "X-Campaign-ID": "c1" },
        });
        expect(result).toEqual({
            messageId: "<abc@example.com>",
            delivered: ["recipient@example.com"],
            queued: ["queued@example.com"],
            permanentBounces: ["bounce@example.com"],
        });
    });

    test("omits optional fields that are not specified", async () => {
        const fetchMock = mockFetch(jsonResponse(200, successBody()));
        await sendMail({
            transport: { type: "api", accountId: ACCOUNT_ID, apiToken: API_TOKEN, fetch: fetchMock as unknown as typeof fetch },
            message: { to: "recipient@example.com", from: "sender@example.com", subject: "S", html: "<b>h</b>" },
        });
        const calls = fetchMock.mock.calls as unknown as FetchCall[];
        expect(JSON.parse(calls[0][1].body)).toEqual({
            to: "recipient@example.com",
            from: "sender@example.com",
            subject: "S",
            html: "<b>h</b>",
        });
    });

    test("parses a success response without message_id and with suppressed_recipients", async () => {
        const fetchMock = mockFetch(jsonResponse(200, successBody({ suppressed_recipients: ["s@example.com"] })));
        const result = await sendMail({
            transport: { type: "api", accountId: ACCOUNT_ID, apiToken: API_TOKEN, fetch: fetchMock as unknown as typeof fetch },
            message: baseMessage,
        });
        expect(result).toEqual({
            messageId: undefined,
            delivered: ["recipient@example.com"],
            queued: [],
            permanentBounces: [],
            suppressedRecipients: ["s@example.com"],
        });
    });

    test("uses the global fetch when no custom fetch is given", async () => {
        const original = globalThis.fetch;
        const fetchMock = mockFetch(jsonResponse(200, successBody()));
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        try {
            await sendMail({
                transport: { type: "api", accountId: ACCOUNT_ID, apiToken: API_TOKEN },
                message: baseMessage,
            });
        } finally {
            (globalThis as { fetch: typeof fetch }).fetch = original;
        }
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("encodes the account ID in the URL", async () => {
        const fetchMock = mockFetch(jsonResponse(200, successBody()));
        await sendMail({
            transport: { type: "api", accountId: "a/b", apiToken: API_TOKEN, fetch: fetchMock as unknown as typeof fetch },
            message: baseMessage,
        });
        const calls = fetchMock.mock.calls as unknown as FetchCall[];
        expect(calls[0][0]).toBe("https://api.cloudflare.com/client/v4/accounts/a%2Fb/email/sending/send");
    });

    test.each([
        [400, 10001, "email.sending.error.invalid_request_schema", false],
        [401, 10101, "email.sending.error.authentication.unauthorized", false],
        [403, 10102, "email.sending.error.authentication.forbidden", false],
        [404, 10000, "email.sending.error.not_found", false],
        [429, 10004, "email.sending.error.throttled", true],
        [500, 10002, "email.sending.error.internal_server", true],
        [503, 10100, "email.sending.error.authentication.upstream", true],
    ])("maps HTTP %i (code %i) to SendMailError", async (status, code, message, retryable) => {
        const fetchMock = mockFetch(jsonResponse(status, {
            success: false,
            errors: [{ code, message }],
            messages: [],
            result: null,
        }));
        const err = await expectSendMailError(sendMail({
            transport: { type: "api", accountId: ACCOUNT_ID, apiToken: API_TOKEN, fetch: fetchMock as unknown as typeof fetch },
            message: baseMessage,
        }));
        expect(err.status).toBe(status);
        expect(err.code).toBe(String(code));
        expect(err.retryable).toBe(retryable);
        expect(err.message).toContain(String(status));
        expect(err.message).toContain(message);
        expect(err.message).not.toContain(API_TOKEN);
    });

    test("maps a non-JSON error body", async () => {
        const fetchMock = mockFetch(new Response("Bad Gateway", { status: 502 }));
        const err = await expectSendMailError(sendMail({
            transport: { type: "api", accountId: ACCOUNT_ID, apiToken: API_TOKEN, fetch: fetchMock as unknown as typeof fetch },
            message: baseMessage,
        }));
        expect(err.status).toBe(502);
        expect(err.code).toBeUndefined();
        expect(err.retryable).toBe(true);
    });

    test("maps a 200 response with success:false", async () => {
        const fetchMock = mockFetch(jsonResponse(200, {
            success: false,
            errors: [{ code: 10202, message: "email.sending.error.email.invalid" }],
            messages: [],
            result: null,
        }));
        const err = await expectSendMailError(sendMail({
            transport: { type: "api", accountId: ACCOUNT_ID, apiToken: API_TOKEN, fetch: fetchMock as unknown as typeof fetch },
            message: baseMessage,
        }));
        expect(err.status).toBe(200);
        expect(err.code).toBe("10202");
        expect(err.retryable).toBe(false);
    });

    test("maps a network error to a retryable SendMailError without leaking the token", async () => {
        const fetchMock = jest.fn(async () => {
            throw new Error(`connect failed with Bearer ${API_TOKEN}`);
        });
        const err = await expectSendMailError(sendMail({
            transport: { type: "api", accountId: ACCOUNT_ID, apiToken: API_TOKEN, fetch: fetchMock as unknown as typeof fetch },
            message: baseMessage,
        }));
        expect(err.code).toBe("NETWORK_ERROR");
        expect(err.retryable).toBe(true);
        expect(err.message).not.toContain(API_TOKEN);
        expect(JSON.stringify(err)).not.toContain(API_TOKEN);
    });

    test("rejects missing accountId / apiToken", async () => {
        const fetchMock = mockFetch(jsonResponse(200, successBody()));
        const e1 = await expectSendMailError(sendMail({
            transport: { type: "api", accountId: "", apiToken: API_TOKEN, fetch: fetchMock as unknown as typeof fetch },
            message: baseMessage,
        }));
        expect(e1.code).toBe("INVALID_TRANSPORT");
        const e2 = await expectSendMailError(sendMail({
            transport: { type: "api", accountId: ACCOUNT_ID, apiToken: " ", fetch: fetchMock as unknown as typeof fetch },
            message: baseMessage,
        }));
        expect(e2.code).toBe("INVALID_TRANSPORT");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("sendMail (binding transport)", () => {
    test("passes the documented builder fields to env.EMAIL.send()", async () => {
        const { binding, send } = mockBinding();
        const result = await sendMail({
            transport: { type: "binding", binding },
            message: {
                to: ["a@example.com", { email: "b@example.com", name: "Bee" }, { email: "c@example.com" }],
                cc: [{ email: "cc@example.com", name: "Cc" }],
                bcc: "bcc@example.com",
                from: { email: "sender@example.com", name: "Sender Team" },
                replyTo: { email: "reply@example.com", name: "Support" },
                subject: "Subject",
                text: "Plain",
                html: "<p>Html</p>",
                headers: { "X-Campaign-ID": "c1" },
            },
        });
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toEqual({
            to: ["a@example.com", { email: "b@example.com", name: "Bee" }, "c@example.com"],
            cc: [{ email: "cc@example.com", name: "Cc" }],
            bcc: "bcc@example.com",
            from: { email: "sender@example.com", name: "Sender Team" },
            replyTo: { email: "reply@example.com", name: "Support" },
            subject: "Subject",
            text: "Plain",
            html: "<p>Html</p>",
            headers: { "X-Campaign-ID": "c1" },
        });
        expect(result).toEqual({
            messageId: "<binding-id@example.com>",
            delivered: [],
            queued: [],
            permanentBounces: [],
        });
    });

    test("omits optional fields that are not specified", async () => {
        const { binding, send } = mockBinding();
        await sendMail({ transport: { type: "binding", binding }, message: baseMessage });
        expect(send.mock.calls[0][0]).toEqual({
            to: "recipient@example.com",
            from: "sender@example.com",
            subject: "Hello",
            text: "Hello text",
        });
    });

    test.each([
        ["E_SENDER_NOT_VERIFIED", false],
        ["E_VALIDATION_ERROR", false],
        ["E_RATE_LIMIT_EXCEEDED", true],
        ["E_INTERNAL_SERVER_ERROR", true],
    ])("maps binding error %s", async (code, retryable) => {
        const { binding } = mockBinding(async () => {
            throw Object.assign(new Error("binding failure"), { code });
        });
        const err = await expectSendMailError(sendMail({ transport: { type: "binding", binding }, message: baseMessage }));
        expect(err.code).toBe(code);
        expect(err.retryable).toBe(retryable);
        expect(err.status).toBeUndefined();
        expect(err.message).toContain(code);
        expect(err.message).toContain("binding failure");
    });

    test("rejects an invalid binding", async () => {
        const err = await expectSendMailError(sendMail({
            transport: { type: "binding", binding: {} as SendEmailBinding },
            message: baseMessage,
        }));
        expect(err.code).toBe("INVALID_TRANSPORT");
    });
});

describe("sendMail validation", () => {
    const cases: Array<[string, Partial<SendMailMessage> & Record<string, unknown>]> = [
        ["empty to", { to: "" }],
        ["empty to array", { to: [] }],
        ["to without email", { to: { email: " " } }],
        ["invalid to", { to: "not-an-email" }],
        ["empty from", { from: "" }],
        ["missing from", { from: undefined }],
        ["empty subject", { subject: "  " }],
        ["subject with line break", { subject: "a\r\nBcc: x@example.com" }],
        ["no text and html", { text: undefined, html: undefined }],
        ["empty text and html", { text: "", html: "" }],
        ["invalid cc", { cc: ["ok@example.com", ""] }],
        ["invalid replyTo", { replyTo: "bad address@example.com" }],
        ["name with line break", { from: { email: "sender@example.com", name: "A\nB" } }],
        ["non-string header", { headers: { "X-A": 1 as unknown as string } }],
        ["too many recipients", {
            to: Array.from({ length: 30 }, (_, i) => `to${i}@example.com`),
            cc: Array.from({ length: 21 }, (_, i) => `cc${i}@example.com`),
        }],
    ];
    test.each(cases)("rejects %s", async (_label, override) => {
        const { binding, send } = mockBinding();
        const fetchMock = mockFetch(jsonResponse(200, successBody()));
        const message = { ...baseMessage, ...override } as SendMailMessage;
        const e1 = await expectSendMailError(sendMail({ transport: { type: "binding", binding }, message }));
        expect(e1.code).toBe("INVALID_MESSAGE");
        expect(e1.retryable).toBe(false);
        const e2 = await expectSendMailError(sendMail({
            transport: { type: "api", accountId: ACCOUNT_ID, apiToken: API_TOKEN, fetch: fetchMock as unknown as typeof fetch },
            message,
        }));
        expect(e2.code).toBe("INVALID_MESSAGE");
        expect(send).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("accepts exactly 50 recipients", async () => {
        const { binding } = mockBinding();
        await expect(sendMail({
            transport: { type: "binding", binding },
            message: { ...baseMessage, to: Array.from({ length: 50 }, (_, i) => `to${i}@example.com`) },
        })).resolves.toBeDefined();
    });
});

describe("Functions.sendMail", () => {
    const requestBody = {
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Subject",
        text: "Text",
        html: "<p>Html</p>",
    };

    function post(app: ReturnType<typeof deploy>, body: unknown, env?: Record<string, unknown>) {
        return app.request("http://localhost/send_mail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }, env);
    }

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("uses the EMAIL binding from env when present", async () => {
        const { binding, send } = mockBinding();
        const app = deploy([Functions.sendMail({ auth: new NoneAuthAdapter() })]);
        const response = await post(app, requestBody, { EMAIL: binding });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            messageId: "<binding-id@example.com>",
            delivered: [],
            queued: [],
            permanentBounces: [],
        });
        expect(send.mock.calls[0][0]).toEqual({
            to: "recipient@example.com",
            from: "sender@example.com",
            subject: "Subject",
            text: "Text",
            html: "<p>Html</p>",
        });
    });

    test("uses the binding name from MAIL_CLOUDFLARE_BINDING", async () => {
        const { binding, send } = mockBinding();
        const app = deploy([Functions.sendMail({ auth: new NoneAuthAdapter() })]);
        const response = await post(app, requestBody, { MAIL_CLOUDFLARE_BINDING: "MAILER", MAILER: binding });
        expect(response.status).toBe(200);
        expect(send).toHaveBeenCalledTimes(1);
    });

    test("falls back to the REST API with env credentials", async () => {
        const fetchMock = mockFetch(jsonResponse(200, successBody({ message_id: "<id@example.com>" })));
        jest.spyOn(globalThis, "fetch").mockImplementation(fetchMock as unknown as typeof fetch);
        const app = deploy([Functions.sendMail({ auth: new NoneAuthAdapter() })]);
        const response = await post(app, requestBody, {
            MAIL_CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
            MAIL_CLOUDFLARE_API_TOKEN: API_TOKEN,
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            messageId: "<id@example.com>",
            delivered: ["recipient@example.com"],
            queued: [],
            permanentBounces: [],
        });
        const calls = fetchMock.mock.calls as unknown as FetchCall[];
        expect(calls[0][0]).toBe(API_URL);
        expect(calls[0][1].headers["Authorization"]).toBe(`Bearer ${API_TOKEN}`);
    });

    test("prefers options over env and honors type: api", async () => {
        const { binding, send } = mockBinding();
        const fetchMock = mockFetch(jsonResponse(200, successBody()));
        jest.spyOn(globalThis, "fetch").mockImplementation(fetchMock as unknown as typeof fetch);
        const app = deploy([Functions.sendMail({
            auth: new NoneAuthAdapter(),
            type: "api",
            accountId: "option-account",
            apiToken: "option-token",
        })]);
        const response = await post(app, requestBody, {
            EMAIL: binding,
            MAIL_CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
            MAIL_CLOUDFLARE_API_TOKEN: API_TOKEN,
        });
        expect(response.status).toBe(200);
        expect(send).not.toHaveBeenCalled();
        const calls = fetchMock.mock.calls as unknown as FetchCall[];
        expect(calls[0][0]).toBe("https://api.cloudflare.com/client/v4/accounts/option-account/email/sending/send");
        expect(calls[0][1].headers["Authorization"]).toBe("Bearer option-token");
    });

    test("uses an explicit transport option", async () => {
        const { binding, send } = mockBinding();
        const app = deploy([Functions.sendMail({ auth: new NoneAuthAdapter(), transport: { type: "binding", binding } })]);
        const response = await post(app, requestBody);
        expect(response.status).toBe(200);
        expect(send).toHaveBeenCalledTimes(1);
    });

    test("returns 400 for missing parameters", async () => {
        const { binding } = mockBinding();
        const app = deploy([Functions.sendMail({ auth: new NoneAuthAdapter() })]);
        const response = await post(app, { from: "sender@example.com", to: "recipient@example.com" }, { EMAIL: binding });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Query parameter is invalid." });
    });

    test("returns 400 for an invalid message", async () => {
        const { binding } = mockBinding();
        const app = deploy([Functions.sendMail({ auth: new NoneAuthAdapter() })]);
        const response = await post(app, { ...requestBody, to: "invalid" }, { EMAIL: binding });
        expect(response.status).toBe(400);
    });

    test("returns 500 when nothing is configured", async () => {
        const app = deploy([Functions.sendMail({ auth: new NoneAuthAdapter() })]);
        const response = await post(app, requestBody);
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "MAIL_CLOUDFLARE_ACCOUNT_ID is not set." });
    });

    test("returns 500 when type: binding is required but missing", async () => {
        const app = deploy([Functions.sendMail({ auth: new NoneAuthAdapter(), type: "binding" })]);
        const response = await post(app, requestBody, { MAIL_CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID, MAIL_CLOUDFLARE_API_TOKEN: API_TOKEN });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "The send_email binding \"EMAIL\" is not set." });
    });

    test("maps REST API errors without leaking the token", async () => {
        jest.spyOn(globalThis, "fetch").mockImplementation(mockFetch(jsonResponse(429, {
            success: false,
            errors: [{ code: 10004, message: "email.sending.error.throttled" }],
            messages: [],
            result: null,
        })) as unknown as typeof fetch);
        const app = deploy([Functions.sendMail({ auth: new NoneAuthAdapter() })]);
        const response = await post(app, requestBody, {
            MAIL_CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
            MAIL_CLOUDFLARE_API_TOKEN: API_TOKEN,
        });
        expect(response.status).toBe(429);
        const text = await response.text();
        expect(text).toContain("10004");
        expect(text).not.toContain(API_TOKEN);
    });

    test("maps REST API 401 to 500", async () => {
        jest.spyOn(globalThis, "fetch").mockImplementation(mockFetch(jsonResponse(401, {
            success: false,
            errors: [{ code: 10101, message: "email.sending.error.authentication.unauthorized" }],
            messages: [],
            result: null,
        })) as unknown as typeof fetch);
        const app = deploy([Functions.sendMail({ auth: new NoneAuthAdapter() })]);
        const response = await post(app, requestBody, {
            MAIL_CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
            MAIL_CLOUDFLARE_API_TOKEN: API_TOKEN,
        });
        expect(response.status).toBe(500);
        const body = await response.json() as { error: string };
        expect(body.error).toContain("401");
        expect(body.error).not.toContain(API_TOKEN);
    });
});
