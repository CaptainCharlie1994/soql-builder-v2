// fieldOptionBuilder.js

/**
 * Builds a sorted list of field options for dual listboxes.
 * Optionally prefixes values with a relationship name.
 *
 * @param {Array} fields - Array of field metadata objects
 * @param {string} [relPrefix] - Optional relationship prefix (e.g., 'Owner')
 * @returns {Array<{label: string, value: string}>}
 */
export function buildFieldOptions(fields, relPrefix = '') {
  return fields
    .map((f) => ({
      label: `${f.label || f.name} (${f.name})`,
      value: relPrefix ? `${relPrefix}.${f.name}` : f.name
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}