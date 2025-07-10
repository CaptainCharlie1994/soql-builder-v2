// whereClauseBuilder.js
import { LightningElement, api } from "lwc";
import { updateFilter, createNewFilter, removeFilter } from "c/whereClauseManager";

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
    console.log("in handleChange - Event: " , event);
    console.log("in handleChange - Event.Target: ", event.target);
    console.log("in handleChange - Field: ", field);
    console.log("in handleChange - Value: ", value);
    console.log("in handleChange - Index: ", index);


    this.filters = updateFilter(this.filters, index, field, value);
    this.dispatchEvent(
      new CustomEvent("filterchange", {
        detail: {
          rel: this.context,
          filters: this.filters
        },
        bubbles: true,
        composed: true
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
        },
        bubbles: true,
        composed: true
      })
    );
  }

  handleRemove(event) {
    const index = parseInt(event.target.dataset.index, 10);
    this.filters = removeFilter(this.filters, index);
    console.log("hanlde remove has been fired -------------------------");
    this.dispatchEvent(
      new CustomEvent("removefilter", {
        detail: {
          rel: this.context,
          index
        },
        bubbles: true,
        composed: true
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
