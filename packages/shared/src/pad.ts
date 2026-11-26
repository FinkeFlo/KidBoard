/**
 * Zero-padded digits of `value` (its absolute value), at least `length` wide: the one
 * padding helper of the date and time formatters. Internal to the package (not
 * re-exported from the index).
 */
export function pad(value: number, length = 2): string {
  return String(Math.abs(value)).padStart(length, "0");
}
