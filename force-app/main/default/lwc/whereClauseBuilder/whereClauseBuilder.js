// whereClauseBuilder.js
import { LightningElement, api } from "lwc";
import { updateFilter, createNewFilter } from "c/whereClauseManager";

export default class WhereClauseBuilder extends LightningElement {
  @api filters = [];
  @api useAdvancedMode = false;
  @api rawWhereClause = "";
  @api context = "main";
  @api availableFields = [];

  handleChange(event) {
    const index = parseInt(event.target.dataset.index, 10);
    const field = event.target.name;
    const value = event.target.value;

    this.filters = updateFilter(this.filters, index, field, value);
    this.dispatchEvent(
      new CustomEvent("filterchange", {
        detail: {
          rel: this.context,
          filters: this.filters
        }
      })
    );
  }

  addFilter() {
    this.filters = [...this.filters, createNewFilter()];
    this.dispatchEvent(
      new CustomEvent("addfilter", {
        detail: {
          rel: this.context,
          filters: this.filters
        }
      })
    );
  }

  handleRemove(event) {
    const index = parseInt(event.target.dataset.index, 10);
    this.filters = removeFilter(this.filters, index);
    this.dispatchEvent(
      new CustomEvent("removefilter", {
        detail: {
          rel: this.context,
          filters: this.filters
        }
      })
    );
  }

  handleRawChange(event) {
    this.rawWhereClause = event.detail.value;
    this.dispatchEvent(
      new CustomEvent("rawchange", {
        detail: {
          rel: this.context,
          value: this.rawWhereClause
        }
      })
    );
  }

  toggleMode() {
    this.useAdvancedMode = !this.useAdvancedMode;
    this.dispatchEvent(
      new CustomEvent("togglemode", {
        detail: {
          rel: this.context,
          value: this.useAdvancedMode
        }
      })
    );
  }
}
