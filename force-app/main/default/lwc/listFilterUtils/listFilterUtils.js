// listFilterUtils.js
/**
 * Returns only those picklist/dual‐list options whose label or value
 * contains the searchTerm (case-insensitive).
 *
 * @param {Array<{label:string,value:string}>} options
 * @param {string} searchTerm
 * @return {Array} filtered options
 */

export function filterOptions(options = [], searchTerm = '', selectedValues = []) {
  const term = (searchTerm || '').trim().toLowerCase();
  const filtered = term
    ? options.filter(
        (opt) =>
          opt.label?.toLowerCase().includes(term) ||
          opt.value?.toLowerCase().includes(term)
      )
    : options;
  console.log("Options :", JSON.stringify(options));
  console.log("Search Term :", JSON.stringify(searchTerm));
  console.log("SelectedValues: ", selectedValues);
 
  const selectedSet = new Set(selectedValues);
  console.log("SelectedSet: ", JSON.stringify(selectedSet));
  const preserved = options.filter((opt) => selectedSet.has(opt.value));
  console.log("Preserved: ", JSON.stringify(preserved));
  const merged = [...new Map([...preserved, ...filtered].map((o) => [o.value, o])).values()];
  console.log("Merged: ", JSON.stringify(merged));
  return merged;
}