import whereClauseBuilder from "c/whereClauseBuilder";

export default class queryFormatter {
  static buildSubqueries(childFieldMap) {
  return Object.entries(childFieldMap).map(([relationshipName, fields]) => {
    const fieldList = fields.join(", ");
    return `(SELECT ${fieldList} FROM ${relationshipName})`;
  });
}

  static generatePreview({
    selectedObject,
    selectedFields = [],
    selectedParentFields = [],
    filters = [],
    selectedChildFields = {},
    rawWhereClause = "",
    useAdvancedMode = false,
    fieldMetadata = {}
  }) {
    if (!selectedObject || selectedFields.length === 0) {

      return null;
    }

    //── Combine base fields, parent fields, and filter fields ─────────────
    const baseFields = new Set([
      ...(selectedFields || []),
      ...(selectedParentFields || []),
      ...filters.map((f) => f.field).filter(Boolean)
    ]);

    const fieldList = Array.from(baseFields).join(", ");

    //── Build subqueries for child relationships ──────────────────────────
    const validChildFields = Object.entries(selectedChildFields).filter(
      ([rel, fields]) => Array.isArray(fields) && fields.length > 0
    );

    const subqueries = queryFormatter.buildSubqueries(
      Object.fromEntries(validChildFields)
    );

    //── Build WHERE clause ────────────────────────────────────────────────
    const whereClause = whereClauseBuilder.buildWhereClause(
      filters,
      useAdvancedMode,
      rawWhereClause,
      fieldMetadata
    );

    //── Assemble full query ───────────────────────────────────────────────
    const selectClause = [fieldList, ...subqueries].filter(Boolean).join(", ");
    const query = `SELECT ${selectClause} FROM ${selectedObject}${whereClause}`;

    return query;
  }
}
