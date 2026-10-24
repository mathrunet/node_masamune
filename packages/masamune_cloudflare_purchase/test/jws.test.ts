import { webcrypto } from "crypto";
import {
    APPLE_RECEIPT_SIGNING_OID,
    APPLE_ROOT_CA_G3_DER_BASE64,
    APPLE_WWDR_INTERMEDIATE_OID,
    decodeJws,
    extractSubjectPublicKeyInfo,
    parseCertificate,
    verifyCertificateSignature,
    verifyJwsWithX5c,
} from "../src/lib/jws";
import {
    base64UrlEncode,
    createForgedChain,
    createRootCertificate,
    createSignedJws,
    createTestChain,
    TestChain,
} from "./test_certificates";

if (!(globalThis as { crypto?: Crypto }).crypto) {
    (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

describe("jws", () => {
    let chain: TestChain;

    beforeAll(async () => {
        chain = await createTestChain();
    });

    test("decodeJws decodes header and payload", async () => {
        const token = await createSignedJws({ transactionId: "tx-1" }, chain);
        const decoded = decodeJws(token);
        expect(decoded.header.alg).toBe("ES256");
        expect(decoded.payload.transactionId).toBe("tx-1");
    });

    test("extractSubjectPublicKeyInfo returns importable SPKI", async () => {
        const spki = new Uint8Array(await crypto.subtle.exportKey("spki", chain.leaf.keyPair.publicKey));
        const extracted = extractSubjectPublicKeyInfo(chain.leaf.der);
        expect(Buffer.from(extracted).equals(Buffer.from(spki))).toBe(true);
        await expect(crypto.subtle.importKey(
            "spki",
            extracted.buffer as ArrayBuffer,
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["verify"],
        )).resolves.toBeDefined();
    });

    test("verifyJwsWithX5c verifies a token whose chain is anchored to a trusted root", async () => {
        const token = await createSignedJws({
            transactionId: "tx-1",
            productId: "sub_monthly",
            bundleId: "net.mathru.app",
            environment: "Sandbox",
        }, chain);
        const verified = await verifyJwsWithX5c(token, {
            rootCertificates: [chain.root.base64],
            bundleId: "net.mathru.app",
            environment: "Sandbox",
        });
        expect(verified.payload.transactionId).toBe("tx-1");
        expect(verified.payload.productId).toBe("sub_monthly");
    });

    test("verifyJwsWithX5c rejects a self-signed forged certificate", async () => {
        const forged = await createForgedChain();
        const token = await createSignedJws({ transactionId: "tx-1" }, forged);
        // Default roots (Apple Root CA - G3).
        await expect(verifyJwsWithX5c(token)).rejects.toThrow(/chain|anchored|WWDR/);
        // Even with the test root pinned.
        await expect(verifyJwsWithX5c(token, { rootCertificates: [chain.root.base64] })).rejects.toThrow(/chain|anchored|WWDR/);
    });

    test("verifyJwsWithX5c rejects a chain anchored to a different root", async () => {
        const otherRoot = await createRootCertificate("Other Root");
        const token = await createSignedJws({ transactionId: "tx-1" }, chain);
        await expect(verifyJwsWithX5c(token, { rootCertificates: [otherRoot.base64] }))
            .rejects.toThrow("not anchored to a trusted root");
    });

    test("verifyJwsWithX5c rejects a genuine chain by default when it is not Apple's", async () => {
        const token = await createSignedJws({ transactionId: "tx-1" }, chain);
        await expect(verifyJwsWithX5c(token)).rejects.toThrow("not anchored to a trusted root");
    });

    test("verifyJwsWithX5c rejects an expired leaf certificate", async () => {
        const expired = await createTestChain({ root: chain.root, leafNotAfter: new Date(Date.now() - 60 * 1000) });
        const token = await createSignedJws({ transactionId: "tx-1" }, expired);
        await expect(verifyJwsWithX5c(token, { rootCertificates: [chain.root.base64] }))
            .rejects.toThrow("expired or not yet valid");
    });

    test("verifyJwsWithX5c rejects a leaf without the Apple receipt signing OID", async () => {
        const noOid = await createTestChain({ root: chain.root, leafExtensionOids: [] });
        const token = await createSignedJws({ transactionId: "tx-1" }, noOid);
        await expect(verifyJwsWithX5c(token, { rootCertificates: [chain.root.base64] }))
            .rejects.toThrow("not an Apple receipt signing certificate");
    });

    test("verifyJwsWithX5c rejects an intermediate without the Apple WWDR OID", async () => {
        const noOid = await createTestChain({ root: chain.root, intermediateExtensionOids: [] });
        const token = await createSignedJws({ transactionId: "tx-1" }, noOid);
        await expect(verifyJwsWithX5c(token, { rootCertificates: [chain.root.base64] }))
            .rejects.toThrow("not an Apple WWDR certificate");
    });

    test("verifyJwsWithX5c rejects a chain shorter than three certificates", async () => {
        const token = await createSignedJws({ transactionId: "tx-1" }, chain, {
            x5c: [chain.leaf.base64, chain.intermediate.base64],
        });
        await expect(verifyJwsWithX5c(token, { rootCertificates: [chain.root.base64] }))
            .rejects.toThrow("Invalid certificate chain length");
    });

    test("verifyJwsWithX5c rejects a tampered payload", async () => {
        const token = await createSignedJws({ transactionId: "tx-1" }, chain);
        const parts = token.split(".");
        const tampered = `${parts[0]}.${base64UrlEncode(JSON.stringify({ transactionId: "tx-2" }))}.${parts[2]}`;
        await expect(verifyJwsWithX5c(tampered, { rootCertificates: [chain.root.base64] }))
            .rejects.toThrow("signature verification failed");
    });

    test("verifyJwsWithX5c rejects a token without x5c", async () => {
        const header = { alg: "ES256" };
        const token = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify({}))}.AAAA`;
        await expect(verifyJwsWithX5c(token)).rejects.toThrow("Missing x5c");
    });

    test("verifyJwsWithX5c rejects non-ES256 algorithms", async () => {
        const token = await createSignedJws({ transactionId: "tx-1" }, chain, { alg: "RS256" });
        await expect(verifyJwsWithX5c(token, { rootCertificates: [chain.root.base64] }))
            .rejects.toThrow("Unsupported JWS algorithm");
    });

    test("verifyJwsWithX5c rejects bundleId and environment mismatches", async () => {
        const token = await createSignedJws({
            transactionId: "tx-1",
            bundleId: "net.mathru.app",
            environment: "Sandbox",
        }, chain);
        await expect(verifyJwsWithX5c(token, { rootCertificates: [chain.root.base64], bundleId: "net.mathru.other" }))
            .rejects.toThrow("Bundle ID mismatch");
        await expect(verifyJwsWithX5c(token, { rootCertificates: [chain.root.base64], environment: "Production" }))
            .rejects.toThrow("Environment mismatch");
    });

    test("the pinned Apple Root CA - G3 constant parses and is self-signed", async () => {
        const der = new Uint8Array(Buffer.from(APPLE_ROOT_CA_G3_DER_BASE64, "base64"));
        const root = parseCertificate(der);
        expect(root.isCa).toBe(true);
        expect(root.namedCurveOid).toBe("1.3.132.0.34");
        expect(Buffer.from(root.subject).toString("latin1")).toContain("Apple Root CA - G3");
        expect(Buffer.from(root.issuer).equals(Buffer.from(root.subject))).toBe(true);
        expect(root.notAfter.getUTCFullYear()).toBe(2039);
        await expect(verifyCertificateSignature(root, root)).resolves.toBe(true);
    });

    test("parseCertificate exposes extension OIDs and CA flag", () => {
        const leaf = parseCertificate(chain.leaf.der);
        expect(leaf.extensionOids.has(APPLE_RECEIPT_SIGNING_OID)).toBe(true);
        expect(leaf.isCa).toBe(false);
        const intermediate = parseCertificate(chain.intermediate.der);
        expect(intermediate.extensionOids.has(APPLE_WWDR_INTERMEDIATE_OID)).toBe(true);
        expect(intermediate.isCa).toBe(true);
    });
});
