export function computeUIValues(ctx) {

  return {
    panelToggleIcon: ctx.isPanelOpen ? "utility:chevrondown" : "utility:chevronup",
    panelToggleLabel: ctx.isPanelOpen ? "Collapse Results" : "Expand Results",
    toggleButtonClass: `toggle-button-container ${ctx.isPanelOpen ? "panel-open" : "panel-closed"}`,
    rightPanelWrapperClass: `right-panel-container-wrapper ${ctx.isPanelOpen ? "visible" : "hidden"}`,
    leftPanelClass: ctx.isPanelOpen ? "left-panel narrow" : "left-panel full",
    rightPanelClass: ctx.isPanelOpen ? "right-panel slide-in" : "right-panel slide-out",
    showFieldSelector: ctx.selectedObject && ctx.mainFieldOptions.length > 0,
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
    childFieldConfigs: Object.keys(ctx.childRelFieldOptions).map((rel) => {
      const original = ctx.childRelFieldOptions[rel] || [];
      const filtered = ctx.filteredChildFieldOptions[rel];
      return {
        rel,
        label: `${rel} (expandable...)`,
        options: Array.isArray(filtered) ? filtered : original,
        selected: ctx.selectedChildRelFields[rel] || []
      };
    }),
    parentFieldConfigs: Object.keys(ctx.parentRelFieldOptions).map((rel) => {
      const original = ctx.parentRelFieldOptions[rel] || [];
      const filtered = ctx.filteredParentRelFieldOptions[rel];
      return {
              rel,
              label: `${rel} (expandable...)`,
              options: Array.isArray(filtered) ? filtered : original,
              selected: ctx.selectedParentRelFields[rel] || []
      };
    }),
    openChildSections: ctx.selectedChildRels || [],
    previewText: ctx.soqlPreview ? ctx.soqlPreview : "SOQL query generated will appear here...",
  };
}