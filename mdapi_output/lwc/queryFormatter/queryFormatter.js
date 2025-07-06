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
    selectedMainFields = [],
    selectedParentRelFields = [],
    filters = [],
    selectedChildRelFields = {},
    rawWhereClause = "",
    useAdvancedMode = false,
    mainFieldMetadata = {}
  }) {
    if (!selectedObject || selectedMainFields.length === 0) {

      return null;
    }

    //── Combine base fields, parent fields, and filter fields ─────────────
    const baseFields = new Set([
      ...(selectedMainFields || []),
      ...(selectedParentRelFields || []),
      ...filters.map((f) => f.field).filter(Boolean)
    ]);

    const fieldList = Array.from(baseFields).join(", ");

    //── Build subqueries for child relationships ──────────────────────────
    const validChildFields = Object.entries(selectedChildRelFields).filter(
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
      mainFieldMetadata
    );

    //── Assemble full query ───────────────────────────────────────────────
    const selectClause = [fieldList, ...subqueries].filter(Boolean).join(", ");
    const query = `SELECT ${selectClause} FROM ${selectedObject}${whereClause}`;

    return query;
  }
}
