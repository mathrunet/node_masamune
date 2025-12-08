import { uuid } from "../src/lib/utils";

describe("UUID v7 Tests", () => {
  test("Generate UUID v7 without options", () => {
    const id = uuid();
    expect(id).toHaveLength(32); // ハイフンなしで32文字
    expect(id).toMatch(/^[0-9a-f]{32}$/); // 16進数の文字列
  });

  test("Generate UUID v7 with baseTime", () => {
    const baseTime = new Date("2024-01-01T00:00:00Z");
    const id = uuid({ baseTime });
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  test("Generate UUID v7 with reverse option", () => {
    const baseTime = new Date("2024-01-01T00:00:00Z");
    const id = uuid({ baseTime, reverse: true });
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  test("UUIDs should be sortable in chronological order", () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const baseTime = new Date(2024, 0, 1, 0, 0, i);
      const id = uuid({ baseTime });
      console.log(id);
      ids.push(id);
    }
    
    const sortedIds = [...ids].sort();
    expect(sortedIds).toEqual(ids);
  });

  test("Reversed UUIDs should maintain reverse chronological order", () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const baseTime = new Date(2024, 0, 1, 0, 0, i);
      const id = uuid({ baseTime, reverse: true });
      console.log(id);
      ids.push(id);
    }
    
    const sortedIds = [...ids].sort().reverse();
    expect(sortedIds).toEqual(ids);
  });
});
