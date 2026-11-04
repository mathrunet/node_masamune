## 3.1.0 (2026-11-04)

- Add initial Firebase Storage support for Cloudflare Workers: `FirebaseStorageClient` (head, get, put with `ifGenerationMatch`, delete, list, deletePrefix, downloadUrl), `createFirebaseStorageClient`, the `R2Bucket` compatible `createR2CompatibleBucket` and `Functions.storageFirebase`.
