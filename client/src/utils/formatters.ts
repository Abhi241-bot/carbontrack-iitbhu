/** Format a number as a locale string with comma separators. */
export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format a carbon value in tCO₂e, auto-switching kg ↔ t. */
export function formatCarbon(kgCO2e: number): string {
  if (kgCO2e >= 1000) {
    return `${(kgCO2e / 1000).toFixed(2)} tCO₂e`;
  }
  return `${kgCO2e.toFixed(1)} kgCO₂e`;
}

/** Format area in sqm with comma separators. */
export function formatArea(sqm: number): string {
  return `${formatNumber(sqm)} sqm`;
}

/** Capitalise first letter of a string. */
export function capitalise(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Convert a snake_case / underscore string to Title Case. */
export function labelFromKey(key: string): string {
  return key
    .split('_')
    .map((word) => capitalise(word))
    .join(' ');
}
