import sendgrid from "@sendgrid/mail";
import { send } from "../../src/lib/send_grid";

jest.mock("@sendgrid/mail", () => ({
    __esModule: true,
    default: { setApiKey: jest.fn(), send: jest.fn() },
}));

describe("SendGrid mail adapter", () => {
    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.MAIL_SENDGRID_APIKEY;
    });

    it("passes the configured key and message to SendGrid", async () => {
        process.env.MAIL_SENDGRID_APIKEY = "test-key";
        const request = {
            from: "sender@example.org",
            to: "recipient@example.org",
            subject: "A subject",
            text: "A message",
        };
        const response = [{ statusCode: 202 }];
        (sendgrid.send as jest.Mock).mockResolvedValue(response);

        await expect(send(request)).resolves.toBe(response);
        expect(sendgrid.setApiKey).toHaveBeenCalledWith("test-key");
        expect(sendgrid.send).toHaveBeenCalledWith(request);
    });

    it("propagates provider failures", async () => {
        const failure = new Error("provider unavailable");
        (sendgrid.send as jest.Mock).mockRejectedValue(failure);

        await expect(send({
            from: "sender@example.org",
            to: "recipient@example.org",
            subject: "A subject",
            text: "A message",
        })).rejects.toBe(failure);
    });
});
