import { webcrypto } from "crypto";
import { MiddlewareHandler } from "hono";
import { WorkersAuthAdapterBase } from "@mathrunet/masamune_cloudflare";
import { APPLE_RECEIPT_SIGNING_OID, APPLE_WWDR_INTERMEDIATE_OID } from "../src/lib/jws";

if (!(globalThis as { crypto?: Crypto }).crypto) {
    (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

/**
 * Auth adapter that marks every request as the given user (test only).
 *
 * すべてのリクエストを指定ユーザーとして認証済みにするテスト用アダプター。
 */
export class StaticAuthAdapter extends WorkersAuthAdapterBase {
    constructor(private readonly uid: string) {
        super();
    }

    build(): MiddlewareHandler {
        return async (context, next) => {
            this.setAuthContext(context, { uid: this.uid, token: { uid: this.uid } });
            await next();
        };
    }
}

export type Curve = "P-256" | "P-384";

export interface TestCertificate {
    der: Uint8Array;
    base64: string;
    keyPair: CryptoKeyPair;
    curve: Curve;
    subjectCN: string;
}

export interface TestChain {
    root: TestCertificate;
    intermediate: TestCertificate;
    leaf: TestCertificate;
    x5c: string[];
}

const OID_ECDSA_WITH_SHA256 = "1.2.840.10045.4.3.2";
const OID_ECDSA_WITH_SHA384 = "1.2.840.10045.4.3.3";
const OID_BASIC_CONSTRAINTS = "2.5.29.19";
const OID_COMMON_NAME = "2.5.4.3";

export function derLength(length: number): number[] {
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

export function derWrap(tag: number, content: number[]): number[] {
    return [tag, ...derLength(content.length), ...content];
}

export function encodeOid(oid: string): number[] {
    const parts = oid.split(".").map((part) => parseInt(part, 10));
    const bytes: number[] = [parts[0] * 40 + parts[1]];
    for (const part of parts.slice(2)) {
        const chunk: number[] = [part & 0x7f];
        let value = Math.floor(part / 128);
        while (value > 0) {
            chunk.unshift((value & 0x7f) | 0x80);
            value = Math.floor(value / 128);
        }
        bytes.push(...chunk);
    }
    return derWrap(0x06, bytes);
}

function encodeInteger(bytes: Uint8Array): number[] {
    let value = Array.from(bytes);
    while (value.length > 1 && value[0] === 0) {
        value = value.slice(1);
    }
    if (value[0] & 0x80) {
        value = [0, ...value];
    }
    return derWrap(0x02, value);
}

function encodeName(cn: string): number[] {
    const value = Array.from(new TextEncoder().encode(cn));
    return derWrap(0x30, derWrap(0x31, derWrap(0x30, [...encodeOid(OID_COMMON_NAME), ...derWrap(0x0c, value)])));
}

function encodeUtcTime(date: Date): number[] {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const text = `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
        `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
    return derWrap(0x17, Array.from(new TextEncoder().encode(text)));
}

function rawEcdsaToDer(raw: Uint8Array): number[] {
    const half = raw.length / 2;
    return derWrap(0x30, [...encodeInteger(raw.slice(0, half)), ...encodeInteger(raw.slice(half))]);
}

export interface CreateCertificateOptions {
    subjectCN: string;
    issuerCN: string;
    subjectPublicKey: CryptoKey;
    signerPrivateKey: CryptoKey;
    signerHash: "SHA-256" | "SHA-384";
    notBefore?: Date;
    notAfter?: Date;
    extensionOids?: string[];
    isCa?: boolean;
}

/**
 * Build a real, signed DER X.509 certificate for tests.
 *
 * テスト用に実際に署名されたDER X.509証明書を構築します。
 */
export async function createCertificate(options: CreateCertificateOptions): Promise<Uint8Array> {
    const signatureOid = options.signerHash === "SHA-384" ? OID_ECDSA_WITH_SHA384 : OID_ECDSA_WITH_SHA256;
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", options.subjectPublicKey));
    const notBefore = options.notBefore ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notAfter = options.notAfter ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const extensions: number[] = [];
    if (options.isCa) {
        extensions.push(...derWrap(0x30, [
            ...encodeOid(OID_BASIC_CONSTRAINTS),
            ...derWrap(0x01, [0xff]),
            ...derWrap(0x04, derWrap(0x30, derWrap(0x01, [0xff]))),
        ]));
    }
    for (const oid of options.extensionOids ?? []) {
        extensions.push(...derWrap(0x30, [...encodeOid(oid), ...derWrap(0x04, derWrap(0x05, []))]));
    }
    const tbs = derWrap(0x30, [
        ...derWrap(0xa0, derWrap(0x02, [0x02])),
        ...derWrap(0x02, [0x01]),
        ...derWrap(0x30, encodeOid(signatureOid)),
        ...encodeName(options.issuerCN),
        ...derWrap(0x30, [...encodeUtcTime(notBefore), ...encodeUtcTime(notAfter)]),
        ...encodeName(options.subjectCN),
        ...Array.from(spki),
        ...(extensions.length > 0 ? derWrap(0xa3, derWrap(0x30, extensions)) : []),
    ]);
    const rawSignature = new Uint8Array(await crypto.subtle.sign(
        { name: "ECDSA", hash: options.signerHash },
        options.signerPrivateKey,
        new Uint8Array(tbs),
    ));
    const certificate = derWrap(0x30, [
        ...tbs,
        ...derWrap(0x30, encodeOid(signatureOid)),
        ...derWrap(0x03, [0x00, ...rawEcdsaToDer(rawSignature)]),
    ]);
    return new Uint8Array(certificate);
}

async function generateKeyPair(curve: Curve): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: curve }, true, ["sign", "verify"]);
}

export interface CreateTestChainOptions {
    leafExtensionOids?: string[];
    intermediateExtensionOids?: string[];
    leafNotAfter?: Date;
    root?: TestCertificate;
}

/**
 * Build root (P-384) → intermediate (P-256, WWDR OID) → leaf (P-256, receipt signing OID).
 *
 * ルート（P-384）→ 中間（P-256、WWDR OID）→ リーフ（P-256、レシート署名OID）のチェーンを構築します。
 */
export async function createTestChain(options: CreateTestChainOptions = {}): Promise<TestChain> {
    const root = options.root ?? await createRootCertificate();
    const intermediateKeys = await generateKeyPair("P-256");
    const intermediateDer = await createCertificate({
        subjectCN: "Test WWDR",
        issuerCN: root.subjectCN,
        subjectPublicKey: intermediateKeys.publicKey,
        signerPrivateKey: root.keyPair.privateKey,
        signerHash: "SHA-384",
        extensionOids: options.intermediateExtensionOids ?? [APPLE_WWDR_INTERMEDIATE_OID],
        isCa: true,
    });
    const leafKeys = await generateKeyPair("P-256");
    const leafDer = await createCertificate({
        subjectCN: "Test Receipt Signing",
        issuerCN: "Test WWDR",
        subjectPublicKey: leafKeys.publicKey,
        signerPrivateKey: intermediateKeys.privateKey,
        signerHash: "SHA-256",
        extensionOids: options.leafExtensionOids ?? [APPLE_RECEIPT_SIGNING_OID],
        notAfter: options.leafNotAfter,
    });
    const intermediate: TestCertificate = {
        der: intermediateDer,
        base64: Buffer.from(intermediateDer).toString("base64"),
        keyPair: intermediateKeys,
        curve: "P-256",
        subjectCN: "Test WWDR",
    };
    const leaf: TestCertificate = {
        der: leafDer,
        base64: Buffer.from(leafDer).toString("base64"),
        keyPair: leafKeys,
        curve: "P-256",
        subjectCN: "Test Receipt Signing",
    };
    return { root, intermediate, leaf, x5c: [leaf.base64, intermediate.base64, root.base64] };
}

export async function createRootCertificate(cn: string = "Test Root CA"): Promise<TestCertificate> {
    const keyPair = await generateKeyPair("P-384");
    const der = await createCertificate({
        subjectCN: cn,
        issuerCN: cn,
        subjectPublicKey: keyPair.publicKey,
        signerPrivateKey: keyPair.privateKey,
        signerHash: "SHA-384",
        isCa: true,
    });
    return { der, base64: Buffer.from(der).toString("base64"), keyPair, curve: "P-384", subjectCN: cn };
}

export function base64UrlEncode(data: Uint8Array | string): string {
    const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
    return buffer.toString("base64url");
}

/**
 * Sign a JWS with the chain's leaf key, Apple style (`alg: ES256`, `x5c` chain).
 *
 * チェーンのリーフ鍵でApple方式（`alg: ES256`、`x5c`チェーン）のJWSに署名します。
 */
export async function createSignedJws(
    payload: { [key: string]: any },
    chain: TestChain,
    options: { x5c?: string[], alg?: string } = {},
): Promise<string> {
    const header = {
        alg: options.alg ?? "ES256",
        x5c: options.x5c ?? chain.x5c,
    };
    const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
    const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        chain.leaf.keyPair.privateKey,
        new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Self-signed leaf-only chain: what an attacker can produce without Apple.
 *
 * 自己署名のリーフのみのチェーン。攻撃者がAppleなしで作れるもの。
 */
export async function createForgedChain(): Promise<TestChain> {
    const keyPair = await generateKeyPair("P-256");
    const der = await createCertificate({
        subjectCN: "Forged",
        issuerCN: "Forged",
        subjectPublicKey: keyPair.publicKey,
        signerPrivateKey: keyPair.privateKey,
        signerHash: "SHA-256",
        extensionOids: [APPLE_RECEIPT_SIGNING_OID],
    });
    const leaf: TestCertificate = {
        der,
        base64: Buffer.from(der).toString("base64"),
        keyPair,
        curve: "P-256",
        subjectCN: "Forged",
    };
    return { root: leaf, intermediate: leaf, leaf, x5c: [leaf.base64, leaf.base64, leaf.base64] };
}
