export default class parentFieldManager {
  static resolveParentObject(relationshipOptions = [], selectedValue = '') {
    return relationshipOptions.find(opt => opt.value === selectedValue)?.referenceTo || '';
  }

  static formatRelationshipOption(field, refLabel) {
    return {
      label: `${field.label} (${refLabel})`,
      value: field.relationshipName,
      referenceTo: field.referenceTo
    };
  }

  static fetchFieldsForObject(apiName, fieldFetchCallback) {
    if (typeof fieldFetchCallback === 'function') {
      fieldFetchCallback(apiName);
    }
  }
}