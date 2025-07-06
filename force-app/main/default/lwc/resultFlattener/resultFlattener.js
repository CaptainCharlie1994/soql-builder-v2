export default class resultFlattener {
  static flattenResults(
    data,
    selectedParentRelFields = [],
    selectedChildRelFields = {},
    fieldOrder = []
  ) {
    const allHeaders = new Set();
    let flattenedRows = [];
    let childOverflowDetected = false;
    const MAX_CHILD_ROWS = 5;

    try {
      const normalizedParentFields = Array.isArray(selectedParentRelFields)
        ? selectedParentRelFields
        : Object.values(selectedParentRelFields || {}).flat();

      const normalizedChildKeys = Object.keys(selectedChildRelFields).reduce(
        (map, key) => {
          map[key.toLowerCase()] = key;
          return map;
        },
        {}
      );

      const allChildHeaders = [];
      Object.entries(selectedChildRelFields).forEach(([rel, fields]) => {
        fields.forEach((field) => {
          const header = `${rel}_1_${field}`;
          allChildHeaders.push(header);
          allHeaders.add(header);
        });
      });

      const normalizeValue = (val) => {
        if (val === null || val === undefined) return "";
        if (typeof val !== "object") return val;
        if (typeof val.Name === "string") return val.Name;
        if (typeof val.Label === "string") return val.Label;
        if (typeof val.Id === "string") return val.Id;
        if (typeof val === "boolean") return val.toString();
        if (Array.isArray(val)) return `[${val.length} items]`;

        const keys = Object.keys(val);
        if (val.attributes && keys.length === 1) return "";
        if (keys.every((k) => k === "attributes")) return "";

        const readableKey = keys.find(
          (k) => typeof val[k] === "string" && k !== "attributes"
        );
        if (readableKey) return val[readableKey];

        try {
          return JSON.stringify(val).replace(/\s+/g, " ");
        } catch {
          return "[Object]";
        }
      };

      const isSubquery = (value) =>
        (value?.records && Array.isArray(value.records)) ||
        Array.isArray(value);

      const isParentFieldReference = (key) => {
        const lowerKey = key.toLowerCase();
        return normalizedParentFields.some((pf) =>
          pf.toLowerCase().startsWith(`${lowerKey}.`)
        );
      };

      flattenedRows = data.map((record, index) => {
        const row = {};

        fieldOrder.forEach((header) => {row[header]="";});

        allChildHeaders.forEach((header) => {
          row[header] = "";
        });

        Object.entries(record).forEach(([key, value]) => {
          const lowerKey = key.toLowerCase();

          if (
            key.endsWith("Id") &&
            isParentFieldReference(key.replace(/Id$/, ""))
          ) {
            return;
          }

          if (isSubquery(value)) {
            const canonicalKey = normalizedChildKeys[lowerKey] || key;
            const selectedMainFields = selectedChildRelFields?.[canonicalKey] ||
              selectedChildRelFields?.[key] ||
              selectedChildRelFields?.[lowerKey] || ["Id"];

            const children = Array.isArray(value)
              ? value
              : Array.isArray(value?.records)
                ? value.records
                : [];

            if (children.length > MAX_CHILD_ROWS) {
              childOverflowDetected = true;
            }

            children.slice(0, MAX_CHILD_ROWS).forEach((child, idx) => {
              selectedMainFields.forEach((fieldPath) => {
                const parts = fieldPath.split(".");
                let val = child;
                parts.forEach((p) => (val = val?.[p]));

                const header = `${key}_${idx + 1}_${fieldPath}`;
                row[header] = normalizeValue(val);
                allHeaders.add(header);
              });
            });
          } else if (isParentFieldReference(key)) {
            const matchingFields = normalizedParentFields.filter((pf) =>
              pf.toLowerCase().startsWith(`${lowerKey}.`)
            );

            matchingFields.forEach((pf) => {
              const nestedKey = pf.split(".")[1];
              const subVal = value?.[nestedKey];
              const header = `${key}.${nestedKey}`;
              row[header] = normalizeValue(subVal);
              allHeaders.add(header);
            });

            if (!value || typeof value !== "object") {
              matchingFields.forEach((pf) => {
                const nestedKey = pf.split(".")[1];
                const header = `${key}.${nestedKey}`;
                row[header] = "";
                allHeaders.add(header);
              });
            }
          } else {
            row[key] = normalizeValue(value);
            allHeaders.add(key);
          }
        });

        Object.keys(selectedChildRelFields).forEach((rel) => {
          if (!record.hasOwnProperty(rel)) {
            console.warn(
              `⚠️ Record #${index + 1} missing child relationship: ${rel}`
            );
          }
        });

        return row;
      });
    } catch (error) {
      const message =
        error?.message || JSON.stringify(error) || "Unknown error";
      console.error("❌ Flattening failed:", message);
      console.trace("🔍 Stack trace for flattening failure");
      flattenedRows = [];
    }

    return {
      rows: flattenedRows,
      headers: fieldOrder,
      childOverflowDetected
    };
  }
}
