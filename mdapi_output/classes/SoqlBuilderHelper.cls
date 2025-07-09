public with sharing class SoqlBuilderHelper {
  public class FilterDTO {
    @AuraEnabled
    public String field;
    @AuraEnabled
    public String operator;
    @AuraEnabled
    public String value;
  }

  @AuraEnabled
  public static String getSoqlPreview(
    String objectApiName,
    List<String> selectedMainFields,
    List<String> selectedParentRelFields,
    String filtersJson,
    Map<String, List<String>> selectedChildRelFields,
    Boolean useAdvancedMode,
    String rawWhereClause,
    String orderByField,
    String orderDirection,
    Integer queryLimit,
    String childFiltersJson, //Because we are sending over potentially many sets of children where clauses
    String childAdvancedJson, //we send as a json so we can then deserialise into maps.
    String childRawWhereJson
  ) {
    List<FilterDTO> filters = (List<FilterDTO>) JSON.deserialize(
      filtersJson,
      List<FilterDTO>.class
    );

    // ——————————————
    // 1) Child Advanced Mode → Map<String,Boolean>
    // ——————————————
    Map<String, Boolean> childAdvancedMap = new Map<String, Boolean>();
    if (!String.isBlank(childAdvancedJson)) {
      Map<String, Object> rawAdvanced = (Map<String, Object>) JSON.deserializeUntyped(
        childAdvancedJson
      );
      for (String rel : rawAdvanced.keySet()) {
        Object v = rawAdvanced.get(rel);
        Boolean boolVal = (v instanceof Boolean)
          ? (Boolean) v
          : Boolean.valueOf(String.valueOf(v));
        childAdvancedMap.put(rel, boolVal);
      }
    }

    // ——————————————
    // 2) Child Raw WHERE → Map<String,String>
    // ——————————————
    Map<String, String> childRawMap = new Map<String, String>();
    if (!String.isBlank(childRawWhereJson)) {
      Map<String, Object> rawRaw = (Map<String, Object>) JSON.deserializeUntyped(
        childRawWhereJson
      );
      for (String rel : rawRaw.keySet()) {
        childRawMap.put(rel, String.valueOf(rawRaw.get(rel)));
      }
    }

    // ——————————————
    // 3) Child Filters → Map<String,List<Object>>
    // ——————————————
    Map<String, List<Object>> childFiltersMap = new Map<String, List<Object>>();
    if (!String.isBlank(childFiltersJson)) {
      Map<String, Object> rawFilters = (Map<String, Object>) JSON.deserializeUntyped(
        childFiltersJson
      );
      for (String rel : rawFilters.keySet()) {
        Object entry = rawFilters.get(rel);
        if (entry instanceof List<Object>) {
          childFiltersMap.put(rel, (List<Object>) entry);
        } else {
          childFiltersMap.put(rel, new List<Object>());
        }
      }
    }

    Set<String> allFields = new Set<String>();
    allFields.addAll(selectedMainFields);
    allFields.addAll(selectedParentRelFields);

    for (FilterDTO f : filters) {
      System.debug('Filters: ' + f);
    }

    List<String> baseFields = new List<String>();
    baseFields.addAll(allFields);
    String fieldList = String.join(baseFields, ', ');

    //Build sub-queries for children
    List<String> subqueries = new List<String>();

    for (String relName : selectedChildRelFields.keySet()) {
      List<String> cols = selectedChildRelFields.get(relName);
      if (cols == null || cols.isEmpty()) {
        subqueries.add('(SELECT Id FROM ' + relName + ')');
        continue;
      }

      String whereClause = buildChildWhereClause(
        relName,
        childFiltersMap,
        childAdvancedMap,
        childRawMap,
        objectApiName
      );

      String subquery =
        '(SELECT ' +
        String.join(cols, ', ') +
        ' FROM ' +
        relName +
        whereClause +
        ')';

      subqueries.add(subquery);
    }

    String whereClause = buildWhereClause(
      filters,
      useAdvancedMode,
      rawWhereClause,
      objectApiName
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
    String rawWhereClause,
    String objectApiName
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

      if (f.value != null && String.valueOf(f.value).trim() != '') {
        String formatted = formatFilterValue(objectApiName, f.field, f.value);
        clauses.add(f.field + ' ' + f.operator + ' ' + formatted);
      }
    }

    return clauses.isEmpty() ? '' : ' WHERE ' + String.join(clauses, ' AND ');
  }

  private static String buildChildWhereClause(
    String relName,
    Map<String, List<Object>> filtersMap, // ← typed map here
    Map<String, Boolean> advancedMap,
    Map<String, String> rawMap,
    String objectApiName
  ) {
    Boolean isAdvanced = advancedMap.containsKey(relName)
      ? advancedMap.get(relName)
      : false;
    if (isAdvanced) {
      String raw = rawMap.get(relName);
      return String.isBlank(raw) ? '' : ' WHERE ' + raw;
    }

    List<Object> filterList = filtersMap.containsKey(relName)
      ? filtersMap.get(relName)
      : new List<Object>();

    List<String> parts = new List<String>();
    for (Object f : filterList) {
      Map<String, Object> row = (Map<String, Object>) f;
      String field = (String) row.get('field');
      String op = (String) row.get('operator');
      String val = String.valueOf(row.get('value'));
      if (!String.isBlank(field) && !String.isBlank(val)) {
        parts.add(
          field + ' ' + op + ' ' + formatFilterValue(objectApiName, field, val)
        );
      }
    }
    return parts.isEmpty() ? '' : ' WHERE ' + String.join(parts, ' AND ');
  }

  private static String formatFilterValue(
    String objectApiName,
    String fieldName,
    Object value
  ) {
    System.debug('🔍 formatFilterValue called with:');
    System.debug('• objectApiName: ' + objectApiName);
    System.debug('• fieldName: ' + fieldName);
    System.debug('• raw value: ' + value);

    if (value == null) {
      System.debug('⚠️ Value is null → returning null');
      return 'null';
    }

    String clean = String.valueOf(value).trim();
    System.debug('• Cleaned value: ' + clean);

    if (clean.toLowerCase() == 'null') {
      System.debug('⚠️ Value is string "null" → returning null');
      return 'null';
    }

    // Handle parent fields like CreatedBy.IsActive
    if (fieldName.contains('.')) {
      System.debug('🔁 Detected parent field reference');

      List<String> parts = fieldName.split('\\.');
      if (parts.size() != 2) {
        System.debug('❌ Invalid nested field format → fallback to quote');
        return quote(clean);
      }

      String parentRel = parts[0];
      String nestedField = parts[1];
      System.debug('• Parent relationship: ' + parentRel);
      System.debug('• Nested field: ' + nestedField);

      Schema.SObjectType baseType = Schema.getGlobalDescribe()
        .get(objectApiName);
      if (baseType == null) {
        System.debug(
          '❌ Could not resolve base object type → fallback to quote'
        );
        return quote(clean);
      }

      Schema.DescribeSObjectResult baseDesc = baseType.getDescribe();
      // Try to find the field whose relationshipName matches the parentRel
      Schema.SObjectField parentField;
      for (Schema.SObjectField f : baseDesc.fields.getMap().values()) {
        if (f.getDescribe().getRelationshipName() == parentRel) {
          parentField = f;
          break;
        }
      }
      if (parentField == null) {
        System.debug('❌ Could not resolve parent field: ' + parentRel);
        return quote(clean);
      }

      List<Schema.SObjectType> refTypes = parentField.getDescribe()
        .getReferenceTo();
      if (refTypes.isEmpty()) {
        System.debug('❌ No reference types found for parent field');
        return quote(clean);
      }

      Schema.SObjectType parentType = refTypes[0];
      System.debug(
        '• Resolved parent object: ' + parentType.getDescribe().getName()
      );

      Schema.DescribeSObjectResult parentDesc = parentType.getDescribe();
      Schema.SObjectField nested = parentDesc.fields.getMap().get(nestedField);
      if (nested == null) {
        System.debug('❌ Could not resolve nested field: ' + nestedField);
        return quote(clean);
      }

      Schema.DisplayType nestedType = nested.getDescribe().getType();
      System.debug('✅ Resolved nested field type: ' + nestedType);

      return formatByType(nestedType, clean);
    }

    // Handle top-level fields
    System.debug('🔁 Handling top-level field');

    Schema.SObjectType objType = Schema.getGlobalDescribe().get(objectApiName);
    if (objType == null) {
      System.debug('❌ Could not resolve object type → fallback to quote');
      return quote(clean);
    }

    Schema.DescribeSObjectResult objDesc = objType.getDescribe();
    Schema.SObjectField sfield = objDesc.fields.getMap().get(fieldName);
    if (sfield == null) {
      System.debug('❌ Could not resolve field: ' + fieldName);
      return quote(clean);
    }

    Schema.DisplayType type = sfield.getDescribe().getType();
    System.debug('✅ Resolved field type: ' + type);

    return formatByType(type, clean);
  }

  private static String formatByType(Schema.DisplayType type, String clean) {
    if (type == Schema.DisplayType.BOOLEAN) {
      return clean.toLowerCase(); // true/false
    } else if (
      type == Schema.DisplayType.DATE ||
      type == Schema.DisplayType.DATETIME ||
      type == Schema.DisplayType.DOUBLE ||
      type == Schema.DisplayType.CURRENCY ||
      type == Schema.DisplayType.INTEGER ||
      type == Schema.DisplayType.PERCENT
    ) {
      return clean; // unquoted
    } else {
      return quote(clean); // default: quote it
    }
  }

  private static String quote(String input) {
    return '\'' + input.replaceAll('\'', '\\\'') + '\'';
  }

  private static Boolean isNumeric(String input) {
    return Pattern.matches('^-?\\d+(\\.\\d+)?$', input);
  }
}
