public with sharing class relationshipResolver {

    public class Mapping {
        @AuraEnabled public String relationshipName;
        @AuraEnabled public String childSObject;

        public Mapping(String relName, String sObjectName) {
            this.relationshipName = relName;
            this.childSObject = sObjectName;
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Mapping> getChildObjectMappings(String parentObject) {
        List<Mapping> mappings = new List<Mapping>();

        Map<String, Schema.SObjectType> globalDesc = Schema.getGlobalDescribe();
        if (!globalDesc.containsKey(parentObject)) {
            throw new AuraHandledException('Unknown object: ' + parentObject);
        }

        Schema.DescribeSObjectResult parentDesc = globalDesc.get(parentObject).getDescribe();

        for (Schema.ChildRelationship rel : parentDesc.getChildRelationships()) {
            if (rel.getRelationshipName() != null && rel.getChildSObject() != null) {
                mappings.add(new Mapping(rel.getRelationshipName(), rel.getChildSObject().getDescribe().getName()));
            }
        }

        return mappings;
    }
}