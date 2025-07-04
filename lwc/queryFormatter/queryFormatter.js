import whereClauseBuilder from 'c/whereClauseBuilder';

export default class queryFormatter {
  static buildSubqueries(selectedChildFields = {}) {
    return Object.entries(selectedChildFields)
      .map(([rel, fields]) => {
        if (!fields || fields?.length === 0) return null;
        return `(SELECT ${fields.join(', ')} FROM ${rel})`;
      })
      .filter(Boolean);
  }

  static generatePreview({
    selectedObject,
    selectedFields = [],
    selectedParentFields = [],
    filters = [],
    selectedChildFields = {},
    rawWhereClause = '',
    useAdvancedMode = false
  }) {
    if (!selectedObject || selectedFields?.length === 0) return '';

    const fieldList = Array.from(new Set([
      ...selectedFields,
      ...(selectedParentFields || []),
      ...filters.map(f => f.field).filter(Boolean)
    ])).join(', ');

    const subqueries = queryFormatter.buildSubqueries(selectedChildFields);
    const whereClause = whereClauseBuilder.buildWhereClause(filters, useAdvancedMode, rawWhereClause);

    return `SELECT ${[fieldList, ...subqueries].join(', ')} FROM ${selectedObject}${whereClause}`;
  }
}