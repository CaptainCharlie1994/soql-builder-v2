// toastUtils.js
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

/**
 * Dispatches a Lightning toast message from a component.
 *
 * @param {LightningElement} component - The LWC component (`this`)
 * @param {string} title - The toast title
 * @param {string} message - The toast message
 * @param {string} [variant='info'] - One of 'info', 'success', 'warning', 'error'
 */
export function showToast(component, title, message, variant = 'info') {
  component.dispatchEvent(
    new ShowToastEvent({
      title,
      message,
      variant
    })
  );
}