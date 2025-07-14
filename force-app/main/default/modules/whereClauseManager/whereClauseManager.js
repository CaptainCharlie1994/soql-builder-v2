import operatorResolver from "c/operatorResolver";

export function createNewFilter() {
  const last = this.filters[this.filters.length - 1];
  if (!last.connector) {
    this.dispatchEvent(
      new ShowToastEvent({
        title: "Missing Connector",
        message:
          "Please select a connector (AND/OR) before adding a new filter",
        variant: "warning"
      })
    );
    return;
  }
  return {
    id: `filter-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    field: "",
    operator: "=",
    value: "",
    connector: "",
    validOperators: operatorResolver.getOperatorOptions("")
  };
}

export function updateFilter(filters, index, field, value) {
  const updated = [...filters]; // updated = all WHERE clause rows
  const filter = { ...updated[index], [field]: value }; // pick out the row we want by the index

  if (field === "field") {
    // if it's a field (the column) then we resolve the operators.
    filter.validOperators = operatorResolver.getOperatorOptions(filter.field);
    if (!filter.operator) {
      filter.operator = "=";
    }
  }

  updated[index] = filter; // then we go back into the update list and update the row component (field/operator/value).
  return updated; // return the newly modified row.
}

export function removeFilter(filters, index) {
  return filters.filter((_, i) => i !== index);
}
