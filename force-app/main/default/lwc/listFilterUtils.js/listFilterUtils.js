// listFilterUtils.js
/**
 * Returns only those picklist/dual‐list options whose label or value
 * contains the searchTerm (case-insensitive).
 *
 * @param {Array<{label:string,value:string}>} options
 * @param {string} searchTerm
 * @return {Array} filtered options
 */
export function filterOptions(options = [], searchTerm = '') {
  const term = (searchTerm || '').trim().toLowerCase();
  if (!term) {
    return options;
  }
  return options.filter(
    (opt) =>
      opt.label?.toLowerCase().includes(term) ||
      opt.value?.toLowerCase().includes(term)
  );
}