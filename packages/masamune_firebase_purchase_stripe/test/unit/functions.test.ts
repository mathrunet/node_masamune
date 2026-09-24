jest.mock("@mathrunet/masamune_firebase", () => ({
    FunctionsData: class {
        id: string;
        func: unknown;
        options: unknown;
        constructor(data: { id: string; func: unknown; options: unknown }) {
            this.id = data.id;
            this.func = data.func;
            this.options = data.options;
        }
    },
}));

const stripeFunction = jest.fn();
const webhookFunction = jest.fn();
const connectFunction = jest.fn();
const secureFunction = jest.fn();
jest.mock("../../src/functions/stripe", () => stripeFunction);
jest.mock("../../src/functions/stripe_webhook", () => webhookFunction);
jest.mock("../../src/functions/stripe_webhook_connect", () => connectFunction);
jest.mock("../../src/functions/stripe_webhook_secure", () => secureFunction);

import { Functions } from "../../src/functions";

describe("Stripe function registrations", () => {
    it.each([
        ["stripe", "stripe", stripeFunction],
        ["stripeWebhook", "stripe_webhook", webhookFunction],
        ["stripeWebhookConnect", "stripe_webhook_connect", connectFunction],
        ["stripeWebhookSecure", "stripe_webhook_secure", secureFunction],
    ] as const)("registers %s with its handler and options", (name, id, handler) => {
        const options = { region: "asia-northeast1" };
        const registration = Functions[name](options) as unknown as {
            id: string; func: unknown; options: unknown;
        };
        expect(registration.id).toBe(id);
        expect(registration.func).toBe(handler);
        expect(registration.options).toBe(options);
    });
});
