export default class whereClauseBuilder {
  static buildWhereClause(filters = [], useAdvancedMode = false, rawWhereClause = "") {
    if (useAdvancedMode && rawWhereClause?.trim()) {
      return ` WHERE ${rawWhereClause.trim()}`;
    }

    if (!useAdvancedMode && filters?.length > 0) {
      const clauses = filters
        .filter(
          (f) => f.field && f.operator && f.value !== undefined && f.value !== ""
        )
        .map((f) => {
          const lowerVal = String(f.value).toLowerCase();
          const keywords = ["null", "true", "false"];
          const formattedValue = keywords.includes(lowerVal)
            ? lowerVal
            : `'${f.value}'`;
          return `${f.field} ${f.operator} ${formattedValue}`;
        });

      if (clauses.length > 0) {
        return ` WHERE ${clauses.join(" AND ")}`;
      }
    }

    return "";
  }
}