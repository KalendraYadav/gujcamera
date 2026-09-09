/**
 * License Plate Normalization Utility
 * Source of Truth: master_architecture.md Section 8 & 10
 * Standardizes raw OCR plate reads or user inputs to canonical uppercase alphanumeric strings.
 * Example: 'gj 01-ab 1234' -> 'GJ01AB1234'
 */
export function normalizeLicensePlate(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  // Strip whitespace, hyphens, dots, slashes, and special characters, then uppercase
  return input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Validates if the normalized string matches Indian vehicle registration pattern:
 * e.g., GJ01AB1234 or GJ01A1234 or DL1CA1234 or BH registration formats
 */
export function isValidPlateFormat(plate: string): boolean {
  if (!plate || plate.length < 4 || plate.length > 15) {
    return false;
  }
  return /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(plate);
}
