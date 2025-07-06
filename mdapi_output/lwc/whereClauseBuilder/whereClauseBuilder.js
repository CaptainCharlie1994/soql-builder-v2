import debugFormatter from "c/debugFormatter";
import { formatFilterValue } from "c/valueFormatter";

export default class whereClauseBuilder {
  static buildWhereClause(
    filters = [],
    useAdvancedMode = false,
    rawWhereClause = "",
    mainFieldMetadata = {}
  ) {
    // 🧠 Advanced mode: use raw WHERE clause directly
    if (useAdvancedMode && rawWhereClause?.trim()) {
      const cleaned = rawWhereClause
        .trim()
        .replace(/"(\d{4}-\d{2}-\d{2}(T.*Z)?)"/g, "$1"); // remove quotes around ISO dates
      return ` WHERE ${cleaned}`;
    }

    // 🧼 Visual mode: build WHERE clause from filters
    if (!useAdvancedMode && filters.length > 0) {
      const clauses = filters
        .filter(
          (f) => f.field && f.operator && f.value !== undefined && f.value !== ""
        )
        .map((f) => {
          const meta = mainFieldMetadata[f.field];
          const fieldType = typeof meta === "string" ? meta : meta?.type || "String";

          const formattedValue = formatFilterValue(f.field, fieldType, f.value);

          debugFormatter.log("🧩 Filter", {
            field: f.field,
            type: fieldType,
            raw: f.value,
            formatted: formattedValue
          });

          return `${f.field} ${f.operator} ${formattedValue}`;
        });

      return clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    }

    return "";
  }
}