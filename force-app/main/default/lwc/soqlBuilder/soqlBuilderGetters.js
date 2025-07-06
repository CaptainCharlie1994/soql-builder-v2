export function computeUIValues(ctx) {
console.log('🧪 computeUIValues triggered');
console.log('🔍 ctx.filters:', ctx.filters);
console.log('🔍 ctx.selectedObject:', ctx.selectedObject);
console.log('🔍 ctx.fieldOptions:', JSON.stringify(ctx.fieldOptions));
  return {
    panelToggleIcon: ctx.isPanelOpen ? "utility:chevrondown" : "utility:chevronup",
    panelToggleLabel: ctx.isPanelOpen ? "Collapse Results" : "Expand Results",
    toggleButtonClass: `toggle-button-container ${ctx.isPanelOpen ? "panel-open" : "panel-closed"}`,
    rightPanelWrapperClass: `right-panel-container-wrapper ${ctx.isPanelOpen ? "visible" : "hidden"}`,
    leftPanelClass: ctx.isPanelOpen ? "left-panel narrow" : "left-panel full",
    rightPanelClass: ctx.isPanelOpen ? "right-panel slide-in" : "right-panel slide-out",
    showFieldSelector: ctx.selectedObject && ctx.fieldOptions.length > 0,
    filtersWithOperatorOptions: ctx.filters.map((f, index) => ({
      ...f,
      index,
      safeOperators: Array.isArray(f.validOperators)
        ? f.validOperators
        : [
            { label: "=", value: "=" },
            { label: "!=", value: "!=" }
          ],
      isDisabled: !f.field
    })),
    visibleResults: ctx.queryResults?.slice(0, 50) || [],
    showExportNotice: ctx.queryResults?.length > 50,
    stringifiedTableHeaders: JSON.stringify(ctx.tableColumns?.map((c) => c.fieldName), null, 2),
    childFieldConfigs: Object.keys(ctx.childFieldOptions).map((rel) => {
      const original = ctx.childFieldOptions[rel] || [];
      const filtered = ctx.filteredChildFieldOptions[rel];
      return {
        rel,
        label: `${rel} (expandable...)`,
        options: Array.isArray(filtered) ? filtered : original,
        selected: ctx.selectedChildFields[rel] || []
      };
    }),
    hasParentOptions: ctx.parentRelationshipOptions?.length > 0,
    openChildSections: ctx.selectedRelationships || [],
    shouldShowParentSection: ctx.selectedObject && (ctx.parentRelationshipOptions?.length > 0 || ctx.selectedParent),
    shouldShowChildSection: ctx.selectedObject && ctx.childFieldConfigs,
    previewText: ctx.soqlPreview ? ctx.soqlPreview : "SOQL query generated will appear here...",
  };
}