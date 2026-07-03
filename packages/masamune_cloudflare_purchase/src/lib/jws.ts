import { base64UrlDecode, HttpError } from "@mathrunet/masamune_cloudflare";

/**
 * Decoded JWS token.
 *
 * デコードされたJWSトークン。
 */
export interface DecodedJws {
    header: { [key: string]: any };
    payload: { [key: string]: any };
}

/**
 * Decode a JWS token without verification.
 *
 * JWSトークンを検証せずにデコードします。
 */
export function decodeJws(token: string): DecodedJws {
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new HttpError(400, "Invalid JWT token.");
    }
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as { [key: string]: any };
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as { [key: string]: any };
    return { header, payload };
}

/**
 * Verify a JWS token using the leaf certificate in its `x5c` header (App Store Server API style).
 *
 * Note: Only the leaf certificate is used for signature verification. Full certificate chain validation is not performed.
 *
 * ヘッダーの`x5c`のリーフ証明書を使用してJWSトークンを検証します（App Store Server API方式）。
 *
 * 注意: 署名検証にはリーフ証明書のみを使用します。証明書チェーン全体の検証は行いません。
 *
 * @param token
 * JWS token.
 *
 * JWSトークン。
 *
 * @returns { Promise<DecodedJws> }
 * Decoded and verified JWS.
 *
 * デコード・検証済みのJWS。
 */
export async function verifyJwsWithX5c(token: string): Promise<DecodedJws> {
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new HttpError(400, "Invalid JWT token.");
    }
    const decoded = decodeJws(token);
    const algorithm = decoded.header["alg"] as string | undefined;
    const x5c = decoded.header["x5c"] as string[] | undefined;
    if (!x5c || !Array.isArray(x5c) || x5c.length === 0) {
        throw new HttpError(400, "Missing x5c certificate chain in JWT header.");
    }
    const certificateDer = base64Decode(x5c[0]);
    const spki = extractSubjectPublicKeyInfo(certificateDer);
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlDecode(parts[2]);
    let valid = false;
    if (algorithm === "ES256") {
        const key = await crypto.subtle.importKey(
            "spki",
            spki.buffer as ArrayBuffer,
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["verify"],
        );
        valid = await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            key,
            signature.buffer as ArrayBuffer,
            signingInput,
        );
    } else if (algorithm === "RS256") {
        const key = await crypto.subtle.importKey(
            "spki",
            spki.buffer as ArrayBuffer,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["verify"],
        );
        valid = await crypto.subtle.verify(
            "RSASSA-PKCS1-v1_5",
            key,
            signature.buffer as ArrayBuffer,
            signingInput,
        );
    } else {
        throw new HttpError(400, `Unsupported JWS algorithm: ${algorithm}`);
    }
    if (!valid) {
        throw new HttpError(400, "Invalid JWT token: signature verification failed.");
    }
    return decoded;
}

function base64Decode(data: string): Uint8Array {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

interface DerElement {
    tag: number;
    start: number;
    contentStart: number;
    contentEnd: number;
}

function readDerElement(bytes: Uint8Array, offset: number): DerElement {
    if (offset >= bytes.length) {
        throw new HttpError(400, "Invalid certificate: unexpected end of data.");
    }
    const tag = bytes[offset];
    let cursor = offset + 1;
    let length = bytes[cursor];
    cursor++;
    if (length & 0x80) {
        const lengthBytes = length & 0x7f;
        length = 0;
        for (let i = 0; i < lengthBytes; i++) {
            length = (length << 8) | bytes[cursor];
            cursor++;
        }
    }
    return {
        tag,
        start: offset,
        contentStart: cursor,
        contentEnd: cursor + length,
    };
}

function readDerChildren(bytes: Uint8Array, element: DerElement): DerElement[] {
    const children: DerElement[] = [];
    let cursor = element.contentStart;
    while (cursor < element.contentEnd) {
        const child = readDerElement(bytes, cursor);
        children.push(child);
        cursor = child.contentEnd;
    }
    return children;
}

/**
 * Extract the DER-encoded SubjectPublicKeyInfo from a DER-encoded X.509 certificate.
 *
 * DERエンコードされたX.509証明書からDERエンコードされたSubjectPublicKeyInfoを抽出します。
 */
export function extractSubjectPublicKeyInfo(certificate: Uint8Array): Uint8Array {
    // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
    const root = readDerElement(certificate, 0);
    if (root.tag !== 0x30) {
        throw new HttpError(400, "Invalid certificate: not a DER sequence.");
    }
    const rootChildren = readDerChildren(certificate, root);
    if (rootChildren.length < 1 || rootChildren[0].tag !== 0x30) {
        throw new HttpError(400, "Invalid certificate: tbsCertificate is missing.");
    }
    // TBSCertificate ::= SEQUENCE { [0] version OPTIONAL, serialNumber, signature,
    //   issuer, validity, subject, subjectPublicKeyInfo, ... }
    const tbsChildren = readDerChildren(certificate, rootChildren[0]);
    let index = 0;
    // Skip the optional [0] explicit version tag.
    if (tbsChildren.length > 0 && tbsChildren[0].tag === 0xa0) {
        index = 1;
    }
    // serialNumber, signature, issuer, validity, subject
    const spkiElement = tbsChildren[index + 5];
    if (!spkiElement || spkiElement.tag !== 0x30) {
        throw new HttpError(400, "Invalid certificate: subjectPublicKeyInfo is missing.");
    }
    return certificate.slice(spkiElement.start, spkiElement.contentEnd);
}
