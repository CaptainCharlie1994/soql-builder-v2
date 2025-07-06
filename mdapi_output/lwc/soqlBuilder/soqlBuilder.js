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
import resultFlattener from "c/resultFlattener";

import { getRecord } from "lightning/uiRecordApi";
import USER_ID from "@salesforce/user/Id";
import EMAIL_FIELD from "@salesforce/schema/User.Email";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

export default class SoqlBuilder extends LightningElement {
  constructor() {
    super();
    this.rawResult = [];
  }

  @track objectOptions = [];
  @track selectedMainFields = [];
  @track mainFieldOptions = [];
  @track childRelOptions = [];
  @track selectedChildRels = [];
  @track childRelFieldOptions = {};
  @track selectedChildRelFields = {};
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

  @track soqlPreview = null;
  @track queryResults = null;
  @track tableColumns = [];
  @track relationshipToSObjectMap = {};
  @track mainFieldMetadata = [];
  @track parentRelFieldOptions = [];
  @track dualListBoxReady = false;
  @track parentRelOptions = [];
  @track includeNonObjects = false;
  @track selectedObject;

  userEmail = "";
  useAdvancedMode = false;
  rawWhereClause = "";
  selectedParentRels = "";

  @wire(getQueryableObjects)
  wiredObjects({ error, data }) {
    if (data) {
      console.log("🧾 Raw object list received:", data);
      this.rawObjectList = [...data];
      this.filterObjectList();
    } else {
      console.error("❌ Error fetching objects:", error);
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

    this.fieldOptionsReady = false;
    this.mainFieldOptions = [];
    this.selectedMainFields = [];
    this.childRelOptions = [];
    this.selectedChildRels = [];
    this.childRelFieldOptions = {};
    this.selectedChildRelFields = {};
    this.childFieldConfigs = [];

    if (!this.selectedObject) {
      console.warn("No object selected - skipping field fetch.");
      return;
    }

    getFieldsForObject({ objectApiName: this.selectedObject })
      .then((fields) => {
        //── Store field metadata ─────────────────────────────────────────────
        this.mainFieldMetadata = fields.reduce((meta, field) => {
          if (field?.name) meta[field.name] = field.type;
          return meta;
        }, {});
        [
          ["CreatedDate", "DateTime"],
          ["LastModifiedDate", "DateTime"],
          ["SystemModstamp", "DateTime"],
          ["OwnerId", "Reference"]
        ].forEach(([name, type]) => {
          if (!this.mainFieldMetadata[name]) {
            this.mainFieldMetadata[name] = type;
          }
        });

        //── Main mainFieldOptions, sorted by label ───────────────────────────────
        this.mainFieldOptions = fields
          .filter((f) => f?.name)
          .map((f) => ({
            label: f.label || f.name,
            value: f.name
          }))
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, {
              numeric: true,
              sensitivity: "base"
            })
          );
        this.selectedMainFields = []; // reset selection

        //── Parent relationship options, mapped & sorted by label ────────────
        this.parentRelOptions = fields
          .filter(
            (f) =>
              (f.type || "").toLowerCase() === "reference" && f.relationshipName
          )
          .map((field) => {
            const refLabel = (field.referenceTo || "Unknown")
              .split(",")
              .join(", ");
            return parentFieldManager.formatRelationshipOption(field, refLabel);
          })
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, {
              numeric: true,
              sensitivity: "base"
            })
          );
        console.log("Soql Preview Value: " + this.soqlPreview);
        console.log("queryResults:", this.queryResults);
        this.updatePreview();
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
        this.parentRelFieldOptions = [];
        return;
      }

      this.parentRelFieldOptions = fields
        .map((f) => ({
          label: f.label || f.name,
          value: `${relationshipName}.${f.name}`
        }))
        .sort((a, b) =>
          a.label.localeCompare(b.label, undefined, {
            numeric: true,
            sensitivity: "base"
          })
        );
    });
  }

  fetchChildRelationships() {
    getChildRelationships({ objectApiName: this.selectedObject })
      .then((result) => {
        this.childRelOptions = result.map((rel) => ({
          label: rel,
          value: rel
        }));
      })
      .catch((error) => {
        console.error("Error fetching child relationships:", error);
        debugFormatter.log("❌ Error details", error);
      });
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

    // Remove deselected relationships
    const removed = this.selectedChildRels.filter(
      (r) => !newSelection.includes(r)
    );
    removed.forEach((rel) => {
      delete this.childRelFieldOptions[rel];
      this.selectedChildRelFields = {
        ...this.selectedChildRelFields,
        [rel]: ["Id"]
      };
    });

    this.selectedChildRels = newSelection;

    // Collect promises for any new relationships that need field fetching
    const fetchPromises = newSelection.map((rel) => {
      if (!this.childRelFieldOptions[rel]) {
        const sObjectName = this.relationshipToSObjectMap?.[rel] || rel;
        debugFormatter.log(`Fetching child fields for ${rel}`, sObjectName);
        return getFieldsForObject({ objectApiName: sObjectName })
          .then((fields) => {
            this.addChildFieldConfig(rel, fields);
          })
          .catch((error) =>
            console.error(`Error fetching fields for ${rel}:`, error)
          );
      }
      return Promise.resolve(); // Already loaded
    });

    // ✅ Wait for all fetches to complete before updating preview
    Promise.all(fetchPromises).then(() => {
      this.updatePreview();
    });
  }

  addChildFieldConfig(rel, fields) {
    const options = fields
      .map((f) => ({
        label: `${f.name} (${f.type})`,
        value: f.name
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const selected = this.selectedChildRelFields?.[rel] || ["Id"];

    this.childRelFieldOptions = {
      ...this.childRelFieldOptions,
      [rel]: options
    };

    this.selectedChildRelFields = {
      ...this.selectedChildRelFields,
      [rel]: selected
    };

    this.updateChildConfigs();
    Promise.resolve(() => {
      this.updatePreview();
    });
  }

  updateChildConfigs() {
    this.childFieldConfigs = this.selectedChildRels.map((rel) => ({
      rel,
      options: this.childRelFieldOptions?.[rel] || [],
      selected: this.selectedChildRelFields?.[rel] || ["Id"]
    }));
  }

  handleChildFieldRelChange(event) {
    const rel = event.target.name;
    const selected = event.detail.value;

    this.selectedChildRelFields = {
      ...this.selectedChildRelFields,
      [rel]: selected
    };
    console.log("Child fields for", rel, ":", this.selectedChildRelFields[rel]);
    this.updateChildConfigs();
    //Add a promise resolve to stop this being called before the render tick.
    Promise.resolve().then(() => {
      this.updatePreview();
    });
  }

  handleMainFieldSelection(event) {
    const incoming = event.detail?.value || [];

    // Apply validated selections
    const validSet = new Set(this.mainFieldOptions.map((o) => o.value));
    this.selectedMainFields = incoming.filter((v) => validSet.has(v));
    this.updatePreview();
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
    if (!this.selectedObject || !this.selectedMainFields?.length) {
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
      selectedMainFields: this.selectedMainFields,
      selectedParentRelFields: this.selectedParentRelFields,
      filters: this.filters,
      selectedChildRelFields: this.selectedChildRelFields,
      rawWhereClause: this.rawWhereClause,
      useAdvancedMode: this.useAdvancedMode,
      mainFieldMetadata: this.mainFieldMetadata // ⬅️ Critical for correct formatting
    });

    debugFormatter.log("🧪 Full SOQL query", fullQuery);

    runQuery({ soql: fullQuery })
      .then((data) => {
        this.rawResult = data;
        debugFormatter.log("resultFlattener type", typeof resultFlattener);
        const { rows, headers } = resultFlattener.flattenResults(
          data,
          this.selectedParentRelFields,
          this.selectedChildRelFields
        );

        console.table(rows);
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

          this.queryResults = [];
          this.tableColumns = [];
        }
      })
      .catch((error) => {
        debugFormatter.log("❌ runQuery failed", error);

        console.log("Error body message:", error?.body?.message);
        console.log("Error stack:", error?.stack);
        console.log("Error name:", error?.name);

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
    if (!this.queryResults || this.queryResults.length === 0) {
      this.showToast("Warning", "No data to export.", "warning");
      return;
    }

    this.showToast("info", "Preparing CSV for export...", "info");

    try {
      debugFormatter.log("⚙️ Pre-flatten rawResult", this.rawResult);
      debugFormatter.log("Selected parent fields", this.selectedParentRelFields);
      debugFormatter.log("Selected child fields", this.selectedChildRelFields);

      const { rows, headers } = resultFlattener.flattenResults(
        this.rawResult,
        this.selectedParentRelFields,
        this.selectedChildRelFields
      );
      const cleanData = JSON.parse(JSON.stringify(rows));
      const cleanHeaders = JSON.parse(JSON.stringify(headers));
      const payloadSize = JSON.stringify(cleanData).length;

      const result = await emailCsv({
        objectName: this.selectedObject,
        data: cleanData,
        headers: cleanHeaders,
        recipientEmail: this.userEmail
      });
      debugFormatter.log("Email Address3 : ", this.userEmail);
      debugFormatter.log("Email result3 : ", result);
      debugFormatter.log("Raw Data:3 ", this.rawResult);

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
    return this.selectedObject && this.mainFieldOptions.length > 0;
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

  handleParentRelSelection(event) {
    try {
      this.selectedParentRels = event.detail.value || "";
      this.selectedParentObject = parentFieldManager.resolveParentObject(
        this.parentRelOptions,
        this.selectedParentRels
      );

      if (this.selectedParentObject) {
        this.selectedParentObject;

        parentFieldManager.fetchFieldsForObject(
          this.selectedParentObject,
          (objectName) =>
            this.fetchParentFields(objectName, this.selectedParentRels)
        );
      } else {
        console.warn(
          "Could not determine parent object for:",
          this.selectedParentRels
        );
      }
    } catch (error) {
      console.error("🔥 Error in handleParentRelSelection:", error);
    }
  }

  handleParentRelFieldChange(event) {
    this.selectedParentRelFields = event.detail.value;
    this.updatePreview();
  }

  get hasParentOptions() {
    return this.parentRelOptions?.length > 0;
  }

  handleToggleInclude(event) {
    console.log("Toggle Fired:", event?.target?.checked);
    this.includeNonObjects = event.target.checked;
    this.filterObjectList(); // Recalculate dropdown
  }

  filterObjectList() {
    console.log("🔁 Toggle changed:", this.includeNonObjects);

    const skipThesePatterns = [
      /feed$/i,
      /history$/i,
      /share$/i,
      /definition$/i,
      /log$/i,
      /^aura/i,
      /^scontrol$/i,
      /^flow/i,
      /license$/i,
      /bundle$/i,
      /metric$/i,
      /template$/i,
      /info$/i,
      /relation$/i,
      /^active/i,
      /^additional/i
    ];

    let filtered = [...this.rawObjectList];

    if (!this.includeNonObjects) {
      filtered = filtered.filter(
        (obj) => !skipThesePatterns.some((regex) => regex.test(obj))
      );
    }

    this.selectedObject = null;

    this.objectOptions = filtered
      .map((apiName) => ({
        label: apiName,
        value: apiName
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, {
          numeric: true,
          sensitivity: "base"
        })
      );
  }

  //Helper methods
  updatePreview() {
    if (!this.selectedObject || !this.selectedMainFields?.length) {
      this.soqlPreview = null;
      return;
    }
    this.soqlPreview = queryFormatter.generatePreview({
      selectedObject: this.selectedObject,
      selectedMainFields: this.selectedMainFields,
      selectedParentRelFields: this.selectedParentRelFields,
      filters: this.filters,
      selectedChildRelFields: this.selectedChildRelFields,
      rawWhereClause: this.rawWhereClause,
      useAdvancedMode: this.useAdvancedMode
    });
  }

  get childFieldConfigs() {
    return Object.keys(this.childRelFieldOptions).map((rel) => ({
      rel,
      options: this.childRelFieldOptions[rel],
      selected: this.selectedChildRelFields[rel] || []
    }));
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
