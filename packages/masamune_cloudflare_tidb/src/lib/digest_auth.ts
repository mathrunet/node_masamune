export interface DigestCredentials {
  username: string;
  password: string;
}

interface DigestChallenge {
  realm: string;
  nonce: string;
  opaque?: string | undefined;
  algorithm: "MD5" | "MD5-sess" | "SHA-256" | "SHA-256-sess";
  qop?: string | undefined;
}

interface CachedChallenge {
  challenge: DigestChallenge;
  nonceCount: number;
}

const challengeCache = new Map<string, CachedChallenge>();

export async function fetchWithDigest(
  url: string,
  init: RequestInit,
  credentials: DigestCredentials,
): Promise<Response> {
  const cacheKey = `${new URL(url).origin}\u0000${credentials.username}`;
  const cached = challengeCache.get(cacheKey);
  if (cached) {
    const response = await authenticatedFetch(
      url,
      init,
      credentials,
      cached,
    );
    if (response.status !== 401) {
      return response;
    }
    const replacement = parseChallenge(
      response.headers.get("WWW-Authenticate"),
    );
    if (!replacement) {
      return response;
    }
    cached.challenge = replacement;
    cached.nonceCount = 0;
    return authenticatedFetch(url, init, credentials, cached);
  }

  const response = await fetch(url, init);
  if (response.status !== 401) {
    return response;
  }
  const challenge = parseChallenge(response.headers.get("WWW-Authenticate"));
  if (!challenge) {
    return response;
  }
  const state: CachedChallenge = { challenge, nonceCount: 0 };
  challengeCache.set(cacheKey, state);
  return authenticatedFetch(url, init, credentials, state);
}

async function authenticatedFetch(
  url: string,
  init: RequestInit,
  credentials: DigestCredentials,
  state: CachedChallenge,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const parsedUrl = new URL(url);
  const uri = `${parsedUrl.pathname}${parsedUrl.search}`;
  const cnonce = createCnonce();
  const nc = (++state.nonceCount).toString(16).padStart(8, "0");
  const challenge = state.challenge;
  const qop = selectQop(challenge.qop);
  const hashName = challenge.algorithm.startsWith("SHA-256")
    ? "SHA-256"
    : "MD5";
  let ha1 = await digest(
    hashName,
    `${credentials.username}:${challenge.realm}:${credentials.password}`,
  );
  if (challenge.algorithm.endsWith("-sess")) {
    ha1 = await digest(hashName, `${ha1}:${challenge.nonce}:${cnonce}`);
  }
  const ha2 = await digest(hashName, `${method}:${uri}`);
  const responseHash = qop
    ? await digest(
      hashName,
      `${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`,
    )
    : await digest(hashName, `${ha1}:${challenge.nonce}:${ha2}`);
  const authorization = [
    `Digest username="${escapeQuoted(credentials.username)}"`,
    `realm="${escapeQuoted(challenge.realm)}"`,
    `nonce="${escapeQuoted(challenge.nonce)}"`,
    `uri="${escapeQuoted(uri)}"`,
    `response="${responseHash}"`,
    `algorithm=${challenge.algorithm}`,
    challenge.opaque
      ? `opaque="${escapeQuoted(challenge.opaque)}"`
      : undefined,
    qop ? `qop=${qop}` : undefined,
    qop ? `nc=${nc}` : undefined,
    qop ? `cnonce="${cnonce}"` : undefined,
  ].filter((value): value is string => value !== undefined).join(", ");
  const headers = new Headers(init.headers);
  headers.set("Authorization", authorization);
  return fetch(url, { ...init, headers });
}

function parseChallenge(value: string | null): DigestChallenge | undefined {
  if (!value || !/^Digest\s/i.test(value)) {
    return undefined;
  }
  const parameters: Record<string, string> = {};
  const expression = /([a-zA-Z0-9_-]+)\s*=\s*(?:"((?:\\.|[^"])*)"|([^,\s]+))/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(value.slice(7))) !== null) {
    parameters[match[1].toLowerCase()] =
      (match[2] ?? match[3] ?? "").replace(/\\(["\\])/g, "$1");
  }
  if (!parameters.realm || !parameters.nonce) {
    return undefined;
  }
  const rawAlgorithm = (parameters.algorithm ?? "MD5").toUpperCase();
  const algorithm = (
    rawAlgorithm === "SHA-256" ||
      rawAlgorithm === "SHA-256-SESS" ||
      rawAlgorithm === "MD5-SESS"
      ? rawAlgorithm.replace("-SESS", "-sess")
      : "MD5"
  ) as DigestChallenge["algorithm"];
  return {
    realm: parameters.realm,
    nonce: parameters.nonce,
    opaque: parameters.opaque,
    algorithm,
    qop: parameters.qop,
  };
}

function selectQop(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const values = value.split(",").map((item) => item.trim().toLowerCase());
  return values.includes("auth") ? "auth" : undefined;
}

async function digest(
  algorithm: "MD5" | "SHA-256",
  value: string,
): Promise<string> {
  if (algorithm === "MD5") {
    return md5(new TextEncoder().encode(value));
  }
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(result));
}

function createCnonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// RFC 1321 implementation kept local because Workers WebCrypto does not expose MD5.
function md5(input: Uint8Array): string {
  const length = input.length;
  const paddedLength = (((length + 8) >>> 6) + 1) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[length] = 0x80;
  const bitLength = length * 8;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from(
    { length: 64 },
    (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
  );
  for (let offset = 0; offset < paddedLength; offset += 64) {
    const words = Array.from(
      { length: 16 },
      (_, index) => view.getUint32(offset + index * 4, true),
    );
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index++) {
      let f: number;
      let g: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const nextD = d;
      d = c;
      c = b;
      const sum = (a + f + constants[index] + words[g]) >>> 0;
      b = (b + ((sum << shifts[index]) | (sum >>> (32 - shifts[index])))) >>> 0;
      a = nextD;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const output = new Uint8Array(16);
  const outputView = new DataView(output.buffer);
  outputView.setUint32(0, a0, true);
  outputView.setUint32(4, b0, true);
  outputView.setUint32(8, c0, true);
  outputView.setUint32(12, d0, true);
  return bytesToHex(output);
}
