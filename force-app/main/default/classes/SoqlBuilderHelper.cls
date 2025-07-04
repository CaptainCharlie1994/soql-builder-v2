public with sharing class SoqlBuilderHelper {
  @AuraEnabled(cacheable=true)
  public static List<String> getQueryableObjects() {
  Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
  List<String> queryable = new List<String>();
  
  for (String name : globalDescribe.keySet()) {
    Schema.DescribeSObjectResult describe = globalDescribe.get(name).getDescribe();
    if (
      describe.isQueryable() &&
      describe.isAccessible() &&
      !describe.isCustomSetting() &&
      !describe.isDeprecatedAndHidden()
    ) {
      queryable.add(name);
    }
  }
  queryable.sort();
  return queryable;
}

  @AuraEnabled(cacheable=true)
  public static List<Map<String, Object>> getFieldsForObject(
    String objectApiName
  ) {
    if (String.isBlank(objectApiName)) {
      throw new AuraHandledException('Object API name is missing.');
    }

    // Case-insensitive lookup of the real API name
    Map<String, Schema.SObjectType> globalDesc = Schema.getGlobalDescribe();
    String realKey;
    for (String key : globalDesc.keySet()) {
      if (key.equalsIgnoreCase(objectApiName)) {
        realKey = key;
        break;
      }
    }
    if (realKey == null) {
      throw new AuraHandledException('Unknown object: ' + objectApiName);
    }

    try {
      // Describe the SObject
      Schema.DescribeSObjectResult objDesc = globalDesc.get(realKey)
        .getDescribe();

      // Pull its fields map
      Map<String, Schema.SObjectField> fieldsMap = objDesc.fields.getMap();
      List<Map<String, Object>> fieldDetails = new List<Map<String, Object>>();

      for (Schema.SObjectField sfield : fieldsMap.values()) {
        Schema.DescribeFieldResult fDesc = sfield.getDescribe();

        // Normalize relationshipName
        String relName = fDesc.getRelationshipName();
        if (relName == null)
          relName = '';

        // getReferenceTo() returns List<Schema.SObjectType>
        String referenceTo = '';
        List<Schema.SObjectType> refTypes = fDesc.getReferenceTo();
        if (refTypes != null && !refTypes.isEmpty()) {
          referenceTo = refTypes[0].getDescribe().getName();
        }

        // Add only primitive values
        fieldDetails.add(
          new Map<String, Object>{
            'name' => fDesc.getName(),
            'label' => fDesc.getLabel(),
            'type' => String.valueOf(fDesc.getType()),
            'relationshipName' => relName,
            'referenceTo' => referenceTo
          }
        );
      }

      return fieldDetails;
    } catch (Exception e) {
      throw new AuraHandledException(
        'Failed to describe "' + realKey + '": ' + e.getMessage()
      );
    }
  }

  @AuraEnabled(cacheable=true)
  public static List<String> getChildRelationships(String objectApiName) {
    Map<String, Schema.SObjectType> globalDesc = Schema.getGlobalDescribe();

    if (!globalDesc.containsKey(objectApiName)) {
      throw new AuraHandledException('Unknown object: ' + objectApiName);
    }

    Schema.DescribeSObjectResult objDescribe = globalDesc.get(objectApiName)
      .getDescribe();
    List<String> relationshipNames = new List<String>();

    for (Schema.ChildRelationship rel : objDescribe.getChildRelationships()) {
      if (rel.getRelationshipName() != null) {
        relationshipNames.add(rel.getRelationshipName());
      }
    }

    relationshipNames.sort();
    return relationshipNames;
  }

  @AuraEnabled
  public static List<SObject> runQuery(String soql) {
    try {
      return Database.query(soql);
    } catch (Exception e) {
      throw new AuraHandledException('SOQL Error: ' + e.getMessage());
    }
  }
}
