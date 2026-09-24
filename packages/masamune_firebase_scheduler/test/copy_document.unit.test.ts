import { copyDocument } from "../src/schedulers/copy_document";

test("copyDocument preserves public fields and omits scheduler metadata", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = jest.fn().mockReturnValue({ save });
    const request = {
        params: { path: "output/doc-123" },
        doc: {
            data: () => ({
                name: "Asset",
                count: 3,
                _done: true,
                command: "copy_document",
                "#command": "internal",
                "@uid": "old-id",
            }),
        },
        firestoreInstance: { doc },
    };

    await expect(copyDocument(request as any)).resolves.toEqual({});
    expect(doc).toHaveBeenCalledWith("output/doc-123");
    expect(save).toHaveBeenCalledWith({ name: "Asset", count: 3, "@uid": "doc-123" }, { merge: true });
});
