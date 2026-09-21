export interface MasamuneVectorField {
  field: string;
  dimensions: number;
  metric: "cosine" | "euclidean" | "dot-product";
  binding: string;
}

export interface MasamuneVectorIndex {
  upsert(values: { id: string; values: number[]; namespace: string }[]): Promise<{ mutationId: string }>;
  deleteByIds(ids: string[]): Promise<{ mutationId: string }>;
  query(values: number[], options: { topK: number; namespace: string; returnMetadata: "none"; returnValues: false }): Promise<{ matches: { id: string; score: number }[] }>;
}

/** ModelVectorValue と数値配列を、全Vectorize backendで同じ規則に正規化する。 */
export function normalizeVectorValue(value: unknown, spec: MasamuneVectorField): number[] {
  if (typeof value === "string") value = JSON.parse(value);
  if (value && !Array.isArray(value) && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const measure = object["@measure"] ?? object.measure;
    if (measure !== undefined && measure !== spec.metric && !(measure === "dotProduct" && spec.metric === "dot-product")) {
      throw new TypeError("距離指標が一致しません。");
    }
    value = object["@vector"] ?? object.vector;
  }
  if (!Array.isArray(value) || value.length !== spec.dimensions || value.some(n => typeof n !== "number" || !Number.isFinite(n) || !Number.isFinite(Math.fround(n)))) {
    throw new TypeError("ベクトルの次元または値が不正です。");
  }
  if (spec.metric === "cosine" && value.every(n => n === 0)) throw new TypeError("cosineのゼロベクトルは使用できません。");
  return value as number[];
}

export function resolveVectorIndex(env: Record<string, unknown>, spec: MasamuneVectorField): MasamuneVectorIndex {
  const index = env[spec.binding] as MasamuneVectorIndex;
  if (!index || typeof index.query !== "function" || typeof index.upsert !== "function" || typeof index.deleteByIds !== "function") {
    throw new TypeError("Vectorize bindingがありません。");
  }
  return index;
}

/** namespaceへ物理DB・所有主体・table・fieldをすべて含め、store間・user間の混入を防ぐ。 */
export async function vectorNamespace(parts: readonly string[]): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parts)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

export function vectorRetryAt(now: number, attempts: number): number {
  return now + Math.min(3600000, 1000 * 2 ** Math.min(attempts, 12));
}



/** ネイティブDBの宣言型からvector契約を復元する。 */
export function nativeVectorSpec(field: string, type: string, metric = "cosine"): MasamuneVectorField | undefined {
  const match = /^(?:VECTOR|F32_BLOB)\(([1-9][0-9]*)\)$/.exec(type.trim().toUpperCase());
  if (!match) return undefined;
  const dimensions = Number(match[1]);
  if (dimensions > 16383 || !["cosine", "euclidean"].includes(metric)) throw new TypeError("未対応のnative vector設定です。");
  return { field, dimensions, metric: metric as "cosine" | "euclidean", binding: "" };
}

/** 空のModelVectorValueは未取得値。nullは明示消去、空の数値配列は不正入力。 */
export function isUnloadedVector(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const vector = (value as Record<string, unknown>)["@vector"];
  return Array.isArray(vector) && vector.length === 0;
}

export function nativeNearest(request: { nearest?: unknown; limit?: number; count?: boolean; indexKey?: string; orderBy?: unknown[] }, specs: MasamuneVectorField[]): { spec: MasamuneVectorField; value: number[]; limit: number } | undefined {
  if (request.nearest === undefined) return undefined;
  const nearest = request.nearest as { key?: unknown; value?: unknown } | null;
  const spec = specs.find(s => s.field === nearest?.key);
  if (!spec || !nearest || request.count || request.indexKey || request.orderBy?.length) throw new TypeError("nearestの対象または組合せが不正です。");
  const limit = request.limit ?? 10;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError("nearest limitは1〜100です。");
  return { spec, value: normalizeVectorValue(nearest.value, spec), limit };
}
