import { LightningElement, track, wire } from "lwc";
import getQueryableObjects from "@salesforce/apex/SoqlBuilderHelper.getQueryableObjects";
import getFieldsForObject from "@salesforce/apex/SoqlBuilderHelper.getFieldsForObject";
import getChildRelationships from "@salesforce/apex/SoqlBuilderHelper.getChildRelationships";
import getSoqlPreview from "@salesforce/apex/SoqlBuilderHelper.getSoqlPreview";
import getChildObjectMappings from "@salesforce/apex/relationshipResolver.getChildObjectMappings";
import { showToast } from "./toastUtils";

//Imports of Modularised code.

import parentFieldManager from "c/parentFieldManager";
import { filterOptions } from "c/listFilterUtils";
import { debounce } from "c/debounce";
import { computeUIValues, resetUIState } from "./uiStateBuilder";
import { createNewFilter, removeFilter } from "c/whereClauseManager";

import {
  handleParentRelSelectionHelper,
  handleChildRelSelection
} from "./relationshipHandlers";
import {
  buildPreview,
  buildAndRunQuery,
  exportQueryResults
} from "./queryRunner";

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
    objectSearchTerm: "",
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

    filters: [createNewFilter()],
    useAdvancedMode: false,
    rawWhereClause: "",
    childRawWhere: {},
    childAdvancedMode: {},
    childFilters: {},

    // 6) ORDER BY / LIMIT
    limit: 500,
    orderByField: "",
    orderDirection: "ASC",

    // 7) Misc Toggles
    includeNonObjects: false,
    dualListBoxReady: false,
    isPanelOpen: false,
    showAllWhereFields: false,
    isParentOpen: false,
    isChildOpen: false,
    isWhereOpen: false,
    isPreviewOpen: true,
    isDarkMode: false,

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
    console.log("✅ soqlBuilder rendered");
    if (!this.hasRenderedStyles) {
      setTimeout(() => {
        const style = document.createElement("style");
        style.innerText = `
                ::part(base) .slds-table td,
                ::part(base) .slds-table th {
                    border: 1px solid #d8dde6;
                }
                ::part(base) .slds-table tr:nth-child(even) {
                    background-color: #f2f9ff;
                }
                ::part(base) .slds-table tr:nth-child(odd) {
                    background-color: #ffffff;
                }
            `;
        this.template.appendChild(style);
        this.hasRenderedStyles = true;
      }, 0); // defer until after DOM stabilizes
    }
  }

  //Wired objects to invoke Apex Classes.
  @wire(getQueryableObjects)
  wiredObjects({ error, data }) {
    if (data) {
      //console.log("🧾 Raw object list received:", data);
      this.rawObjectList = [...data];
      console.log(
        "shallow clone of rawObjectList as data ",
        JSON.stringify(data)
      );
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
    console.log("🔁 Resetting UI state...");
    resetUIState(this.state);
    console.log("State after reset", this.state);
    console.log("");

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
    const newSelection = event.detail.value;
    const previousSelection = this.selectedParentRels;

    handleParentRelSelectionHelper({
      newSelection,
      previousSelection,
      parentRelOptions: this.parentRelOptions,
      selectedParentRelFields: this.selectedParentRelFields,
      setState: (updater) => updater(this.state)
    }).then(() => {
      this.debouncedUpdatePreview();
    });
  }

  handleParentRelFieldChange(event) {
    const rel = event.target.name;
    const selected = event.detail.value;
    console.log("handeParentRelFieldChange -> selected: ", selected);

    this.selectedParentRelFields = {
      ...this.selectedParentRelFields,
      [rel]: selected
    };

    Promise.resolve().then(() => {
      this.debouncedUpdatePreview();
    });
  }

  addParentFieldConfig(rel, fields) {
    const options = buildFieldOptions(fields, rel);

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
    const previousSelection = this.selectedChildRels;

    handleChildRelSelection({
      newSelection,
      previousSelection,
      relationshipToSObjectMap: this.relationshipToSObjectMap,
      childRelFieldOptions: this.childRelFieldOptions,
      selectedChildRelFields: this.selectedChildRelFields,
      setState: (updater) => updater(this.state)
    }).then(() => {
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
        console.log("❌ Error details", error);
      });
  }

  addChildFieldConfig(rel, fields) {
    const options = buildFieldOptions(fields);

    const selectedOptions = this.selectedChildRelFields?.[rel] || ["Id"];

    this.childRelFieldOptions = {
      ...this.childRelFieldOptions,
      [rel]: options
    };

    this.selectedChildRelFields = {
      ...this.selectedChildRelFields,
      [rel]: selectedOptions
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

    if (listType === "mainField") {
      this.filteredFieldOptions = filterOptions(
        this.mainFieldOptions,
        term,
        this.selectedMainFields
      );
    } else if (listType === "parentField") {
      const rel = event.target.dataset.optionsKey; //Picks the accordian related (or created in a way) by selecting a specific object
      const original = this.parentRelFieldOptions[rel] || []; //Get all the fields related to THAT accordian
      const selected = this.selectedParentRelFields?.[rel] || []; // get all the fields that are currently selected

      this.filteredParentRelFieldOptions = {
        ...this.filteredParentRelFieldOptions,
        [rel]: filterOptions(original, term, selected)
      };
    } else if (listType === "child") {
      const rel = event.target.dataset.optionsKey;
      const original = this.childRelFieldOptions[rel] || [];
      const selected = this.selectedChildRelFields[rel] || [];
      console.log("Selected Child Fields : " + selected);

      this.filteredChildFieldOptions = {
        ...this.filteredChildFieldOptions,
        [rel]: filterOptions(original, term, selected)
      };
    }
  }

  // -----------------WHERE CLAUSE -------------------------------

  handleChildFilterChange(event) {
    const { rel, filters } = event.detail;
    this.childFilters = {
      ...this.childFilters,
      [rel]: filters
    };
    this.debouncedUpdatePreview();
  }

  handleChildRawChange(event) {
    const { rel, value } = event.detail;
    this.childRawWhere = {
      ...this.childRawWhere,
      [rel]: value
    };
    this.debouncedUpdatePreview();
    console.log(
      "This is the new event.detail: " + JSON.stringify(event.detail)
    );
    console.log("This is the new event.detail.value: " + JSON.stringify(value));
  }

  handleChildToggleMode(event) {
    const { rel, value } = event.detail;
    this.childAdvancedMode = {
      ...this.childAdvancedMode,
      [rel]: value
    };
  }
  handleChildAddFilter(event) {
    const { rel, filters } = event.detail;
    this.childFilters = { ...this.childFilters, [rel]: filters };
    this.debouncedUpdatePreview();
  }

  handleChildRemoveFilter(event) {
    const { rel, index } = event.detail; // pull index from detail
    const original = this.childFilters[rel] || [];
    const updated = removeFilter(original, index);
    this.childFilters = {
      ...this.childFilters,
      [rel]: updated
    };
    this.debouncedUpdatePreview();
  }

  handleRemoveFilter(event) {
    const index = parseInt(event.detail.index, 10);
    console.log("Filters before removal: ", JSON.stringify(this.filters));
    this.filters = removeFilter(this.filters, index);
    console.log("Filters after removal: ", this.filters);
    this.debouncedUpdatePreview();
  }
  handleFilterChange(event) {
    this.filters = event.detail.filters;
    this.debouncedUpdatePreview();
  }

  handleWhereInputChange(event) {
    this.rawWhereClause = event.detail.value;
    this.debouncedUpdatePreview();
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
    this.filters = [...this.filters, createNewFilter()];
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
      //this.includeNonObjects is a flag used for the Object Selector.
      filtered = filtered.filter(
        (obj) => !skipThesePatterns.some((regex) => regex.test(obj.value))
      );
    }
    if (this.objectSearchTerm && this.objectSearchTerm.length > 1) {
      console.log("if clause entered but may fail: ");
      filtered = filtered.filter(
        ({ label, value }) =>
          label.toLowerCase().includes(this.objectSearchTerm) ||
          value.toLowerCase().includes(this.objectSearchTerm)
      );
      console.log(
        "state of the filtered object list whilst searching: ",
        JSON.stringify(filtered)
      );
    }

    this.selectedObject = null;

    this.objectOptions = [...filtered];
    this.objectOptions = filtered.map(({ label, value }) => ({
      label: `${label} (${value})`,
      value
    }));
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

    buildAndRunQuery(this.state)
      .then(({ soql, rawResult, rows, headers, childOverflowDetected }) => {
        this.soqlPreview = soql;
        this.rawResult = rawResult;

        if (!Array.isArray(rows)) {
          this.queryResults = [];
          this.tableColumns = [];
          showToast(this, "Error", "Failed to process query results.", "error");
          return;
        }

        this.queryResults = rows;
        this.tableColumns = headers.map((header) => ({
          label: header,
          fieldName: header
        }));

        if (rows.length === 0) {
          showToast(
            this,
            "No Results",
            "This query returned 0 records.",
            "info"
          );
          this.queryResults = [];
          this.tableColumns = [];
        }
      })
      .catch((error) => {
        console.error("❌ runQuery failed:", error);
        this.queryResults = [];
        this.tableColumns = [];
        showToast(
          this,
          "SOQL Error",
          error?.body?.message ||
            "An error occurred while executing the query.",
          "error"
        );
      });
  }

  updatePreview() {
    const hasValidMainFields =
      Array.isArray(this.selectedMainFields) &&
      this.selectedMainFields.length > 0;
    const hasValidObject =
      typeof this.selectedObject === "string" &&
      this.selectedObject.trim().length > 0;

    if (!hasValidObject || !hasValidMainFields) {
      console.warn("🛑 Skipping preview update—missing object or fields.");
      return;
    }

    buildPreview(this.state).then((soql) => {
      this.soqlPreview = soql;
      console.log("🧪 In BuildPreview Call Object:", this.selectedObject);
      console.log(
        "🧪 In BuildPreview Call Main Fields:",
        this.selectedMainFields
      );
      console.log(
        "🧪 Child Fields:",
        JSON.stringify(this.selectedChildRelFields)
      );
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
          value: f.value,
          connector: f.connector
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
      showToast(this, "Warning", "No data to export.", "warning");
      return;
    }

    showToast(this, "info", "Preparing CSV for export...", "info");

    try {
      const result = await exportQueryResults(
        this.state,
        this.rawResult,
        this.userEmail
      );

      if (result?.success) {
        showToast(this, "success", result.message, "success");
      } else {
        const errMsg = result?.message || "Email failed without message.";
        console.error("❌ Apex reported failure:", errMsg);
        showToast(this, "error", errMsg, "error");
      }
    } catch (error) {
      const fallback =
        error?.body?.message || error?.message || "Unknown export error";
      console.error("🔥 Uncaught export error:", fallback);
      showToast(this, "error", fallback, "error");
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
    console.log("isPanelOpen:", this.isPanelOpen);
    console.log("leftPanelClass:", this.ui.leftPanelClass);
  }

  handleToggleWhereFieldScope(event) {
    this.showAllWhereFields = event.target.checked;
  }

  toggleParentSection() {
    this.isParentOpen = !this.isParentOpen;
  }

  toggleChildSection() {
    this.isChildOpen = !this.isChildOpen;
  }

  toggleWhereSection() {
    this.isWhereOpen = !this.isWhereOpen;
  }

  togglePreviewSection() {
    this.isPreviewOpen = !this.isPreviewOpen;
  }

  toggleHelpModal() {
    this.template.querySelector("c-how-to-modal").open();
  }

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    const host = this.template.host;
    if (this.isDarkMode) {
      host.classList.add("dark-mode");
    } else {
      host.classList.remove("dark-mode");
    }
  }

  toggleReset() {
    resetUIState(this);
    this.selectedObject = null;
    this.queryResults = [];
    this.tableColumns = [];
    this.rawResult = [];
    this.soqlPreview = null;

    this.isPanelOpen = false;
    this.isDarkMode = false;
    this.includeNonObjects = false;

    this.limit = 500;
    this.orderByField = "";
    this.orderDirection = "ASC";
    this.objectSearchTerm = "";

    showToast(
      this,
      "Query Reset",
      "Builder state has been cleared.",
      "success"
    );
  }

  handleObjectSearchInput(event) {
    try {
      this.objectSearchTerm = event.target.value;
      this.filterObjectList();
    } catch (error) {
      console.error("Search handler error:", error?.message || error);
    }
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

  get flattenedRowResults() {
    return this.ui.visibleResults.map((row, index) => {
      return {
        id: row.Id,
        rowNumber: index + 1,
        cells: this.tableColumns.map((col) => ({
          key: col.fieldName,
          value: row[col.fieldName]
        }))
      };
    });
  }
}
