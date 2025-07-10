export default class parentFieldManager {
  static resolveParentObject(relationshipOptions = [], selectedValue = "") {
    return (
      relationshipOptions.find((opt) => opt.value === selectedValue)
        ?.referenceTo || ""
    );
  }

  static formatRelationshipOption(field) {
    return {
      label: `${field.label} (${field.name})`,
      value: field.relationshipName,
      referenceTo: field.referenceTo
    };
  }
}
