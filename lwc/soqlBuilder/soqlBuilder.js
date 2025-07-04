import { LightningElement, track, wire } from "lwc";
import getQueryableObjects from "@salesforce/apex/SoqlBuilderHelper.getQueryableObjects";
import getFieldsForObject from "@salesforce/apex/SoqlBuilderHelper.getFieldsForObject";
import runQuery from "@salesforce/apex/SoqlBuilderHelper.runQuery";
import getChildRelationships from "@salesforce/apex/SoqlBuilderHelper.getChildRelationships";
import getChildObjectMappings from "@salesforce/apex/relationshipResolver.getChildObjectMappings";
import emailCsv from "@salesforce/apex/exportController.emailCsv";

//Utility classes
import childFieldManager from "c/childFieldManager";
import debugFormatter from "c/debugFormatter";
import operatorResolver from "c/operatorResolver";
import parentFieldManager from "c/parentFieldManager";
import queryFormatter from "c/queryFormatter";
import whereClauseBuilder from "c/whereClauseBuilder";

import { getRecord } from "lightning/uiRecordApi";
import USER_ID from "@salesforce/user/Id";
import EMAIL_FIELD from "@salesforce/schema/User.Email";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

export default class SoqlBuilder extends LightningElement {
  constructor() {
    super();
    this.rawResult = [];
  }

  connectedCallback() {}

  @track objectOptions = [];
  @track selectedFields = [];
  @track fieldOptions = [];
  @track childRelationships = [];
  @track selectedRelationships = [];
  @track childFieldOptions = {};
  @track selectedChildFields = {};
  @track childFieldConfigs = [];
  filters = [
    {
      id: "filter-0",
      field: "",
      operator: "=",
      value: "",
      validOperators: operatorResolver.getOperatorOptions("")
    }
  ];

  @track soqlPreview = "";
  @track queryResults = [];
  @track tableColumns = [];
  @track relationshipToSObjectMap = {};
  @track fieldMetadata = [];
  @track parentFieldOptions = [];
  @track dualListBoxReady = false;

  selectedObject = "";
  userEmail = "";
  useAdvancedMode = false;
  rawWhereClause = "";
  selectedParent = "";

  @wire(getQueryableObjects)
  wiredObjects({ error, data }) {
    if (data) {
      this.objectOptions = data.map((obj) => ({ label: obj, value: obj }));
      console.log("Fetched object count: " + data?.length);
    } else {
      console.error("Error fetching objects:", error);
    }
  }

  @wire(getRecord, { recordId: USER_ID, fields: [EMAIL_FIELD] })
  wiredUser({ error, data }) {
    if (data?.fields?.Email?.value) {
      this.userEmail = data.fields.Email.value;
    } else {
      console.error("Error fetching user email:", error);
    }
  }

  handleObjectChange(event) {
    this.selectedObject = event.detail.value;
    console.log("event.detail:", event.detail);
    console.log("Selected object (raw):", event.detail.value);

    this.fieldOptionsReady = false;
    this.fieldOptions = [];
    this.selectedFields = [];
    this.childRelationships = [];
    this.selectedRelationships = [];
    this.childFieldOptions = {};
    this.selectedChildFields = {};
    this.childFieldConfigs = [];

    if (!this.selectedObject) {
      console.warn("No object selected - skipping field fetch.");
      return;
    }

    getFieldsForObject({ objectApiName: this.selectedObject })
      .then((fields) => {
        this.fieldMetadata = {};
        this.parentRelationshipOptions = [];

        // Store field types
        this.fieldMetadata = fields.reduce((meta, field) => {
          if (field && field.name) {
            meta[field.name] = field.type;
          }
          return meta;
        }, {});

        // Use map to create reactive-friendly options array
        this.fieldOptions = fields
          .filter((f) => f && f.name)
          .map((f) => ({
            label: f.label || f.name,
            value: f.name
          }));
        this.selectedFields = []; // clear safely
        this.selectedFields = [...this.selectedFields]; // force observable update

        // Then extract parent options from reference fields
        fields
          .filter(
            (f) =>
              (f.type || "").toLowerCase() === "reference" && f.relationshipName
          )
          .forEach((field) => {
            const refLabel = (field.referenceTo || "Unknown")
              .split(",")
              .join(", ");
            const parentOption = parentFieldManager.formatRelationshipOption(
              field,
              refLabel
            );
            this.parentRelationshipOptions.push(parentOption);
            console.log("Adding parent option:", parentOption);
          });
        this.updatePreview();
        console.log("🔍 Preview insinde getFields:", this.soqlPreview);
      })
      .catch((error) => {
        console.error(
          "Error fetching fields:",
          error?.body?.message || error.message || JSON.stringify(error)
        );
      })
      .finally(() => {
        Promise.resolve().then(() => {
          this.dualListBoxReady = true;
        });
      });

    this.fetchChildRelationships();
    this.fetchRelationshipMappings();
  }

  toggleWhereMode() {
    this.useAdvancedMode = !this.useAdvancedMode;
  }

  fetchParentFields(parentObjectName, relationshipName) {
    if (!parentObjectName) return;

    getFieldsForObject({ objectApiName: parentObjectName }).then((fields) => {
      if (!Array.isArray(fields) || fields.length === 0) {
        console.warn(
          "⚠️ No fields returned for parent object:",
          parentObjectName
        );
        this.parentFieldOptions = [];
        return;
      }

      this.parentFieldOptions = fields.map((f) => ({
        label: f.label || f.name,
        value: `${relationshipName}.${f.name}`
      }));

      console.log("🧩 Parent field options:", this.parentFieldOptions);
    });
  }

  fetchChildRelationships() {
    getChildRelationships({ objectApiName: this.selectedObject })
      .then((result) => {
        this.childRelationships = result.map((rel) => ({
          label: rel,
          value: rel
        }));
      })
      .catch((error) =>
        console.error("Error fetching child relationships:", error)
      );
  }

  fetchRelationshipMappings() {
    getChildObjectMappings({ parentObject: this.selectedObject })
      .then((result) => {
        this.relationshipToSObjectMap = result.reduce((map, entry) => {
          map[entry.relationshipName] = entry.childSObject;
          return map;
        }, {});
      })
      .catch((error) => {
        console.error("Error fetching child object mappings:", error);
      });
  }

  handleRelationshipSelection(event) {
    const newSelection = event.detail.value;

    const removed = this.selectedRelationships.filter(
      (r) => !newSelection.includes(r)
    );
    removed.forEach((rel) => {
      delete this.childFieldOptions[rel];
      this.selectedChildFields = {
        ...this.selectedChildFields,
        [rel]: ["Id"]
      };
    });

    this.selectedRelationships = newSelection;

    newSelection.forEach((rel) => {
      if (!this.childFieldOptions[rel]) {
        const sObjectName = this.relationshipToSObjectMap?.[rel] || rel;

        getFieldsForObject({ objectApiName: sObjectName })
          .then((fields) => {
            this.addChildFieldConfig(rel, fields);
          })
          .catch((error) =>
            console.error(`Error fetching fields for ${rel}:`, error)
          );
      }
    });
    this.updatePreview();
    console.log("🔍 Preview:", this.soqlPreview);
  }

  addChildFieldConfig(rel, fields) {
    const options = fields.map((f) => ({
      label: `${f.name} (${f.type})`,
      value: f.name
    }));
    const selected = this.selectedChildFields?.[rel] || ["Id"];

    this.childFieldOptions = {
      ...this.childFieldOptions,
      [rel]: options
    };

    this.selectedChildFields = {
      ...this.selectedChildFields,
      [rel]: selected
    };

    this.updateChildConfigs();
  }

  updateChildConfigs() {
    this.childFieldConfigs = this.selectedRelationships.map((rel) => ({
      rel,
      options: this.childFieldOptions?.[rel] || [],
      selected: this.selectedChildFields?.[rel] || ["Id"]
    }));
  }

  handleChildFieldSelection(event) {
    const rel = event.target.name;
    const selected = event.detail.value;

    this.selectedChildFields = {
      ...this.selectedChildFields,
      [rel]: selected
    };

    this.updateChildConfigs();
    this.updatePreview();
  }

  handleFieldSelection(event) {
    const incoming = event.detail?.value || [];

    // Apply validated selections
    const validSet = new Set(this.fieldOptions.map((o) => o.value));
    this.selectedFields = incoming.filter((v) => validSet.has(v));
  }

  handleFilterChange(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10);
    const field = event.target.name;
    const value = event.target.value;

    const updated = [...this.filters];
    const filter = { ...updated[index], [field]: value };

    // If changing the field, recalculate operators
    if (field === "field") {
      filter.validOperators = operatorResolver.getOperatorOptions(filter.field);
      if (!filter.operator) {
        filter.operator = "="; // fallback
      }
    }

    updated[index] = filter;
    this.filters = updated;
    this.updatePreview();
  }

  handleRemoveFilter(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10);
    this.filters = this.filters.filter((_, i) => i !== index);
    this.updatePreview();
  }

  handleWhereInputChange(event) {
    this.rawWhereClause = event.detail.value;
  }

  handleBuildQuery() {
    if (!this.selectedObject || !this.selectedFields?.length) {
      this.soqlPreview = "";
      this.queryResults = [];
      this.tableColumns = [];
      return;
    }

    // 🧼 Sanitize filters
    this.filters = this.filters.map((f) => ({
      id:
        f.id ||
        `filter-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      field: f.field || "",
      operator: f.operator || "=",
      value: f.value || "",
      validOperators:
        f.validOperators || operatorResolver.getOperatorOptions(f.field || "")
    }));

    const fullQuery = queryFormatter.generatePreview({
      selectedObject: this.selectedObject,
      selectedFields: this.selectedFields,
      selectedParentFields: this.selectedParentFields,
      filters: this.filters,
      selectedChildFields: this.selectedChildFields,
      rawWhereClause: this.rawWhereClause,
      useAdvancedMode: this.useAdvancedMode
    });

    runQuery({ soql: fullQuery })
      .then((data) => {
        this.rawResult = data;

        const { rows, headers } = this.flattenResults(data);
        this.queryResults = rows;
        this.tableColumns = headers.map((header) => ({
          label: header,
          fieldName: header
        }));

        // ✅ Show toast if no results
        if (!rows || rows.length === 0) {
          this.dispatchEvent(
            new ShowToastEvent({
              title: "No Results",
              message: "This query returned 0 records.",
              variant: "info"
            })
          );
        }
      })
      .catch((error) => {
        console.error("Query failed:", error);
        this.queryResults = [];
        this.tableColumns = [];

        const message =
          error?.body?.message ||
          "An error occurred while executing the query.";

        this.dispatchEvent(
          new ShowToastEvent({
            title: "SOQL Error",
            message,
            variant: "error"
          })
        );
      });
  }

  async handleExport() {
    console.log("📤 Export initiated");

    if (!this.queryResults || this.queryResults.length === 0) {
      this.showToast("Warning", "No data to export.", "warning");
      return;
    }

    this.showToast("info", "Preparing CSV for export...", "info");

    try {
      const userEmail = this.userEmail;
      const { rows, headers } = this.flattenResults(this.queryResults);
      const cleanData = JSON.parse(JSON.stringify(rows));
      const cleanHeaders = JSON.parse(JSON.stringify(headers));
      const payloadSize = JSON.stringify(cleanData).length;

      const result = await emailCsv({
        objectName: this.selectedObject,
        data: cleanData,
        headers: cleanHeaders,
        recipientEmail: this.userEmail
      });

      if (result?.success) {
        this.showToast("success", result.message, "success");
      } else {
        const errMsg = result?.message || "Email failed without message.";
        console.error("❌ Apex reported failure:", errMsg);
        this.showToast("error", errMsg, "error");
      }
    } catch (error) {
      const fallback =
        error?.body?.message || error?.message || "Unknown export error";
      console.error("🔥 Uncaught export error:", fallback);
      this.showToast("error", fallback, "error");
    }
  }

  flattenResults(data) {
    try {
      const allHeaders = new Set();

      const selectedChildKeys = Object.keys(
        this.selectedChildFields || {}
      ).reduce((map, k) => {
        map[k.toLowerCase()] = k;
        return map;
      }, {});

      const normalizeValue = (val) => {
        if (val === null || val === undefined) return "";
        if (typeof val !== "object") return val;

        if (typeof val.Name === "string") return val.Name;
        if (typeof val.Label === "string") return val.Label;
        if (typeof val.Id === "string") return val.Id;

        if (Array.isArray(val)) return `[${val.length} items]`;
        if (val.attributes && Object.keys(val).length === 1) return "";

        const readableKey = Object.keys(val).find(
          (k) => typeof val[k] === "string" && k !== "attributes"
        );
        if (readableKey) return val[readableKey];

        try {
          return JSON.stringify(val, null, 0).replace(/\s+/g, " ");
        } catch {
          return "[Object]";
        }
      };

      const isSubquery = (value) =>
        typeof value === "object" &&
        value !== null &&
        "records" in value &&
        Array.isArray(value.records);

      const flattened = data.map((record) => {
        const flat = {};

        Object.entries(record).forEach(([key, value]) => {
          console.log(`🔁 Flattening key: ${key}`, value);
          if (isSubquery(value)) {
            const relKey = key.toLowerCase();
            const originalRelKey = selectedChildKeys[relKey];
            const selectedFields = this.selectedChildFields?.[
              originalRelKey
            ] || ["Id"];
            const children = value.records;

            if (!children || children.length === 0) {
              selectedFields.forEach((f) => {
                const header = `${key}_1_${f}`;
                flat[header] = "";
                allHeaders.add(header);
              });
            } else {
              children.forEach((child, index) => {
                Object.entries(child).forEach(([childKey, childVal]) => {
                  const header = `${key}_${index + 1}_${childKey}`;
                  console.warn(
                    `🕵️ ${header} ➡ type: ${typeof childVal}, keys: ${
                      childVal && typeof childVal === "object"
                        ? Object.keys(childVal).join(", ")
                        : "N/A"
                    }, value: ${JSON.stringify(childVal)}`
                  );
                  flat[header] = normalizeValue(childVal);
                  if (
                    header.includes("Product2") &&
                    typeof childVal === "object"
                  ) {
                    console.log("🧪 Special Product2 case:", childVal);
                  }
                  allHeaders.add(header);
                });
              });
            }
          } else {
            flat[key] = normalizeValue(value);
            allHeaders.add(key);
          }
        });

        return flat;
      });

      return {
        rows: flattened,
        headers: Array.from(allHeaders)
      };
    } catch (e) {
      console.error("Flattening failed:", e);
    }
  }

  showToast(title, message, variant) {
    this.dispatchEvent(
      new ShowToastEvent({
        title,
        message,
        variant
      })
    );
  }

  addFilter() {
    const defaultField = "";
    const newFilter = {
      id: `filter-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      field: defaultField,
      operator: "=",
      value: "",
      validOperators: operatorResolver.getOperatorOptions("")
    };
    console.trace("📌 addFilter: new filters", [...this.filters, newFilter]);
    this.filters = [...this.filters, newFilter];
  }

  get showFieldSelector() {
    console.log(
      "📎 showFieldSelector:",
      this.selectedObject,
      this.fieldOptions?.length
    );
    return this.selectedObject && this.fieldOptions.length > 0;
  }

  get whereToggleIcon() {
    return this.useAdvancedMode
      ? "utility:toggle_panel_left"
      : "utility:toggle_panel_right";
  }

  get filtersWithOperatorOptions() {
    return this.filters.map((f, index) => ({
      ...f,
      index,
      safeOperators: Array.isArray(f.validOperators)
        ? f.validOperators
        : [
            { label: "=", value: "=" },
            { label: "!=", value: "!=" }
          ],
      isDisabled: !f.field
    }));
  }

  handleParentSelect(event) {
    try {
      this.selectedParent = event.detail.value || "";
      this.selectedParentObject = parentFieldManager.resolveParentObject(
        this.parentRelationshipOptions,
        this.selectedParent
      );

      if (this.selectedParentObject) {
        console.log(
          "📦 Fetching parent fields for:",
          this.selectedParentObject
        );

        parentFieldManager.fetchFieldsForObject(
          this.selectedParentObject,
          (objectName) =>
            this.fetchParentFields(objectName, this.selectedParent)
        );
      } else {
        console.warn(
          "Could not determine parent object for:",
          this.selectedParent
        );
      }
    } catch (error) {
      console.error("🔥 Error in handleParentSelect:", error);
    }
  }

  handleParentFieldChange(event) {
    this.selectedParentFields = event.detail.value;
    this.updatePreview();
  }

  get hasParentOptions() {
    return this.parentRelationshipOptions?.length > 0;
  }

  //Helper methods
  updatePreview() {
    this.soqlPreview = queryFormatter.generatePreview({
      selectedObject: this.selectedObject,
      selectedFields: this.selectedFields,
      selectedParentFields: this.selectedParentFields,
      filters: this.filters,
      selectedChildFields: this.selectedChildFields,
      rawWhereClause: this.rawWhereClause,
      useAdvancedMode: this.useAdvancedMode
    });
  }

  // 👀 Optional Debug Panel Support

  get stringifiedTableHeaders() {
    return JSON.stringify(
      this.tableColumns?.map((c) => c.fieldName),
      null,
      2
    );
  }
}
