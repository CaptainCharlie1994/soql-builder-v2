import { LightningElement, track, wire } from "lwc";
import getQueryableObjects from "@salesforce/apex/SoqlBuilderHelper.getQueryableObjects";
import getFieldsForObject from "@salesforce/apex/SoqlBuilderHelper.getFieldsForObject";
import runQuery from "@salesforce/apex/SoqlBuilderHelper.runQuery";
import getChildRelationships from "@salesforce/apex/SoqlBuilderHelper.getChildRelationships";
import getSoqlPreview from "@salesforce/apex/SoqlBuilderHelper.getSoqlPreview";
import getChildObjectMappings from "@salesforce/apex/relationshipResolver.getChildObjectMappings";
import emailCsv from "@salesforce/apex/exportController.emailCsv";

//Imports of Modularised code.
import debugFormatter from "c/debugFormatter";
import operatorResolver from "c/operatorResolver";
import parentFieldManager from "c/parentFieldManager";
import resultFlattener from "c/resultFlattener";
import { filterOptions } from "c/listFilterUtils";
import { debounce } from "c/debounce";
import { computeUIValues } from "./soqlBuilderGetters";

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
    // 1) Object Picker
    objectOptions: [],
    selectedObject: "",

    // 2) Main Fields
    mainFieldOptions: [],
    filteredFieldOptions: [],
    selectedMainFields: [],
    mainFieldMetadata: {},

    // 3) Parent Relationships
    parentRelOptions: [],
    filteredParentRelOptions: [],
    selectedParentRels: [],
    parentRelFieldOptions: {},
    filteredParentRelFieldOptions: {},
    selectedParentRelFields: {},

    // 4) Child Relationships
    childRelOptions: [],
    selectedChildRels: [],
    childRelFieldOptions: {},
    filteredChildFieldOptions: {},
    selectedChildRelFields: {},

    // 5) WHERE Clause Filters
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

    // 6) ORDER BY / LIMIT
    limit: 500,
    orderByField: "",
    orderDirection: "ASC",

    // 7) Misc Toggles
    includeNonObjects: false,
    dualListBoxReady: false,
    isPanelOpen: false,
    showAllWhereFields: false,

    // 8) Query Results & Preview
    soqlPreview: null,
    queryResults: [],
    tableColumns: [],
    relationshipToSObjectMap: {}
  };

  //Instantiate placeholders.
  userEmail = "";

  connectedCallback() {
    this.debouncedUpdatePreview = debounce(this.updatePreview.bind(this), 300);
    console.log("✅ soqlBuilder component mounted");
    console.log("🚀 soqlBuilder connectedCallback fired");
  }
  renderedCallback() {
  console.log('✅ soqlBuilder rendered');
}

  //Wired objects to invoke Apex Classes.
  @wire(getQueryableObjects)
  wiredObjects({ error, data }) {
    if (data) {
      //console.log("🧾 Raw object list received:", data);
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

  // ------------- MAIN OBJECT ----------------------
  handleObjectChange(event) {
    this.selectedObject = event.detail.value;

    // Reset UI state
    this.dualListBoxReady = false;
    this.mainFieldOptions = [];
    this.filteredFieldOptions = [];
    this.selectedMainFields = [];
    this.parentRelOptions = [];
    this.filteredParentRelOptions = [];
    this.selectedParentRels = "";
    this.childRelOptions = [];
    this.selectedChildRels = [];
    this.childRelFieldOptions = {};
    this.selectedChildRelFields = {};
    this.selectedParentRelFields = {};

    if (!this.selectedObject) {
      console.warn("No object selected—skipping field fetch.");
      return;
    }

    getFieldsForObject({ objectApiName: this.selectedObject })
      .then((fields) => {
        // ── a) Build field metadata ─────────────────────────────────────
        this.mainFieldMetadata = fields.reduce((m, f) => {
          if (f?.name) m[f.name] = f.type;
          return m;
        }, {});
        [
          "CreatedDate",
          "LastModifiedDate",
          "SystemModstamp",
          "OwnerId"
        ].forEach((name) => {
          if (!this.mainFieldMetadata[name]) {
            this.mainFieldMetadata[name] =
              name === "OwnerId" ? "Reference" : "DateTime";
          }
        });

        // ── b) Main fields list ─────────────────────────────────────────
        const fieldOpts = fields
          .filter((f) => f?.name)
          .map((f) => ({
            label: `${f.label || f.name} (${f.name})`,
            value: f.name
          }))
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { numeric: true })
          );

        this.mainFieldOptions = fieldOpts;
        this.filteredFieldOptions = [...fieldOpts];
        this.selectedMainFields = [];

        // c) Parent-relationship list
        const relOpts = fields
          .filter(
            (f) =>
              (f.type || "").toLowerCase() === "reference" && f.relationshipName
          )
          .map((f) => {
            const refLabel = (f.referenceTo || "Unknown").split(",").join(", ");
            return parentFieldManager.formatRelationshipOption(f);
          })
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { numeric: true })
          );

        this.parentRelOptions = relOpts;
        this.filteredParentRelOptions = relOpts.map(({ label, value }) => ({
          label,
          value
        }));
        this.parentRelFieldOptions = {};
        this.filteredParentRelFieldOptions = {};
        this.selectedParentRels = [];
        this.selectedParentRelFields = [];

        console.log(
          "📦 parentRelOptions:",
          JSON.stringify(this.parentRelOptions)
        );
        console.log(
          "📦 filteredParentRelOptions:",
          JSON.stringify(this.filteredParentRelOptions)
        );
        console.log(
          "📦 selectedParentRels:",
          JSON.stringify(this.selectedParentRels)
        );

        // d) Ready & follow‐ons
        this.dualListBoxReady = true;
        this.debouncedUpdatePreview();
        this.fetchChildRelationships();
        this.fetchRelationshipMappings();
      })
      .catch((error) => {
        console.error("Error fetching fields:", error);
        this.dualListBoxReady = false;
      });
  }

  handleMainFieldSelection(event) {
    const incoming = event.detail?.value || [];

    const validSet = new Set(this.mainFieldOptions.map((o) => o.value));
    const expandedFields = incoming.flatMap((field) => {
      if (!validSet.has(field)) return [];

      const fieldType = this.mainFieldMetadata[field];
      if (fieldType === "Reference") {
        return [`${field}.Name`];
      }
      return [field];
    });

    this.selectedMainFields = expandedFields;
    this.debouncedUpdatePreview();
  }

  //--------FETCHES--------------------

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

  // --------------- PARENT SELECTION --------------------
  handleParentRelSelection(event) {
    const previousSelectedParentRels = this.selectedParentRels;
    const newSelection = event.detail.value;

    // Remove deselected Parent Objects
    const removed = previousSelectedParentRels.filter(
      (rel) => !newSelection.includes(rel)
    );
    removed.forEach((rel) => {
      delete this.parentRelFieldOptions[rel];
      delete this.filteredParentRelFieldOptions[rel];
      delete this.selectedParentRelFields[rel];
    });

    // Update selection
    this.selectedParentRels = newSelection;

    // Fetch fields for newly added relationships
    const fetchPromises = newSelection.map((rel) => {
      const parentObj = parentFieldManager.resolveParentObject(
        this.parentRelOptions,
        rel
      );
      if (!parentObj) {
        console.warn(`⚠️ Could not resolve parent object for: ${rel}`);
        return Promise.resolve();
      }

      return getFieldsForObject({ objectApiName: parentObj })
        .then((fields) => this.addParentFieldConfig(rel, fields))
        .catch((error) =>
          console.error(`Error fetching parent fields for ${rel}`, error)
        );
    });

    Promise.all(fetchPromises).then(() => {
      this.debouncedUpdatePreview();
    });
  }

  handleParentRelFieldChange(event) {
    const rel = event.target.name;
    const selected = event.detail.value;
    console.log(
      "this.selectedParentFields: ",
      JSON.stringify(this.selectParentFields)
    );
    console.log("selected: ", JSON.stringify(selected));

    this.selectedParentRelFields = {
      ...this.selectedParentRelFields,
      [rel]: selected
    };

    Promise.resolve().then(() => {
      this.debouncedUpdatePreview();
    });
  }

  addParentFieldConfig(rel, fields) {
    const options = fields
      .map((f) => ({
        label: `${f.label || f.name} (${f.name})`,
        value: `${rel}.${f.name}`
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const selected = this.selectParentRelFields?.[rel] || [`${rel}.Id`];

    this.parentRelFieldOptions = {
      ...this.parentRelFieldOptions,
      [rel]: options
    };

    this.selectedParentRelFields = {
      ...this.selectedParentRelFields,
      [rel]: selected
    };

    this.filteredParentRelFieldOptions = {
      ...this.filteredParentRelFieldOptions,
      [rel]: options
    };

    this.debouncedUpdatePreview();
  }

  // ----------------- CHILD SELECTION --------------------
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

    removed.forEach((rel) => {
      delete this.parentRelFieldOptions[rel];
      this.selectedParentRelFields = {
        ...this.selectedParentRelFields,
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
      return Promise.resolve().then(() => this.updatePreview()); // Already loaded
    });

    // ✅ Wait for all fetches to complete before updating preview
    Promise.all(fetchPromises).then(() => {
      this.debouncedUpdatePreview();
    });
  }

  handleChildFieldRelChange(event) {
    const rel = event.target.name;
    const selected = event.detail.value;

    this.selectedChildRelFields = {
      ...this.selectedChildRelFields,
      [rel]: selected
    };
    console.log("Child fields for", rel, ":", this.selectedChildRelFields[rel]);
    //Add a promise resolve to stop this being called before the render tick.
    Promise.resolve().then(() => {
      this.debouncedUpdatePreview();
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

  addChildFieldConfig(rel, fields) {
    const options = fields
      .map((f) => ({
        label: `${f.label || f.name} (${f.name})`,
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

    this.filteredChildFieldOptions = {
      ...this.filteredChildFieldOptions,
      [rel]: options
    };

    Promise.resolve(() => {
      this.debouncedUpdatePreview();
    });
  }

  // ----------------- COMMON OBJECT/FIELD METHODS ---------------
  handleOptionsSearch(event) {
    const listType = event.target.dataset.listType;
    const term = event.target.value;

    if (listType === "main") {
      this.filteredFieldOptions = filterOptions(this.mainFieldOptions, term);
    } else if (listType === "parentField") {
      this.filteredParentRelFieldOptions = filterOptions(
        this.parentRelFieldOptions,
        term
      );
    } else if (listType === "child") {
      const original =
        this.childRelFieldOptions[event.target.dataset.optionsKey] || [];
      this.filteredChildFieldOptions = {
        ...this.filteredChildFieldOptions,
        [event.target.dataset.optionsKey]: filterOptions(original, term)
      };
    }
  }

  // -----------------WHERE CLAUSE -------------------------------

  handleFilterChange(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10);
    const field = event.target.name;
    const value = event.target.value;

    const updated = [...this.filters];
    const filter = { ...updated[index], [field]: value };
    console.log("This is the filter current value: " + JSON.stringify(filter));

    // If changing the field, recalculate operators
    if (field === "field") {
      filter.validOperators = operatorResolver.getOperatorOptions(filter.field);
      if (!filter.operator) {
        filter.operator = "="; // fallback
      }
    }

    updated[index] = filter;
    this.filters = updated;
    console.log("This.filters: " + JSON.stringify(this.filters));
    this.debouncedUpdatePreview();
  }

  handleRemoveFilter(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10);
    this.filters = this.filters.filter((_, i) => i !== index);
    this.debouncedUpdatePreview();
  }

  handleWhereInputChange(event) {
    this.rawWhereClause = event.detail.value;
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

    this.debouncedUpdatePreview();
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
  // -----------------SOQL PREVIEW -------------------------------

  handleBuildQuery() {
    if (!this.selectedObject || !this.selectedMainFields?.length) {
      this.soqlPreview = "";
      this.queryResults = [];
      this.tableColumns = [];
      return;
    }
    if (!this.isPanelOpen) {
      this.isPanelOpen = true;
    }

    this.getSoqlQueryFromApex()
      .then((fullQuery) => {
        this.soqlPreview = fullQuery;
        return runQuery({ soql: fullQuery });
      })
      .then((data) => {
        console.log(
          "✅ handleBuildQuery-> getSoqlQueryFromApex().then()-> Query results received:",
          JSON.stringify(data, null, 2)
        );
        this.rawResult = data;
        //Persist and pass on the header order of the query
        const fieldOrder = [
          ...this.selectedMainFields,
          ...Object.values(this.selectedParentRelFields || {}).flat(),
          ...Object.entries(this.selectedChildRelFields || {}).flatMap(
            ([rel, fields]) =>
              Array.from({ length: 5 }, (_, i) =>
                fields.map((f) => `${rel}_${i + 1}_${f}`)
              ).flat()
          )
        ];

        const { rows, headers, childOverflowDetected } =
          resultFlattener.flattenResults(
            data,
            this.selectedParentRelFields,
            this.selectedChildRelFields,
            fieldOrder
          );

        if (!Array.isArray(rows)) {
          console.error("❌ Flattened result is invalid:", { rows, headers });
          this.queryResults = [];
          this.tableColumns = [];
          this.showToast("Error", "Failed to process query results.", "error");
          return;
        }

        this.queryResults = rows;
        this.tableColumns = headers.map((header) => ({
          label: header,
          fieldName: header
        }));

        if (rows.length === 0) {
          this.showToast(
            "No Results",
            "This query returned 0 records.",
            "info"
          );
          this.queryResults = [];
          this.tableColumns = [];
        }
      })
      .catch((error) => {
        console.error(
          "❌ runQuery failed:",
          error?.body?.message || error.message || error
        );
        this.queryResults = [];
        this.tableColumns = [];
        this.showToast(
          "SOQL Error",
          error?.body?.message ||
            "An error occurred while executing the query.",
          "error"
        );
      });
  }

  updatePreview() {
    if (!this.selectedObject || !this.selectedMainFields?.length) {
      this.soqlPreview = null;
      return;
    }

    this.getSoqlQueryFromApex()
      .then((soql) => {
        this.soqlPreview = soql;
      })
      .catch((error) => {
        console.error("❌ Failed to build SOQL preview:", error);
        this.soqlPreview = "Error building query";
      });
  }

  getSoqlQueryFromApex() {
    const flattenedParentFields = Object.values(
      this.selectedParentRelFields || {}
    )
      .flat()
      .filter(Boolean);
    const payload = {
      objectApiName: this.selectedObject,
      selectedMainFields: this.selectedMainFields,
      selectedParentRelFields: flattenedParentFields,
      filtersJson: JSON.stringify(
        this.filters.map((f) => ({
          field: f.field,
          operator: f.operator,
          value: f.value
        }))
      ),
      selectedChildRelFields: this.selectedChildRelFields,
      useAdvancedMode: this.useAdvancedMode,
      rawWhereClause: this.rawWhereClause,
      orderByField: this.orderByField,
      orderDirection: this.orderDirection,
      queryLimit: this.limit
    };

    return getSoqlPreview(payload);
  }
  // ------------------EXPORT FUNCTIONALITY-----------------------

  async handleExport() {
    if (!this.queryResults || this.queryResults.length === 0) {
      this.showToast("Warning", "No data to export.", "warning");
      return;
    }

    this.showToast("info", "Preparing CSV for export...", "info");

    try {
      const fieldOrder = [
        ...this.selectedMainFields,
        ...Object.values(this.selectedParentRelFields || {}).flat(),
        ...Object.entries(this.selectedChildRelFields || {}).flatMap(
          ([rel, fields]) =>
            Array.from({ length: 5 }, (_, i) =>
              fields.map((f) => `${rel}_${i + 1}_${f}`)
            ).flat()
        )
      ];

      const { rows, headers } = resultFlattener.flattenResults(
        this.rawResult,
        this.selectedParentRelFields,
        this.selectedChildRelFields,
        fieldOrder
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

  showToast(title, message, variant) {
    this.dispatchEvent(
      new ShowToastEvent({
        title,
        message,
        variant
      })
    );
  }

  //------------------- UI TOGGLES ------------------------------
  toggleWhereMode() {
    this.useAdvancedMode = !this.useAdvancedMode;
  }

  togglePanel() {
    this.isPanelOpen = !this.isPanelOpen;
  }

  handleToggleWhereFieldScope(event) {
    this.showAllWhereFields = event.target.checked;
  }

  //------------------- UTILITY METHODS --------------------------
  get ui() {
  try {
    const values = computeUIValues(this);
    return values;
  } catch (error) {
    console.error("❌ Error in ui getter:", error?.message || error);
    return {};
  }
}

  get groupedWhereFieldOptions() {
    const groups = [];

    // Main object fields
    const mainFields = (
      this.showAllWhereFields
        ? this.mainFieldOptions
        : this.selectedMainFields.map((fieldName) => {
            const match = this.mainFieldOptions.find(
              (f) => f.value === fieldName
            );
            return match || { label: fieldName, value: fieldName };
          })
    ).map((f) => ({
      label: `${f.label || f.value} (${f.value})`,
      value: f.value
    }));

    if (mainFields.length) {
      groups.push({
        label: "Main Object Fields",
        options: mainFields
      });
    }

    // Parent fields
    const parentGroups = Object.entries(
      this.showAllWhereFields
        ? this.parentRelFieldOptions
        : this.selectedParentRelFields
    );

    parentGroups.forEach(([rel, fields]) => {
      const options = fields.map((f) => {
        const fieldName = this.showAllWhereFields ? f.value : f;
        const label = this.showAllWhereFields
          ? f.label
          : fieldName.split(".").pop();
        return {
          label: `${label} (${fieldName})`,
          value: fieldName
        };
      });

      if (options.length) {
        groups.push({
          label: `${rel} (Parent)`,
          options
        });
      }
    });
    console.log(
      "📦 Grouped WHERE field options:",
      JSON.stringify(groups, null, 2)
    );
    return groups;
  }

  get flatWhereFieldOptions() {
    const grouped = this.groupedWhereFieldOptions;
    return grouped.flatMap((group) =>
      group.options.map((opt) => ({
        label: `${group.label} — ${opt.label}`,
        value: opt.value
      }))
    );
  }
}
