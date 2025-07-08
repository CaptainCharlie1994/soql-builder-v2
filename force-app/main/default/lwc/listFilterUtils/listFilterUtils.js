// listFilterUtils.js
/**
 * Returns only those picklist/dual‐list options whose label or value
 * contains the searchTerm (case-insensitive).
 *
 * @param {Array<{label:string,value:string}>} options
 * @param {string} searchTerm
 * @return {Array} filtered options
 */

export function filterOptions(
  options = [],
  searchTerm = "",
  selectedValues = []
) {
  const term = (searchTerm || "").trim().toLowerCase();
  const filtered = term
    ? options.filter(
        (opt) =>
          opt.label?.toLowerCase().includes(term) ||
          opt.value?.toLowerCase().includes(term)
      )
    : options;

  const selectedSet = new Set(selectedValues);

  const preserved = options.filter((opt) => selectedSet.has(opt.value));

  const merged = [
    ...new Map([...preserved, ...filtered].map((o) => [o.value, o])).values()
  ];

  return merged;
}
