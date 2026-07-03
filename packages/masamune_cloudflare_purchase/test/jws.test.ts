import { webcrypto } from "crypto";
import { decodeJws, extractSubjectPublicKeyInfo, verifyJwsWithX5c } from "../src/lib/jws";

if (!(globalThis as { crypto?: Crypto }).crypto) {
    (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

function derLength(length: number): number[] {
    if (length < 0x80) {
        return [length];
    }
    const bytes: number[] = [];
    let value = length;
    while (value > 0) {
        bytes.unshift(value & 0xff);
        value >>= 8;
    }
    return [0x80 | bytes.length, ...bytes];
}

function derWrap(tag: number, content: number[]): number[] {
    return [tag, ...derLength(content.length), ...content];
}

// extractSubjectPublicKeyInfo が期待する構造（[0] version, serial, signature, issuer,
// validity, subject, subjectPublicKeyInfo）を持つ最小限のDER証明書を構築します。
function buildMinimalCertificate(spki: Uint8Array): Uint8Array {
    const version = derWrap(0xa0, derWrap(0x02, [0x02]));
    const serialNumber = derWrap(0x02, [0x01]);
    const signatureAlgorithm = derWrap(0x30, []);
    const issuer = derWrap(0x30, []);
    const validity = derWrap(0x30, []);
    const subject = derWrap(0x30, []);
    const tbs = derWrap(0x30, [
        ...version,
        ...serialNumber,
        ...signatureAlgorithm,
        ...issuer,
        ...validity,
        ...subject,
        ...Array.from(spki),
    ]);
    const outerSignatureAlgorithm = derWrap(0x30, []);
    const signatureValue = derWrap(0x03, [0x00]);
    const certificate = derWrap(0x30, [
        ...tbs,
        ...outerSignatureAlgorithm,
        ...signatureValue,
    ]);
    return new Uint8Array(certificate);
}

function base64UrlEncode(data: Uint8Array | string): string {
    const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
    return buffer.toString("base64url");
}

async function createSignedJws(payload: { [key: string]: any }): Promise<string> {
    const keyPair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
    );
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
    const certificate = buildMinimalCertificate(spki);
    const header = {
        alg: "ES256",
        x5c: [Buffer.from(certificate).toString("base64")],
    };
    const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
    const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.privateKey,
        new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

describe("jws", () => {
    test("decodeJws decodes header and payload", async () => {
        const token = await createSignedJws({ transactionId: "tx-1" });
        const decoded = decodeJws(token);
        expect(decoded.header.alg).toBe("ES256");
        expect(decoded.payload.transactionId).toBe("tx-1");
    });

    test("extractSubjectPublicKeyInfo returns importable SPKI", async () => {
        const keyPair = await crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["sign", "verify"],
        );
        const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
        const certificate = buildMinimalCertificate(spki);
        const extracted = extractSubjectPublicKeyInfo(certificate);
        expect(Buffer.from(extracted).equals(Buffer.from(spki))).toBe(true);
        await expect(crypto.subtle.importKey(
            "spki",
            extracted.buffer as ArrayBuffer,
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["verify"],
        )).resolves.toBeDefined();
    });

    test("verifyJwsWithX5c verifies a valid ES256 token", async () => {
        const token = await createSignedJws({
            transactionId: "tx-1",
            productId: "sub_monthly",
        });
        const verified = await verifyJwsWithX5c(token);
        expect(verified.payload.transactionId).toBe("tx-1");
        expect(verified.payload.productId).toBe("sub_monthly");
    });

    test("verifyJwsWithX5c rejects a tampered payload", async () => {
        const token = await createSignedJws({ transactionId: "tx-1" });
        const parts = token.split(".");
        const tampered = `${parts[0]}.${base64UrlEncode(JSON.stringify({ transactionId: "tx-2" }))}.${parts[2]}`;
        await expect(verifyJwsWithX5c(tampered)).rejects.toThrow("signature verification failed");
    });

    test("verifyJwsWithX5c rejects a token without x5c", async () => {
        const header = { alg: "ES256" };
        const token = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify({}))}.AAAA`;
        await expect(verifyJwsWithX5c(token)).rejects.toThrow("Missing x5c");
    });
});
