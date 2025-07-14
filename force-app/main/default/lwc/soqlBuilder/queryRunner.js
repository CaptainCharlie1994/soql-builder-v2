// queryRunner.js

import resultFlattener from "c/resultFlattener";
import getSoqlPreview from "@salesforce/apex/SoqlBuilderHelper.getSoqlPreview";
import runQuery from "@salesforce/apex/SoqlBuilderHelper.runQuery";
import emailCsv from "@salesforce/apex/exportController.emailCsv";

export async function buildPreview(state) {
  try {
    // 1) build & deep-clone your payload one time
    const raw = buildQueryPayload(state);
    const payload = safeJsonClone(raw);

    // 2) log it so you can inspect
    console.log("🧪 Before Apex:", JSON.stringify(payload, null, 2));

    // 3) PASS THAT SAME payload — don’t rebuild() on it
    const soql = await getSoqlPreview(payload);
    return soql;
  } catch (error) {
    console.error("❌ Failed to build SOQL preview:", error);
    return "Error building query";
  }
}

export async function buildAndRunQuery(state) {
  // build + sanitize
  const raw = buildQueryPayload(state);
  const payload = safeJsonClone(raw);
  console.log("📦 Final payload to Apex:", JSON.stringify(payload, null, 2));

  // use it for preview and execution
  const soql = await getSoqlPreview(payload);
  const rawResult = await runQuery({ soql });

  const fieldOrder = computeFieldOrder(state);
  const { rows, headers, childOverflowDetected } =
    resultFlattener.flattenResults(
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

function safeJsonClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    console.warn("❌ Failed to clone for Apex:", e);
    return Array.isArray(value) ? [] : {};
  }
}

function buildQueryPayload(state) {
  const flattenedParentFields = safeJsonClone(
    Object.values(state.selectedParentRelFields || {})
      .flat()
      .filter(Boolean)
  );

  return {
    objectApiName: state.selectedObject,
    selectedMainFields: safeJsonClone(state.selectedMainFields),
    selectedParentRelFields: flattenedParentFields,
    selectedChildRelFields: cleanChildFields(
      safeJsonClone(state.selectedChildRelFields)
    ),
    filtersJson: JSON.stringify(
      state.filters.map((f) => ({
        field: f.field,
        operator: f.operator,
        value: f.value,
        connector: f.connector
      }))
    ),
    useAdvancedMode: state.useAdvancedMode,
    rawWhereClause: state.rawWhereClause,
    orderByField: state.orderByField,
    orderDirection: state.orderDirection,
    queryLimit: state.limit,
    childFiltersJson: JSON.stringify(state.childFilters || {}),
    childAdvancedJson: JSON.stringify(state.childAdvancedMode || {}),
    childRawWhereJson: JSON.stringify(state.childRawWhere || {})
  };
}

function computeFieldOrder(state) {
  return [
    ...state.selectedMainFields,
    ...Object.values(state.selectedParentRelFields || {}).flat(),
    ...Object.entries(state.selectedChildRelFields || {}).flatMap(
      ([rel, fields]) =>
        Array.from({ length: 5 }, (_, i) =>
          fields.map((f) => `${rel}_${i + 1}_${f}`)
        ).flat()
    )
  ];
}

function cleanChildFields(obj) {
  if (!obj || typeof obj !== "object") {
    console.warn("🛑 Invalid childRelFields, skipping preview.");
    return {};
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    cleaned[key] = Array.isArray(value)
      ? value.filter((v) => typeof v === "string")
      : [];
  }

  return cleaned;
}
