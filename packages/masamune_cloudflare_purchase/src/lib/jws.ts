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
 * Options for [verifyJwsWithX5c].
 *
 * [verifyJwsWithX5c]のオプション。
 */
export interface VerifyJwsOptions {
    /**
     * Trusted root certificates (DER encoded, base64 string or raw bytes).
     * The `x5c` chain must be anchored to one of these.
     * Defaults to Apple Root CA - G3.
     *
     * 信頼するルート証明書（DERエンコード。base64文字列または生バイト列）。
     * `x5c`チェーンはこのいずれかに連結していなければなりません。
     * デフォルトはApple Root CA - G3です。
     */
    rootCertificates?: (string | Uint8Array)[] | undefined;

    /**
     * If specified, `payload.bundleId` must match this value.
     *
     * 指定した場合、`payload.bundleId`がこの値と一致しなければなりません。
     */
    bundleId?: string | undefined;

    /**
     * If specified, `payload.environment` must match this value (`Production` or `Sandbox`).
     *
     * 指定した場合、`payload.environment`がこの値（`Production`または`Sandbox`）と一致しなければなりません。
     */
    environment?: string | undefined;

    /**
     * Clock used for certificate validity checks. Defaults to the current time.
     *
     * 証明書の有効期間チェックに使用する時刻。デフォルトは現在時刻です。
     */
    now?: Date | undefined;
}

/**
 * Apple Root CA - G3 (DER, base64).
 *
 * Source: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 * Subject: CN=Apple Root CA - G3, OU=Apple Certification Authority, O=Apple Inc., C=US
 * Key: ECDSA P-384
 * Valid: 2014-04-30 to 2039-04-30
 * SHA-256 fingerprint: 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
 *
 * Apple Root CA - G3（DER、base64）。
 */
export const APPLE_ROOT_CA_G3_DER_BASE64 = "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

/**
 * Certificate extension OID that Apple places on App Store receipt / App Store Server API signing (leaf) certificates.
 *
 * AppleがApp Storeレシート / App Store Server API署名（リーフ）証明書に付与する拡張OID。
 */
export const APPLE_RECEIPT_SIGNING_OID = "1.2.840.113635.100.6.11.1";

/**
 * Certificate extension OID that Apple places on the Worldwide Developer Relations intermediate certificates.
 *
 * AppleがWorldwide Developer Relations中間証明書に付与する拡張OID。
 */
export const APPLE_WWDR_INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1";

const OID_ECDSA_WITH_SHA256 = "1.2.840.10045.4.3.2";
const OID_ECDSA_WITH_SHA384 = "1.2.840.10045.4.3.3";
const OID_ECDSA_WITH_SHA512 = "1.2.840.10045.4.3.4";
const OID_EC_PUBLIC_KEY = "1.2.840.10045.2.1";
const OID_CURVE_P256 = "1.2.840.10045.3.1.7";
const OID_CURVE_P384 = "1.3.132.0.34";
const OID_CURVE_P521 = "1.3.132.0.35";
const OID_BASIC_CONSTRAINTS = "2.5.29.19";

const MIN_CHAIN_LENGTH = 3;
const MAX_CHAIN_LENGTH = 5;

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
 * Verify a JWS token signed by Apple (App Store Server API / StoreKit 2 / App Store Server Notifications style).
 *
 * The `x5c` certificate chain in the header is validated as follows before the signature is checked:
 * 1. Every certificate must be within its validity period.
 * 2. Each certificate must be issued and signed by the next one in the chain.
 * 3. The chain must be anchored to one of `options.rootCertificates` (default: Apple Root CA - G3).
 * 4. The leaf must carry the Apple receipt signing OID and the intermediate must carry the Apple WWDR OID.
 *
 * The JWS signature is then verified with the leaf public key, and `bundleId` / `environment` are checked when specified.
 *
 * Appleが署名したJWSトークン（App Store Server API / StoreKit 2 / App Store Server Notifications方式）を検証します。
 *
 * 署名を確認する前に、ヘッダーの`x5c`証明書チェーンを以下の手順で検証します。
 * 1. すべての証明書が有効期間内であること。
 * 2. 各証明書がチェーン内の次の証明書によって発行・署名されていること。
 * 3. チェーンが`options.rootCertificates`（デフォルト: Apple Root CA - G3）のいずれかに連結していること。
 * 4. リーフがAppleレシート署名OIDを、中間証明書がApple WWDR OIDを持つこと。
 *
 * その後、リーフの公開鍵でJWS署名を検証し、指定されていれば`bundleId` / `environment`を照合します。
 *
 * @param token
 * JWS token.
 *
 * JWSトークン。
 *
 * @param options
 * Verification options.
 *
 * 検証オプション。
 *
 * @returns { Promise<DecodedJws> }
 * Decoded and verified JWS.
 *
 * デコード・検証済みのJWS。
 */
export async function verifyJwsWithX5c(token: string, options: VerifyJwsOptions = {}): Promise<DecodedJws> {
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new HttpError(400, "Invalid JWT token.");
    }
    const decoded = decodeJws(token);
    const algorithm = decoded.header["alg"] as string | undefined;
    if (algorithm !== "ES256") {
        throw new HttpError(400, `Unsupported JWS algorithm: ${algorithm}`);
    }
    const x5c = decoded.header["x5c"] as string[] | undefined;
    if (!x5c || !Array.isArray(x5c) || x5c.length === 0) {
        throw new HttpError(400, "Missing x5c certificate chain in JWT header.");
    }
    const roots = (options.rootCertificates ?? [APPLE_ROOT_CA_G3_DER_BASE64]).map(toDer);
    const chain = x5c.map((certificate) => {
        if (typeof certificate !== "string") {
            throw new HttpError(400, "Invalid x5c certificate chain.");
        }
        return base64Decode(certificate);
    });
    const leaf = await verifyCertificateChain(chain, roots, options.now ?? new Date());
    if (leaf.namedCurveOid !== OID_CURVE_P256) {
        throw new HttpError(401, "Invalid JWT token: leaf certificate key is not P-256.");
    }
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlDecode(parts[2]);
    const key = await crypto.subtle.importKey(
        "spki",
        toArrayBuffer(leaf.spki),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
    );
    const valid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        toArrayBuffer(signature),
        signingInput,
    );
    if (!valid) {
        throw new HttpError(401, "Invalid JWT token: signature verification failed.");
    }
    if (options.bundleId && decoded.payload["bundleId"] !== options.bundleId) {
        throw new HttpError(403, "Bundle ID mismatch.");
    }
    if (options.environment && decoded.payload["environment"] !== options.environment) {
        throw new HttpError(403, "Environment mismatch.");
    }
    return decoded;
}

/**
 * Parsed X.509 certificate.
 *
 * パース済みのX.509証明書。
 */
export interface ParsedCertificate {
    /** Raw DER bytes of the whole certificate. 証明書全体のDERバイト列。 */
    der: Uint8Array;
    /** Raw DER bytes of TBSCertificate (the signed data). TBSCertificate（署名対象）のDERバイト列。 */
    tbs: Uint8Array;
    /** Signature algorithm OID. 署名アルゴリズムのOID。 */
    signatureAlgorithmOid: string;
    /** Signature bytes (without the BIT STRING unused-bits byte). 署名バイト列（BIT STRINGの未使用ビット数バイトを除く）。 */
    signature: Uint8Array;
    /** Raw DER bytes of the issuer Name. 発行者NameのDERバイト列。 */
    issuer: Uint8Array;
    /** Raw DER bytes of the subject Name. 主体者NameのDERバイト列。 */
    subject: Uint8Array;
    /** Validity start. 有効期間の開始。 */
    notBefore: Date;
    /** Validity end. 有効期間の終了。 */
    notAfter: Date;
    /** Raw DER bytes of SubjectPublicKeyInfo. SubjectPublicKeyInfoのDERバイト列。 */
    spki: Uint8Array;
    /** Named curve OID for EC keys. EC鍵の名前付き曲線OID。 */
    namedCurveOid?: string | undefined;
    /** OIDs of all extensions. すべての拡張のOID。 */
    extensionOids: Set<string>;
    /** basicConstraints cA flag. basicConstraintsのcAフラグ。 */
    isCa: boolean;
}

/**
 * Verify an `x5c` certificate chain (leaf first) against trusted roots and return the leaf certificate.
 *
 * `x5c`証明書チェーン（リーフが先頭）を信頼するルート証明書に対して検証し、リーフ証明書を返します。
 *
 * @param chain
 * DER encoded certificates, leaf first.
 *
 * DERエンコードされた証明書（リーフが先頭）。
 *
 * @param roots
 * DER encoded trusted root certificates.
 *
 * DERエンコードされた信頼するルート証明書。
 *
 * @param now
 * Clock used for validity checks.
 *
 * 有効期間チェックに使用する時刻。
 *
 * @returns { Promise<ParsedCertificate> }
 * The verified leaf certificate.
 *
 * 検証済みのリーフ証明書。
 */
export async function verifyCertificateChain(
    chain: Uint8Array[],
    roots: Uint8Array[],
    now: Date = new Date(),
): Promise<ParsedCertificate> {
    if (chain.length < MIN_CHAIN_LENGTH || chain.length > MAX_CHAIN_LENGTH) {
        throw new HttpError(401, "Invalid certificate chain length.");
    }
    if (roots.length === 0) {
        throw new HttpError(500, "No trusted root certificates are configured.");
    }
    const certificates = chain.map(parseCertificate);
    for (const certificate of certificates) {
        if (now < certificate.notBefore || now > certificate.notAfter) {
            throw new HttpError(401, "Certificate is expired or not yet valid.");
        }
    }
    const leaf = certificates[0];
    const intermediate = certificates[1];
    if (!leaf.extensionOids.has(APPLE_RECEIPT_SIGNING_OID)) {
        throw new HttpError(401, "Leaf certificate is not an Apple receipt signing certificate.");
    }
    if (!intermediate.extensionOids.has(APPLE_WWDR_INTERMEDIATE_OID)) {
        throw new HttpError(401, "Intermediate certificate is not an Apple WWDR certificate.");
    }
    for (let i = 0; i < certificates.length - 1; i++) {
        const child = certificates[i];
        const parent = certificates[i + 1];
        if (!bytesEqual(child.issuer, parent.subject) || !parent.isCa) {
            throw new HttpError(401, "Certificate chain is broken.");
        }
        if (!(await verifyCertificateSignature(child, parent))) {
            throw new HttpError(401, "Certificate chain signature verification failed.");
        }
    }
    const last = certificates[certificates.length - 1];
    const trustedRoots = roots.map(parseCertificate);
    let anchored = trustedRoots.some((root) => bytesEqual(root.der, last.der));
    if (!anchored) {
        // The chain may omit the root itself; accept if the last certificate is directly issued by a trusted root.
        // チェーンがルート自体を含まない場合、最後の証明書が信頼するルートから直接発行されていれば受け入れます。
        for (const root of trustedRoots) {
            if (!root.isCa || !bytesEqual(last.issuer, root.subject)) {
                continue;
            }
            if (now < root.notBefore || now > root.notAfter) {
                continue;
            }
            if (await verifyCertificateSignature(last, root)) {
                anchored = true;
                break;
            }
        }
    }
    if (!anchored) {
        throw new HttpError(401, "Certificate chain is not anchored to a trusted root.");
    }
    return leaf;
}

/**
 * Verify that `child` is signed by `parent`'s public key.
 *
 * `child`が`parent`の公開鍵で署名されていることを検証します。
 */
export async function verifyCertificateSignature(
    child: ParsedCertificate,
    parent: ParsedCertificate,
): Promise<boolean> {
    let hash: string;
    switch (child.signatureAlgorithmOid) {
        case OID_ECDSA_WITH_SHA256:
            hash = "SHA-256";
            break;
        case OID_ECDSA_WITH_SHA384:
            hash = "SHA-384";
            break;
        case OID_ECDSA_WITH_SHA512:
            hash = "SHA-512";
            break;
        default:
            return false;
    }
    let namedCurve: string;
    let coordinateLength: number;
    switch (parent.namedCurveOid) {
        case OID_CURVE_P256:
            namedCurve = "P-256";
            coordinateLength = 32;
            break;
        case OID_CURVE_P384:
            namedCurve = "P-384";
            coordinateLength = 48;
            break;
        case OID_CURVE_P521:
            namedCurve = "P-521";
            coordinateLength = 66;
            break;
        default:
            return false;
    }
    let rawSignature: Uint8Array;
    try {
        rawSignature = derEcdsaSignatureToRaw(child.signature, coordinateLength);
    } catch {
        return false;
    }
    try {
        const key = await crypto.subtle.importKey(
            "spki",
            toArrayBuffer(parent.spki),
            { name: "ECDSA", namedCurve },
            false,
            ["verify"],
        );
        return await crypto.subtle.verify(
            { name: "ECDSA", hash },
            key,
            toArrayBuffer(rawSignature),
            toArrayBuffer(child.tbs),
        );
    } catch {
        return false;
    }
}

/**
 * Parse a DER encoded X.509 certificate.
 *
 * DERエンコードされたX.509証明書をパースします。
 */
export function parseCertificate(der: Uint8Array): ParsedCertificate {
    // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
    const root = readDerElement(der, 0);
    if (root.tag !== 0x30 || root.contentEnd !== der.length) {
        throw new HttpError(400, "Invalid certificate: not a DER sequence.");
    }
    const rootChildren = readDerChildren(der, root);
    if (rootChildren.length !== 3 || rootChildren[0].tag !== 0x30 || rootChildren[1].tag !== 0x30 || rootChildren[2].tag !== 0x03) {
        throw new HttpError(400, "Invalid certificate: unexpected structure.");
    }
    const tbsElement = rootChildren[0];
    const signatureAlgorithmOid = readAlgorithmIdentifier(der, rootChildren[1]).algorithm;
    const signature = readBitString(der, rootChildren[2]);

    // TBSCertificate ::= SEQUENCE { [0] version OPTIONAL, serialNumber, signature,
    //   issuer, validity, subject, subjectPublicKeyInfo, [1], [2], [3] extensions OPTIONAL }
    const tbsChildren = readDerChildren(der, tbsElement);
    let index = 0;
    if (tbsChildren.length > 0 && tbsChildren[0].tag === 0xa0) {
        index = 1;
    }
    const serialNumber = tbsChildren[index];
    const tbsSignature = tbsChildren[index + 1];
    const issuer = tbsChildren[index + 2];
    const validity = tbsChildren[index + 3];
    const subject = tbsChildren[index + 4];
    const spkiElement = tbsChildren[index + 5];
    if (!serialNumber || serialNumber.tag !== 0x02 || !tbsSignature || tbsSignature.tag !== 0x30 ||
        !issuer || issuer.tag !== 0x30 || !validity || validity.tag !== 0x30 ||
        !subject || subject.tag !== 0x30 || !spkiElement || spkiElement.tag !== 0x30) {
        throw new HttpError(400, "Invalid certificate: tbsCertificate is malformed.");
    }
    const tbsSignatureOid = readAlgorithmIdentifier(der, tbsSignature).algorithm;
    if (tbsSignatureOid !== signatureAlgorithmOid) {
        throw new HttpError(400, "Invalid certificate: signature algorithm mismatch.");
    }
    const validityChildren = readDerChildren(der, validity);
    if (validityChildren.length !== 2) {
        throw new HttpError(400, "Invalid certificate: validity is malformed.");
    }
    const notBefore = readTime(der, validityChildren[0]);
    const notAfter = readTime(der, validityChildren[1]);
    const spkiInfo = readAlgorithmIdentifier(der, readDerChildren(der, spkiElement)[0]);
    const namedCurveOid = spkiInfo.algorithm === OID_EC_PUBLIC_KEY ? spkiInfo.parametersOid : undefined;

    const extensionOids = new Set<string>();
    let isCa = false;
    for (let i = index + 6; i < tbsChildren.length; i++) {
        const element = tbsChildren[i];
        if (element.tag !== 0xa3) {
            continue;
        }
        const extensionsSequence = readDerChildren(der, element)[0];
        if (!extensionsSequence || extensionsSequence.tag !== 0x30) {
            throw new HttpError(400, "Invalid certificate: extensions are malformed.");
        }
        for (const extension of readDerChildren(der, extensionsSequence)) {
            const extensionChildren = readDerChildren(der, extension);
            if (extensionChildren.length < 2 || extensionChildren[0].tag !== 0x06) {
                throw new HttpError(400, "Invalid certificate: extension is malformed.");
            }
            const oid = decodeOid(der.subarray(extensionChildren[0].contentStart, extensionChildren[0].contentEnd));
            extensionOids.add(oid);
            const valueElement = extensionChildren[extensionChildren.length - 1];
            if (oid === OID_BASIC_CONSTRAINTS && valueElement.tag === 0x04) {
                isCa = readBasicConstraintsCa(der, valueElement);
            }
        }
    }
    return {
        der,
        tbs: der.slice(tbsElement.start, tbsElement.contentEnd),
        signatureAlgorithmOid,
        signature,
        issuer: der.slice(issuer.start, issuer.contentEnd),
        subject: der.slice(subject.start, subject.contentEnd),
        notBefore,
        notAfter,
        spki: der.slice(spkiElement.start, spkiElement.contentEnd),
        namedCurveOid,
        extensionOids,
        isCa,
    };
}

/**
 * Extract the DER-encoded SubjectPublicKeyInfo from a DER-encoded X.509 certificate.
 *
 * DERエンコードされたX.509証明書からDERエンコードされたSubjectPublicKeyInfoを抽出します。
 */
export function extractSubjectPublicKeyInfo(certificate: Uint8Array): Uint8Array {
    const root = readDerElement(certificate, 0);
    if (root.tag !== 0x30) {
        throw new HttpError(400, "Invalid certificate: not a DER sequence.");
    }
    const rootChildren = readDerChildren(certificate, root);
    if (rootChildren.length < 1 || rootChildren[0].tag !== 0x30) {
        throw new HttpError(400, "Invalid certificate: tbsCertificate is missing.");
    }
    const tbsChildren = readDerChildren(certificate, rootChildren[0]);
    let index = 0;
    if (tbsChildren.length > 0 && tbsChildren[0].tag === 0xa0) {
        index = 1;
    }
    const spkiElement = tbsChildren[index + 5];
    if (!spkiElement || spkiElement.tag !== 0x30) {
        throw new HttpError(400, "Invalid certificate: subjectPublicKeyInfo is missing.");
    }
    return certificate.slice(spkiElement.start, spkiElement.contentEnd);
}

interface DerElement {
    tag: number;
    start: number;
    contentStart: number;
    contentEnd: number;
}

function readDerElement(bytes: Uint8Array, offset: number): DerElement {
    if (offset + 2 > bytes.length) {
        throw new HttpError(400, "Invalid certificate: unexpected end of data.");
    }
    const tag = bytes[offset];
    let cursor = offset + 1;
    let length = bytes[cursor];
    cursor++;
    if (length & 0x80) {
        const lengthBytes = length & 0x7f;
        if (lengthBytes === 0 || lengthBytes > 4 || cursor + lengthBytes > bytes.length) {
            throw new HttpError(400, "Invalid certificate: unsupported length encoding.");
        }
        length = 0;
        for (let i = 0; i < lengthBytes; i++) {
            length = (length * 256) + bytes[cursor];
            cursor++;
        }
    }
    const contentEnd = cursor + length;
    if (contentEnd > bytes.length) {
        throw new HttpError(400, "Invalid certificate: unexpected end of data.");
    }
    return {
        tag,
        start: offset,
        contentStart: cursor,
        contentEnd,
    };
}

function readDerChildren(bytes: Uint8Array, element: DerElement): DerElement[] {
    const children: DerElement[] = [];
    let cursor = element.contentStart;
    while (cursor < element.contentEnd) {
        const child = readDerElement(bytes, cursor);
        if (child.contentEnd > element.contentEnd) {
            throw new HttpError(400, "Invalid certificate: nested element overflows its parent.");
        }
        children.push(child);
        cursor = child.contentEnd;
    }
    return children;
}

function readAlgorithmIdentifier(
    bytes: Uint8Array,
    element: DerElement | undefined,
): { algorithm: string, parametersOid?: string | undefined } {
    if (!element || element.tag !== 0x30) {
        throw new HttpError(400, "Invalid certificate: algorithm identifier is malformed.");
    }
    const children = readDerChildren(bytes, element);
    if (children.length < 1 || children[0].tag !== 0x06) {
        throw new HttpError(400, "Invalid certificate: algorithm identifier is malformed.");
    }
    const algorithm = decodeOid(bytes.subarray(children[0].contentStart, children[0].contentEnd));
    const parametersOid = children.length > 1 && children[1].tag === 0x06
        ? decodeOid(bytes.subarray(children[1].contentStart, children[1].contentEnd))
        : undefined;
    return { algorithm, parametersOid };
}

function readBitString(bytes: Uint8Array, element: DerElement): Uint8Array {
    if (element.tag !== 0x03 || element.contentEnd - element.contentStart < 1) {
        throw new HttpError(400, "Invalid certificate: bit string is malformed.");
    }
    if (bytes[element.contentStart] !== 0) {
        throw new HttpError(400, "Invalid certificate: unsupported bit string padding.");
    }
    return bytes.slice(element.contentStart + 1, element.contentEnd);
}

function readTime(bytes: Uint8Array, element: DerElement): Date {
    const text = new TextDecoder().decode(bytes.subarray(element.contentStart, element.contentEnd));
    let match: RegExpMatchArray | null;
    let year: number;
    if (element.tag === 0x17) {
        // UTCTime: YYMMDDHHMMSSZ
        match = text.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
        if (!match) {
            throw new HttpError(400, "Invalid certificate: time is malformed.");
        }
        const yy = parseInt(match[1], 10);
        year = yy >= 50 ? 1900 + yy : 2000 + yy;
    } else if (element.tag === 0x18) {
        // GeneralizedTime: YYYYMMDDHHMMSSZ
        match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
        if (!match) {
            throw new HttpError(400, "Invalid certificate: time is malformed.");
        }
        year = parseInt(match[1], 10);
    } else {
        throw new HttpError(400, "Invalid certificate: time is malformed.");
    }
    return new Date(Date.UTC(
        year,
        parseInt(match[2], 10) - 1,
        parseInt(match[3], 10),
        parseInt(match[4], 10),
        parseInt(match[5], 10),
        parseInt(match[6], 10),
    ));
}

function readBasicConstraintsCa(bytes: Uint8Array, octetString: DerElement): boolean {
    const inner = readDerElement(bytes, octetString.contentStart);
    if (inner.tag !== 0x30 || inner.contentEnd > octetString.contentEnd) {
        return false;
    }
    const children = readDerChildren(bytes, inner);
    const flag = children[0];
    if (!flag || flag.tag !== 0x01 || flag.contentEnd - flag.contentStart !== 1) {
        return false;
    }
    return bytes[flag.contentStart] !== 0;
}

function decodeOid(bytes: Uint8Array): string {
    if (bytes.length === 0) {
        throw new HttpError(400, "Invalid certificate: OID is malformed.");
    }
    const parts: number[] = [];
    const first = bytes[0];
    parts.push(Math.floor(first / 40));
    parts.push(first % 40);
    let value = 0;
    for (let i = 1; i < bytes.length; i++) {
        const byte = bytes[i];
        value = (value * 128) + (byte & 0x7f);
        if ((byte & 0x80) === 0) {
            parts.push(value);
            value = 0;
        }
    }
    if (value !== 0) {
        throw new HttpError(400, "Invalid certificate: OID is malformed.");
    }
    return parts.join(".");
}

function derEcdsaSignatureToRaw(signature: Uint8Array, coordinateLength: number): Uint8Array {
    const sequence = readDerElement(signature, 0);
    if (sequence.tag !== 0x30 || sequence.contentEnd !== signature.length) {
        throw new HttpError(400, "Invalid ECDSA signature.");
    }
    const children = readDerChildren(signature, sequence);
    if (children.length !== 2 || children[0].tag !== 0x02 || children[1].tag !== 0x02) {
        throw new HttpError(400, "Invalid ECDSA signature.");
    }
    const raw = new Uint8Array(coordinateLength * 2);
    [children[0], children[1]].forEach((element, index) => {
        let integer = signature.subarray(element.contentStart, element.contentEnd);
        while (integer.length > 0 && integer[0] === 0) {
            integer = integer.subarray(1);
        }
        if (integer.length > coordinateLength) {
            throw new HttpError(400, "Invalid ECDSA signature.");
        }
        raw.set(integer, (index * coordinateLength) + (coordinateLength - integer.length));
    });
    return raw;
}

function toDer(certificate: string | Uint8Array): Uint8Array {
    return typeof certificate === "string" ? base64Decode(certificate) : certificate;
}

function base64Decode(data: string): Uint8Array {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    let binary: string;
    try {
        binary = atob(normalized);
    } catch {
        throw new HttpError(400, "Invalid x5c certificate chain.");
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
