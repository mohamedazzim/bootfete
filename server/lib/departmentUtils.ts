/**
 * Department Utilities
 * 
 * Provides normalization and validation utilities for department handling
 * to prevent bypass via case variations or whitespace manipulation.
 */

/**
 * Normalizes department string for consistent storage and comparison
 * 
 * Transformations:
 * - Trims leading/trailing whitespace
 * - Converts to uppercase for case-insensitive comparison
 * - Collapses multiple spaces to single space
 * - Removes spaces inside parentheses
 * 
 * Examples:
 * - "  cse (iii)  " → "CSE (III)"
 * - "CSE  (  III  )" → "CSE (III)"
 * - "cse(iii)" → "CSE (III)" (adds space before paren)
 * 
 * @param dept - Raw department string from user input
 * @returns Normalized department string
 */
export function normalizeDepartment(dept: string): string {
  return dept
    .trim()                         // Remove leading/trailing whitespace
    .toUpperCase()                  // Case-insensitive: CSE = cse = Cse
    .replace(/\s+/g, ' ')          // Collapse multiple spaces: "CSE  (III)" → "CSE (III)"
    .replace(/\s*\(\s*/g, ' (')    // Normalize before opening paren: "CSE  (  III" → "CSE (III"
    .replace(/\s*\)\s*/g, ')')     // Normalize before closing paren: "CSE (III  )" → "CSE (III)"
    .replace(/\s+$/, '');          // Final trim
}

/**
 * Validates department format
 * Expected format: "DEPARTMENT (YEAR)" e.g., "CSE (III)"
 * 
 * @param dept - Department string to validate
 * @returns True if valid format, false otherwise
 */
export function validateDepartmentFormat(dept: string): boolean {
  const normalized = normalizeDepartment(dept);
  
  // Pattern: UPPERCASE_TEXT (ROMAN_NUMERAL or NUMBER)
  // Examples: "CSE (III)", "ECE (IV)", "MECH (II)"
  const pattern = /^[A-Z\s&]+\s\([IVX]+\)$/;
  
  return pattern.test(normalized);
}

/**
 * Extracts department and year from combined string
 * 
 * @param dept - Department string in format "DEPT (YEAR)"
 * @returns Object with department and year, or null if invalid
 */
export function parseDepartment(dept: string): { department: string; year: string } | null {
  const normalized = normalizeDepartment(dept);
  const match = normalized.match(/^(.+)\s\((.+)\)$/);
  
  if (!match) return null;
  
  return {
    department: match[1].trim(),
    year: match[2].trim(),
  };
}
