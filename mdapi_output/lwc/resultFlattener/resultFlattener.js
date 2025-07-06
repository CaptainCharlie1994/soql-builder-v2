export default class resultFlattener {
  static flattenResults(
    data,
    selectedParentRelFields = [],
    selectedChildRelFields = {}
  ) {
    const allHeaders = new Set();
    let flattenedRows = [];

    try {
      const normalizedChildKeys = Object.keys(selectedChildRelFields).reduce(
        (map, key) => {
          map[key.toLowerCase()] = key;
          return map;
        },
        {}
      );

      const normalizeValue = (val) => {
        if (val === null || val === undefined) return "";
        if (typeof val !== "object") return val;
        if (typeof val.Name === "string") return val.Name;
        if (typeof val.Label === "string") return val.Label;
        if (typeof val.Id === "string") return val.Id;
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
        Array.isArray(value) ||
        (value?.records && Array.isArray(value.records));

      const isParentFieldReference = (key) =>
        selectedParentRelFields.some((pf) => pf.startsWith(`${key}.`));

      flattenedRows = data.map((record) => {
        const row = {};

        Object.entries(record).forEach(([key, value]) => {
          if (isSubquery(value)) {
            const relKey = key.toLowerCase();
            const canonicalKey = normalizedChildKeys[relKey] || key;
            const selectedMainFields = selectedChildRelFields?.[canonicalKey] ||
              selectedChildRelFields?.[key] ||
              selectedChildRelFields?.[relKey] || ["Id"];
            const children = value.records || [];

            if (children.length === 0) {
              selectedMainFields.forEach((field) => {
                const header = `${key}_1_${field}`;
                row[header] = "";
                allHeaders.add(header);
              });
            } else {
              children.forEach((child, idx) => {
                selectedMainFields.forEach((fieldPath) => {
                  const parts = fieldPath.split(".");
                  let val = child;
                  parts.forEach((p) => (val = val?.[p]));

                  const header = `${key}_${idx + 1}_${fieldPath}`;
                  row[header] = normalizeValue(val);
                  allHeaders.add(header);
                });
              });
            }
          } else if (isParentFieldReference(key) && typeof value === "object") {
            selectedParentRelFields.forEach((pf) => {
              if (pf.startsWith(`${key}.`)) {
                const nestedKey = pf.split(".")[1];
                const subVal = value?.[nestedKey];
                const header = `${key}.${nestedKey}`;
                row[header] = normalizeValue(subVal);
                allHeaders.add(header);
              }
            });
          } else if (isParentFieldReference(key)) {
            // skip full reference objects if their subfields are already used
          } else {
            row[key] = normalizeValue(value);
            allHeaders.add(key);
          }
        });

        return row;
      });
    } catch (error) {
      console.error("❌ Flattening failed:", error);
      flattenedRows = [];
    }

    return {
      rows: flattenedRows,
      headers: Array.from(allHeaders)
    };
  }
}
