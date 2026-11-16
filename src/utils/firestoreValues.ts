import { Bytes, DocumentReference, GeoPoint, Timestamp, refEqual } from "firebase/firestore";

// Compare document values, not serialization order or Firestore SDK internals.
export function firestoreValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Timestamp || right instanceof Timestamp)
    return left instanceof Timestamp && right instanceof Timestamp && left.isEqual(right);
  if (left instanceof DocumentReference || right instanceof DocumentReference)
    return (
      left instanceof DocumentReference &&
      right instanceof DocumentReference &&
      refEqual(left, right)
    );
  if (left instanceof GeoPoint || right instanceof GeoPoint)
    return left instanceof GeoPoint && right instanceof GeoPoint && left.isEqual(right);
  if (left instanceof Bytes || right instanceof Bytes)
    return left instanceof Bytes && right instanceof Bytes && left.isEqual(right);
  if (left instanceof Date || right instanceof Date)
    return (
      left instanceof Date && right instanceof Date && Object.is(left.getTime(), right.getTime())
    );
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => firestoreValuesEqual(value, right[index]))
    );
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(
      (key) => Object.prototype.hasOwnProperty.call(b, key) && firestoreValuesEqual(a[key], b[key]),
    )
  );
}
