import operatorResolver from 'c/operatorResolver';

export function createNewFilter() {
  return {
    id: `filter-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    field: '',
    operator: '=',
    value: '',
    validOperators: operatorResolver.getOperatorOptions('')
  };
}

export function updateFilter(filters, index, field, value) {
  const updated = [...filters];
  const filter = { ...updated[index], [field]: value };

  if (field === 'field') {
    filter.validOperators = operatorResolver.getOperatorOptions(filter.field);
    if (!filter.operator) {
      filter.operator = '=';
    }
  }

  updated[index] = filter;
  return updated;
}

export function removeFilter(filters, index) {
  return filters.filter((_, i) => i !== index);
}