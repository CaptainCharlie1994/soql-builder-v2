// relationshipHandlers.js

import getFieldsForObject from "@salesforce/apex/SoqlBuilderHelper.getFieldsForObject";
import parentFieldManager from "c/parentFieldManager";
import { createNewFilter } from "c/whereClauseManager";

/**
 * Handles parent relationship selection changes.
 */
export async function handleParentRelSelectionHelper({
  newSelection,
  previousSelection,
  parentRelOptions,
  selectedParentRelFields,
  setState
}) {
  const removed = previousSelection.filter(
    (rel) => !newSelection.includes(rel)
  );
  const updatedParentRelFields = { ...selectedParentRelFields };

  removed.forEach((rel) => {
    delete updatedParentRelFields[rel];
  });

  setState((state) => {
    removed.forEach((rel) => {
      delete state.parentRelFieldOptions[rel];
      delete state.filteredParentRelFieldOptions[rel];
    });
  });

  const fetchPromises = newSelection.map(async (rel) => {
    const parentObj = parentFieldManager.resolveParentObject(
      parentRelOptions,
      rel
    );
    if (!parentObj) {
      console.warn(`⚠️ Could not resolve parent object for: ${rel}`);
      return;
    }

    try {
      const fields = await getFieldsForObject({ objectApiName: parentObj });
      const options = fields.map((f) => ({
        label: `${f.label || f.name} (${f.name})`,
        value: `${rel}.${f.name}`
      }));

      updatedParentRelFields[rel] = updatedParentRelFields[rel] || [
        `${rel}.Id`
      ];

      setState((state) => {
        state.parentRelFieldOptions[rel] = options;
        state.filteredParentRelFieldOptions[rel] = options;
      });
    } catch (error) {
      console.error(`Error fetching parent fields for ${rel}`, error);
    }
  });

  await Promise.all(fetchPromises);

  setState((state) => {
    state.selectedParentRels = newSelection;
    state.selectedParentRelFields = updatedParentRelFields;
  });
}

/**
 * Handles child relationship selection changes.
 */
export async function handleChildRelSelection({
  newSelection,
  previousSelection,
  relationshipToSObjectMap,
  childRelFieldOptions,
  selectedChildRelFields,
  setState
}) {
  const removed = previousSelection.filter(
    (rel) => !newSelection.includes(rel)
  );
  const updatedChildRelFields = { ...selectedChildRelFields };

  removed.forEach((rel) => {
    delete updatedChildRelFields[rel];
  });

  setState((state) => {
    removed.forEach((rel) => {
      delete state.childRelFieldOptions[rel];
      delete state.filteredChildFieldOptions[rel];
    });
  });

  const fetchPromises = newSelection.map(async (rel) => {
    if (!childRelFieldOptions[rel]) {
      const sObjectName = relationshipToSObjectMap?.[rel] || rel;
      console.log(`🔍 Resolving child relationship: ${rel}`);
      console.log(`🧭 Mapped to sObject: ${sObjectName}`);
      console.log(`Fetching child fields for ${rel}`, sObjectName);

      try {
        const fields = await getFieldsForObject({ objectApiName: sObjectName });
        const options = fields.map((f) => ({
          label: `${f.label || f.name} (${f.name})`,
          value: f.name
        }));

        updatedChildRelFields[rel] = updatedChildRelFields[rel] || ["Id"];

        setState((state) => {
          state.childRelFieldOptions[rel] = options;
          state.filteredChildFieldOptions[rel] = options;

          // ✅ Ensure WHERE clause state is initialized here
          if (!state.childFilters[rel]) {
            state.childFilters[rel] = [createNewFilter()];
          }
          if (!(rel in state.childAdvancedMode)) {
            state.childAdvancedMode[rel] = false;
          }
          if (!(rel in state.childRawWhere)) {
            state.childRawWhere[rel] = "";
          }
        });
      } catch (error) {
        const message =
          error?.body?.message || error?.message || JSON.stringify(error);
        console.error(`❌ Error fetching fields for ${rel}: ${message}`);
      }
    }
  });

  await Promise.all(fetchPromises);

  setState((state) => {
    state.selectedChildRels = newSelection;
    state.selectedChildRelFields = updatedChildRelFields;
  });

  function ensureChildWhereClauseState(state, rel) {
    if (!state.childFilters[rel]) {
      state.childFilters[rel] = [createNewFilter()];
    }
    if (!(rel in state.childAdvancedMode)) {
      state.childAdvancedMode[rel] = false;
    }
    if (!(rel in state.childRawWhere)) {
      state.childRawWhere[rel] = "";
    }
  }
}
