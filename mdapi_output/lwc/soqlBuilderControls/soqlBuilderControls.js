import { LightningElement, track } from 'lwc';

export default class SoqlBuilderControls extends LightningElement {
  @track limit = 500;
  @track orderByField = '';
  @track orderDirection = '';

  availableFields = [
    {label: '-- Select Field --', value: ''},
    { label: 'Name', value: 'Name' },
    { label: 'Created Date', value: 'CreatedDate' },
    { label: 'Last Modified', value: 'LastModifiedDate' }
  ]; 

  directionOptions = [
    { label: 'Ascending', value: 'ASC' },
    { label: 'Descending', value: 'DESC' }
  ];

  handleOrderByChange(event) {
  this.orderByField = event.target.value;
  this.dispatchUpdate();
}

handleOrderDirectionChange(event) {
  this.orderDirection = event.target.value;
  this.dispatchUpdate();
}

handleLimitChange(event) {
  this.limit = parseInt(event.target.value, 10);
  this.dispatchUpdate();
}

dispatchUpdate() {
  this.dispatchEvent(new CustomEvent('controlsupdate', {
    detail: {
      orderByField: this.orderByField,
      orderDirection: this.orderDirection,
      limit: this.limit
    }
  }));
}
}