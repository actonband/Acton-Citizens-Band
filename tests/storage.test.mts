import test from "node:test";
import assert from "node:assert/strict";
import { readStorage, writeStorage, removeStorage } from "../src/utils/storage.ts";

test("storage works when available", () => {
  const values = new Map<string, string>();
  const source = () => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  });
  writeStorage(source, "key", "false");
  assert.equal(readStorage(source, "key"), "false");
  removeStorage(source, "key");
  assert.equal(readStorage(source, "key"), null);
});

for (const failure of ["property access", "storage operation"]) {
  test("blocked " + failure + " does not interrupt the app", () => {
    const fail = () => {
      throw new Error("Storage blocked");
    };
    const source =
      failure === "property access"
        ? fail
        : () => ({ getItem: fail, setItem: fail, removeItem: fail });
    assert.equal(readStorage(source, "key"), null);
    assert.doesNotThrow(() => writeStorage(source, "key", "value"));
    assert.doesNotThrow(() => removeStorage(source, "key"));
  });
}
