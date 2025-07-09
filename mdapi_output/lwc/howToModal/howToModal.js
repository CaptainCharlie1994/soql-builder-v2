import { LightningElement, api, track } from "lwc";

export default class HowToModal extends LightningElement {
  @track isOpen = false;
  @track showAdvanced = false;

  @api open() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }

  handleTryExample(event) {
    const soql = event.target.dataset.soql;
    const tryEvent = new CustomEvent("tryexample", {
      detail: soql
    });
    this.dispatchEvent(tryEvent);
  }

  toggleAdvanced(event) {
    this.showAdvanced = event.target.checked;
  }
}
