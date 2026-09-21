import { normalizeVectorValue, vectorNamespace, vectorRetryAt, nativeVectorSpec, nativeNearest, isUnloadedVector } from "../src/lib/src/vector_sync";

const spec = { field: "embedding", dimensions: 32, metric: "cosine" as const, binding: "VECTORS" };
const vector = [1, ...Array(31).fill(0)];

test("ModelVectorValueと数値配列を同じ規則で正規化する", () => {
  expect(normalizeVectorValue(vector, spec)).toEqual(vector);
  expect(normalizeVectorValue({ "@vector": vector, "@measure": "cosine" }, spec)).toEqual(vector);
  expect(() => normalizeVectorValue([1, 2], spec)).toThrow();
  expect(() => normalizeVectorValue(Array(32).fill(0), spec)).toThrow();
});

test("namespace境界と指数backoffを決定的に生成する", async () => {
  expect(await vectorNamespace(["prod", "db", "alice", "items", "embedding"]))
      .not.toBe(await vectorNamespace(["prod", "db", "bob", "items", "embedding"]));
  expect(vectorRetryAt(1000, 0)).toBe(2000);
  expect(vectorRetryAt(1000, 99)).toBe(3601000);
});


test("native契約はVectorizeの次元制限と独立し、未対応metric・組合せを拒否する", () => {
  const native = nativeVectorSpec("embedding","VECTOR(3)")!;
  expect(native.dimensions).toBe(3);
  expect(nativeVectorSpec("embedding","F32_BLOB(3)","euclidean")?.metric).toBe("euclidean");
  expect(()=>nativeVectorSpec("embedding","VECTOR(16384)")).toThrow();
  expect(()=>nativeVectorSpec("embedding","VECTOR(3)","dot-product")).toThrow();
  expect(isUnloadedVector({"@vector":[]})).toBe(true);
  expect(isUnloadedVector([])).toBe(false);
  expect(isUnloadedVector(null)).toBe(false);
  expect(nativeNearest({nearest:{key:"embedding",value:[1,0,0]}},[native])?.limit).toBe(10);
  for(const extra of [{limit:101},{limit:0},{count:true},{indexKey:"a"},{orderBy:[{key:"a"}]}]) {
    expect(()=>nativeNearest({nearest:{key:"embedding",value:[1,0,0]},...extra},[native])).toThrow();
  }
});
