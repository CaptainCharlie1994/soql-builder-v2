// queryRunner.js

import resultFlattener from "c/resultFlattener";
import getSoqlPreview from '@salesforce/apex/SoqlBuilderHelper.getSoqlPreview';
import runQuery from '@salesforce/apex/SoqlBuilderHelper.runQuery';
import emailCsv from '@salesforce/apex/exportController.emailCsv';

export async function buildPreview(state) {
  try {
    const soql = await getSoqlPreview(buildQueryPayload(state));
    return soql;
  } catch (error) {
    console.error('❌ Failed to build SOQL preview:', error);
    return 'Error building query';
  }
}

export async function buildAndRunQuery(state) {
  const soql = await getSoqlPreview(buildQueryPayload(state));
  const rawResult = await runQuery({ soql });

  const fieldOrder = computeFieldOrder(state);
  const { rows, headers, childOverflowDetected } = resultFlattener.flattenResults(
    rawResult,
    state.selectedParentRelFields,
    state.selectedChildRelFields,
    fieldOrder
  );

  return {
    soql,
    rawResult,
    rows,
    headers,
    childOverflowDetected
  };
}

export async function exportQueryResults(state, rawResult, userEmail) {
  const fieldOrder = computeFieldOrder(state);
  const { rows, headers } = resultFlattener.flattenResults(
    rawResult,
    state.selectedParentRelFields,
    state.selectedChildRelFields,
    fieldOrder
  );

  const result = await emailCsv({
    objectName: state.selectedObject,
    data: JSON.parse(JSON.stringify(rows)),
    headers: JSON.parse(JSON.stringify(headers)),
    recipientEmail: userEmail
  });

  return result;
}

function buildQueryPayload(state) {
  const flattenedParentFields = Object.values(state.selectedParentRelFields || {})
    .flat()
    .filter(Boolean);

  return {
    objectApiName: state.selectedObject,
    selectedMainFields: state.selectedMainFields,
    selectedParentRelFields: flattenedParentFields,
    filtersJson: JSON.stringify(
      state.filters.map((f) => ({
        field: f.field,
        operator: f.operator,
        value: f.value
      }))
    ),
    selectedChildRelFields: state.selectedChildRelFields,
    useAdvancedMode: state.useAdvancedMode,
    rawWhereClause: state.rawWhereClause,
    orderByField: state.orderByField,
    orderDirection: state.orderDirection,
    queryLimit: state.limit
  };
}

function computeFieldOrder(state) {
  return [
    ...state.selectedMainFields,
    ...Object.values(state.selectedParentRelFields || {}).flat(),
    ...Object.entries(state.selectedChildRelFields || {}).flatMap(([rel, fields]) =>
      Array.from({ length: 5 }, (_, i) =>
        fields.map((f) => `${rel}_${i + 1}_${f}`)
      ).flat()
    )
  ];
}