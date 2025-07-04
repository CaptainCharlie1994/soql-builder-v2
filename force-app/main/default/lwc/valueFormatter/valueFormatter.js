export function formatFilterValue(fieldApiName, fieldType, value) {
  if (value === null || value === undefined) return 'null';

  const clean = value.toString().trim();

  if(clean.toLowerCase() === 'null') return null;

  switch (fieldType) {
    case 'Boolean':
    case 'Checkbox':
      return `'${clean.toLowerCase()}'`;

    case 'Picklist':
    case 'String':
    case 'Phone':
    case 'Email':
    case 'Url':
    case 'Text':
      return `'${clean.replace(/'/g, "\\'")}'`;

    case 'Date':
    case 'DateTime':
      return clean;

    case 'Currency':
    case 'Double':
    case 'Integer':
    case 'Long':
    case 'Percent':
    case 'null':
      return clean;

    default:
      return `'${clean}'`;
  }
}