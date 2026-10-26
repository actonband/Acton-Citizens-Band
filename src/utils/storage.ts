// Resolve storage inside the try: even accessing the property can throw.
type StorageSource = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function readStorage(source: StorageSource, key: string): string | null {
  try {
    return source().getItem(key);
  } catch {
    return null;
  }
}
export function writeStorage(source: StorageSource, key: string, value: string): void {
  try {
    source().setItem(key, value);
  } catch {
    /* Persistence is optional. */
  }
}
export function removeStorage(source: StorageSource, key: string): void {
  try {
    source().removeItem(key);
  } catch {
    /* Persistence is optional. */
  }
}
