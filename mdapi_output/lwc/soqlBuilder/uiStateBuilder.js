// uiStateBuilder.js

import { createNewFilter } from "c/whereClauseManager/whereClauseManager";

export function computeUIValues(ctx) {
  return {
    panelToggleIcon: ctx.isPanelOpen
      ? "utility:chevronright"
      : "utility:chevronleft",
    panelToggleLabel: ctx.isPanelOpen ? "Collapse Results" : "Expand Results",
    toggleButtonClass: `toggle-button-container ${ctx.isPanelOpen ? "panel-open" : "panel-closed"}`,
    rightPanelWrapperClass: ctx.isPanelOpen
      ? "right-panel-container-wrapper visible"
      : "right-panel-container-wrapper hidden",
    leftPanelClass: ctx.isPanelOpen ? "left-panel narrow" : "left-panel full",
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
    stringifiedTableHeaders: JSON.stringify(
      ctx.tableColumns?.map((c) => c.fieldName),
      null,
      2
    ),
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
    childWhereClauseConfigs: Object.keys(ctx.childRelFieldOptions)
      .map((rel) => {
        if (!ctx.childRelFieldOptions[rel]) return null;

        const allOptions =
          ctx.filteredChildFieldOptions[rel] ||
          ctx.childRelFieldOptions[rel] ||
          [];

        const selected = ctx.selectedChildRelFields[rel] || [];

        const selectedOptions = allOptions.filter((opt) =>
          selected.includes(opt.value)
        );
        return {
          rel,
          label: `${rel} (expandable...)`,
          allOptions, // 👈 used for the dual-listbox
          options: selectedOptions, // 👈 used for the WHERE clause
          selected,
          filters: ctx.childFilters?.[rel] || [],
          useAdvancedMode: ctx.childAdvancedMode?.[rel] || false,
          rawWhereClause: ctx.childRawWhere?.[rel] || ""
        };
      })
      .filter(Boolean),
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
    openParentSections: ctx.selectedParentRels || [],
    previewText: ctx.soqlPreview
      ? ctx.soqlPreview
      : "SOQL query generated will appear here...",
    advancedToggleLabel: ctx.useAdvancedMode
      ? "Toggle Advanced"
      : "Toggle Manual",
    isRunQueryDisabled: !ctx.soqlPreview || ctx.soqlPreview.trim() === "",
    isExportDisabled: !ctx.queryResults || ctx.queryResults.length === 0,
    groupedWhereFieldOptions: getGroupedWhereFieldOptions(ctx),
    flatWhereFieldOptions: getFlatWhereFieldOptions(ctx),

    getChildFilters: (rel) => ctx.childFilters?.[rel] || [],
    getChildAdvancedMode: (rel) => ctx.childAdvancedMode?.[rel] || false,
    getChildRawWhere: (rel) => ctx.childRawWhere?.[rel] || ""
  };
}

export function getGroupedWhereFieldOptions(ctx) {
  const groups = [];

  const mainFields = (
    ctx.showAllWhereFields || !ctx.selectedMainFields?.length
      ? ctx.mainFieldOptions
      : ctx.selectedMainFields.map((fieldName) => {
          const match = ctx.mainFieldOptions.find((f) => f.value === fieldName);
          return match || { label: fieldName, value: fieldName };
        })
  ).map((f) => ({
    label: `${f.label || f.value} (${f.value})`,
    value: f.value
  }));

  if (mainFields.length) {
    groups.push({
      label: "Main Object Fields",
      options: mainFields
    });
  }

  const parentGroups = Object.entries(
    ctx.showAllWhereFields
      ? ctx.parentRelFieldOptions
      : ctx.selectedParentRelFields
  );

  parentGroups.forEach(([rel, fields]) => {
    const options = fields.map((f) => {
      const fieldName = ctx.showAllWhereFields ? f.value : f;
      const label = ctx.showAllWhereFields
        ? f.label
        : fieldName.split(".").pop();
      return {
        label: `${label} (${fieldName})`,
        value: fieldName
      };
    });

    if (options.length) {
      groups.push({
        label: `${rel} (Parent)`,
        options
      });
    }
  });

  return groups;
}

export function getFlatWhereFieldOptions(ctx) {
  const grouped = getGroupedWhereFieldOptions(ctx);
  return grouped.flatMap((group) =>
    group.options.map((opt) => ({
      label: `${group.label} — ${opt.label}`,
      value: opt.value
    }))
  );
}

export function resetUIState(state) {
  state.dualListBoxReady = false;

  state.mainFieldOptions = [];
  state.filteredFieldOptions = [];
  state.selectedMainFields = [];

  state.parentRelOptions = [];
  state.filteredParentRelOptions = [];
  state.selectedParentRels = [];

  state.childRelOptions = [];
  state.selectedChildRels = [];
  state.childRelFieldOptions = {};
  state.selectedChildRelFields = {};
  state.selectedParentRelFields = {};

  state.filters = [createNewFilter];
  state.useAdvancedMode = false;
  state.rawWhereClause = "";

  state.childFilters = {};
  state.childAdvancedMode = {};
  state.childRawWhere = {};

  state.soqlPreview = null;
}
