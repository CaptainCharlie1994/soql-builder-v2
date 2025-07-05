public with sharing class SoqlBuilderHelper {
  public class FilterDTO {
    @AuraEnabled
    public String field;
    @AuraEnabled
    public String operator;
    @AuraEnabled
    public String value;
  }

  @AuraEnabled(cacheable=true)
  public static String getSoqlPreview(
    String objectApiName,
    List<String> selectedFields,
    List<String> selectedParentFields,
    List<FilterDTO> filters,
    Map<String, List<String>> selectedChildFields,
    Boolean useAdvancedMode,
    String rawWhereClause,
    String orderByField,
    String orderDirection,
    Integer queryLimit
  ) {
    Set<String> allFields = new Set<String>();
    allFields.addAll(selectedFields);
    allFields.addAll(selectedParentFields);
    for (FilterDTO f : filters) {
      if (String.isNotBlank(f.field)) {
        allFields.add(f.field);
      }
    }
    List<String> baseFields = new List<String>();
    baseFields.addAll(allFields);
    String fieldList = String.join(baseFields, ', ');

    //Build sub-queries for children
    List<String> subqueries = new List<String>();
    for (String relName : selectedChildFields.keySet()) {
      List<String> cols = selectedChildFields.get(relName);
      if (cols != null && !cols.isEmpty()) {
        subqueries.add(
          '(SELECT ' + String.join(cols, ', ') + ' FROM ' + relName + ')'
        );
      }
    }

    String whereClause = buildWhereClause(
      filters,
      useAdvancedMode,
      rawWhereClause
    );
    List<String> selectPieces = new List<String>();
    selectPieces.add(fieldList);
    selectPieces.addAll(subqueries);
    String soql =
      'SELECT ' +
      String.join(selectPieces, ', ') +
      ' FROM ' +
      objectApiName +
      whereClause +
      (String.isNotBlank(orderByField)
        ? ' ORDER BY ' + orderByField + ' ' + orderDirection
        : '') +
      ' LIMIT ' +
      queryLimit;

    return soql;
  }

  @AuraEnabled(cacheable=true)
  public static List<String> getQueryableObjects() {
    Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
    List<String> queryable = new List<String>();

    for (String name : globalDescribe.keySet()) {
      Schema.DescribeSObjectResult describe = globalDescribe.get(name)
        .getDescribe();
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

  private static String buildWhereClause(
    List<FilterDTO> filters,
    Boolean useAdvancedMode,
    String rawWhereClause
  ) {
    // 1. Advanced mode: use raw WHERE clause directly
    if (useAdvancedMode && String.isNotBlank(rawWhereClause)) {
      // Remove quotes around ISO dates (e.g., "2023-07-05T00:00:00Z")
      String cleaned = rawWhereClause.replaceAll(
        '"(\\d{4}-\\d{2}-\\d{2}(T.*Z)?)"',
        '$1'
      );
      return ' WHERE ' + cleaned;
    }

    // 2. Visual mode: build WHERE clause from filters
    List<String> clauses = new List<String>();
    for (FilterDTO f : filters) {
      if (String.isBlank(f.field) || String.isBlank(f.operator))
        continue;

      if (f.value == null || String.valueOf(f.value).trim() != '') {
        String formatted = formatFilterValue(f.field, f.value);
        clauses.add(f.field + ' ' + f.operator + ' ' + formatted);
      }
    }

    return clauses.isEmpty() ? '' : ' WHERE ' + String.join(clauses, ' AND ');
  }

  private static String formatFilterValue(String fieldName, Object value) {
    if (value == null)
      return 'null';

    String clean = String.valueOf(value).trim();
    if (clean.toLowerCase() == 'null')
      return 'null';

    if (fieldName.toLowerCase().endsWith('id')) {
      return '\'' + clean.replaceAll('\'', '\\\'') + '\'';
    }

    if (Pattern.matches('\\d{4}-\\d{2}-\\d{2}', clean)) {
      return clean; // likely a date
    }

    if (clean.toLowerCase() == 'true' || clean.toLowerCase() == 'false') {
      return clean.toLowerCase();
    }

    if (isNumeric(clean)) {

      return clean;
    }

    return '\'' + clean.replaceAll('\'', '\\\'') + '\'';
  }

  private static Boolean isNumeric(String input) {
    return Pattern.matches('^-?\\d+(\\.\\d+)?$', input);
}
}
