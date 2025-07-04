import { LightningElement, track, wire } from "lwc";
import getQueryableObjects from "@salesforce/apex/SoqlBuilderHelper.getQueryableObjects";
import getFieldsForObject from "@salesforce/apex/SoqlBuilderHelper.getFieldsForObject";
import runQuery from "@salesforce/apex/SoqlBuilderHelper.runQuery";
import getChildRelationships from "@salesforce/apex/SoqlBuilderHelper.getChildRelationships";
import getChildObjectMappings from "@salesforce/apex/relationshipResolver.getChildObjectMappings";
import emailCsv from "@salesforce/apex/exportController.emailCsv";

//Imports of Modularised code.
import debugFormatter from "c/debugFormatter";
import operatorResolver from "c/operatorResolver";
import parentFieldManager from "c/parentFieldManager";
import queryFormatter from "c/queryFormatter";
import resultFlattener from "c/resultFlattener";
import { filterOptions } from "c/listFilterUtils";

//Import Salesforce Utility
import { getRecord } from "lightning/uiRecordApi";
import USER_ID from "@salesforce/user/Id";
import EMAIL_FIELD from "@salesforce/schema/User.Email";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

export default class SoqlBuilder extends LightningElement {
  constructor() {
    super();
    // for each key in state, define this[key] → this.state[key]
    Object.keys(this.state).forEach((k) => {
      Object.defineProperty(this, k, {
        get() {
          return this.state[k];
        },
        set(v) {
          this.state[k] = v;
        },
        configurable: true,
        enumerable: true
      });
    });
    this.rawResult = [];
  }

  @track state = {
    // 1) object picker
    objectOptions: [],
    selectedObject: "",

    // 2) field selector
    fieldOptions: [],
    filteredFieldOptions: [],
    selectedFields: [],

    // 3) parent relationship & fields
    parentRelationshipOptions: [],
    filteredParentRelOptions: [],
    selectedParent: "",
    parentFieldOptions: [],
    filteredParentFieldOptions: [],
    selectedParentFields: [],

    // 4) child relationships & fields
    childRelationships: [],
    selectedRelationships: [],
    childFieldOptions: {}, // { rel: [opts] }
    filteredChildFieldOptions: {}, // { rel: [opts] }
    selectedChildFields: {}, // { rel: [values] }

    // 5) WHERE‐clause filters
    filters: [
      {
        id: "filter-0",
        field: "",
        operator: "=",
        value: "",
        validOperators: operatorResolver.getOperatorOptions("")
      }
    ],
    useAdvancedMode: false,
    rawWhereClause: "",

    // 6) ORDER/LIMIT controls
    limit: 500,
    orderByField: "",
    orderDirection: "ASC",

    // 7) misc toggles
    includeNonObjects: false,
    dualListBoxReady: false,

    // 8) query results & preview
    soqlPreview: null,
    queryResults: [],
    tableColumns: [],
    relationshipToSObjectMap: {},
    fieldMetadata: {}
  };

  //Instantiate placeholders.
  userEmail = "";

  connectedCallback() {
    console.log(
      "parentRelOptions →",
      JSON.stringify(this.parentRelationshipOptions),
      "filteredParentRelOptions →",
      JSON.stringify(this.filteredParentRelOptions),
      "selectedRelationships →",
      JSON.stringify(this.selectedRelationships)
    );
  }

  //Wired objects to invoke Apex Classes.
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

  //-----------HANDLES----------------------
  //Called when the user selects an object from "Select Object"
  handleObjectChange(event) {
    this.selectedObject = event.detail.value;

    // Reset UI state
    this.dualListBoxReady = false;
    this.fieldOptions = [];
    this.filteredFieldOptions = [];
    this.selectedFields = [];
    this.parentRelationshipOptions = [];
    this.filteredParentRelOptions = [];
    this.selectedParent = "";
    this.childRelationships = [];
    this.selectedRelationships = [];
    this.childFieldOptions = {};
    this.selectedChildFields = {};

    if (!this.selectedObject) {
      console.warn("No object selected—skipping field fetch.");
      return;
    }

    getFieldsForObject({ objectApiName: this.selectedObject })
      .then((fields) => {
        // ── a) Build field metadata ─────────────────────────────────────
        console.log(JSON.stringify(fields));
        this.fieldMetadata = fields.reduce((m, f) => {
          if (f?.name) m[f.name] = f.type;
          return m;
        }, {});
        [
          "CreatedDate",
          "LastModifiedDate",
          "SystemModstamp",
          "OwnerId"
        ].forEach((name) => {
          if (!this.fieldMetadata[name]) {
            this.fieldMetadata[name] =
              name === "OwnerId" ? "Reference" : "DateTime";
          }
        });

        // ── b) Main fields list ─────────────────────────────────────────
        const fieldOpts = fields
          .filter((f) => f?.name)
          .map((f) => ({ label: f.label || f.name, value: f.name }))
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { numeric: true })
          );

        this.fieldOptions = fieldOpts;
        this.filteredFieldOptions = [...fieldOpts];
        this.selectedFields = [];

        // c) Parent-relationship list
        const relOpts = fields
          .filter(
            (f) =>
              (f.type || "").toLowerCase() === "reference" && f.relationshipName
          )
          .map((f) => {
            const refLabel = (f.referenceTo || "Unknown").split(",").join(", ");
            return parentFieldManager.formatRelationshipOption(f, refLabel);
          })
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { numeric: true })
          );

        this.parentRelationshipOptions = relOpts;
        this.filteredParentRelOptions = [...relOpts];
        this.parentFieldOptions = relOpts;
        this.filteredParentFieldOptions = [...relOpts];
        this.selectedParent = "";
        this.selectedParentFields = [];

        // d) Ready & follow‐ons
        this.dualListBoxReady = true;
        this.updatePreview();
        this.fetchChildRelationships();
        this.fetchRelationshipMappings();
      })
      .catch((error) => {
        console.error("Error fetching fields:", error);
        this.dualListBoxReady = false;
      });
  }

  wiredParentRels({ data }) {
    this.parentRelationshipOptions = data.map(/* … */);
    this.filteredParentRelOptions = [...this.parentRelationshipOptions];
  }

  // After loading parent fields:
  fetchParentFields(/* … */) {
    // … on success:
    this.parentFieldOptions = optionsList;
    this.filteredParentFieldOptions = [...optionsList];
  }

  handleRelationshipSelection(event) {
    const newSelection = event.detail.value;

    // Remove deselected relationships
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

    // Collect promises for any new relationships that need field fetching
    const fetchPromises = newSelection.map((rel) => {
      if (!this.childFieldOptions[rel]) {
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
      return Promise.resolve().then(() => this.updatePreview()); // Already loaded
    });

    // ✅ Wait for all fetches to complete before updating preview
    Promise.all(fetchPromises).then(() => {
      this.updatePreview();
    });
  }

  handleChildFieldSelection(event) {
    const rel = event.target.name;
    const selected = event.detail.value;

    this.selectedChildFields = {
      ...this.selectedChildFields,
      [rel]: selected
    };
    console.log("Child fields for", rel, ":", this.selectedChildFields[rel]);
    //Add a promise resolve to stop this being called before the render tick.
    Promise.resolve().then(() => {
      this.updatePreview();
    });
  }

  handleFieldSelection(event) {
    const incoming = event.detail?.value || [];

    // Apply validated selections
    const validSet = new Set(this.fieldOptions.map((o) => o.value));
    this.selectedFields = incoming.filter((v) => validSet.has(v));
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
      useAdvancedMode: this.useAdvancedMode,
      fieldMetadata: this.fieldMetadata,
      orderByField: this.orderByField,
      orderDirection: this.orderDirection,
      limit: this.limit
    });

    debugFormatter.log("🧪 Full SOQL query", fullQuery);

    console.log("Running SOQL:", this.soqlPreview);
    runQuery({ soql: fullQuery })
      .then((data) => {
        this.rawResult = data;
        debugFormatter.log("resultFlattener type", typeof resultFlattener);
        const { rows, headers } = resultFlattener.flattenResults(
          data,
          this.selectedParentFields,
          this.selectedChildFields
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
      const { rows, headers } = resultFlattener.flattenResults(
        this.rawResult,
        this.selectedParentFields,
        this.selectedChildFields
      );
      const cleanData = JSON.parse(JSON.stringify(rows));
      const cleanHeaders = JSON.parse(JSON.stringify(headers));

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

  handleParentSelect(event) {
    try {
      this.selectedParent = event.detail.value || "";
      this.selectedParentObject = parentFieldManager.resolveParentObject(
        this.parentRelationshipOptions,
        this.selectedParent
      );

      if (this.selectedParentObject) {
        this.selectedParentObject;

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

  handleToggleInclude(event) {
    this.includeNonObjects = event.target.checked;
    this.filterObjectList(); // Recalculate dropdown
  }

  handleControlsUpdate(event) {
    const { orderByField, orderDirection, limit } = event.detail;
    this.orderByField = orderByField;
    this.orderDirection = orderDirection;
    this.limit = limit;

    this.updatePreview();
  }

  handleOptionsSearch(event) {
    const listType = event.target.dataset.listType;
    const term = event.target.value;

    if (listType === "main") {
      this.filteredFieldOptions = filterOptions(this.fieldOptions, term);
    } else if (listType === "parentField") {
      this.filteredParentFieldOptions = filterOptions(
        this.parentFieldOptions,
        term
      );
    } else if (listType === "child") {
      const original =
        this.childFieldOptions[event.target.dataset.optionsKey] || [];
      this.filteredChildFieldOptions = {
        ...this.filteredChildFieldOptions,
        [event.target.dataset.optionsKey]: filterOptions(original, term)
      };
    }
  }

  //-----------------HELPERS----------------------------
  updatePreview() {
    if (!this.selectedObject || !this.selectedFields?.length) {
      this.soqlPreview = null;
      return;
    }
    this.soqlPreview = queryFormatter.generatePreview({
      selectedObject: this.selectedObject,
      selectedFields: this.selectedFields,
      selectedParentFields: this.selectedParentFields,
      filters: this.filters,
      selectedChildFields: this.selectedChildFields,
      rawWhereClause: this.rawWhereClause,
      useAdvancedMode: this.useAdvancedMode,
      fieldMetadata: this.fieldMetadata,
      orderByField: this.orderByField,
      orderDirection: this.orderDirection,
      limit: this.limit
    });
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
    this.filters = [...this.filters, newFilter];
  }

  filterObjectList() {
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

  showToast(title, message, variant) {
    this.dispatchEvent(
      new ShowToastEvent({
        title,
        message,
        variant
      })
    );
  }

  addChildFieldConfig(rel, fields) {
    const options = fields
      .map((f) => ({
        label: `${f.name} (${f.type})`,
        value: f.name
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const selected = this.selectedChildFields?.[rel] || ["Id"];

    this.childFieldOptions = {
      ...this.childFieldOptions,
      [rel]: options
    };

    this.selectedChildFields = {
      ...this.selectedChildFields,
      [rel]: selected
    };

    this.filteredChildFieldOptions = {
      ...this.filteredChildFieldOptions,
      [rel]: options
    };

    Promise.resolve(() => {
      this.updatePreview();
    });
  }

  //--------FETCHES--------------------
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

      this.parentFieldOptions = fields
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
        debugFormatter.log("Fetched child relationships raw", result);
        this.childRelationships = result.map((rel) => ({
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

  //----------TOGGLES-----------------
  toggleWhereMode() {
    this.useAdvancedMode = !this.useAdvancedMode;
  }
  //-------- GETTERS AND SETTERS ---------------------
  get showFieldSelector() {
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

  get visibleResults() {
    return this.queryResults?.slice(0, 50) || [];
  }

  get showExportNotice() {
    return this.queryResults?.length > 50;
  }
  // 👀 Optional Debug Panel Support

  get stringifiedTableHeaders() {
    return JSON.stringify(
      this.tableColumns?.map((c) => c.fieldName),
      null,
      2
    );
  }

  get childFieldConfigs() {
    return Object.keys(this.childFieldOptions).map((rel) => {
      const original = this.childFieldOptions[rel] || [];
      const filtered = this.filteredChildFieldOptions[rel];
      return {
        rel: rel,
        label: `${rel} (expandable...)`,
        options: Array.isArray(filtered) ? filtered : original,
        selected: this.selectedChildFields[rel] || []
      };
    });
  }

  get hasParentOptions() {
    return this.parentRelationshipOptions?.length > 0;
  }

  get openChildSections(){
    return this.selectedRelationships || [];
  }

  get shouldShowParentSection() {
  return this.selectedObject && (this.hasParentOptions || this.selectedParent);
}
get shouldShowChildSection(){
  return this.selectedObject && thischildFieldConfigs;
}
}
