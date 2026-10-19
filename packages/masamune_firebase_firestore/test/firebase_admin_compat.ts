/**
 * Test-only compatibility shim.
 *
 * firebase-functions-test@3.5.0 still calls the legacy `firebase-admin` namespace
 * (`firestore(app)`) from `makeDocumentSnapshot`, which firebase-admin v14 removed.
 * Provide it on top of the modular API so the helper keeps working in tests.
 *
 * テスト専用の互換シム。firebase-functions-test@3.5.0の`makeDocumentSnapshot`は
 * firebase-admin v14で削除された名前空間API（`firestore(app)`）を使うため、
 * モジュール形式のAPIで補う。
 */
jest.mock("firebase-admin", () => {
    const actual = jest.requireActual("firebase-admin");
    const firestoreModule = jest.requireActual("firebase-admin/firestore");
    const firestore = Object.assign(
        (app?: unknown) => firestoreModule.getFirestore(app),
        firestoreModule,
    );
    return { ...actual, firestore };
});
