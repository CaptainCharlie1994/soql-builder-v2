export default class debugFormatter {
  static stringify(obj) {
    return JSON.stringify(obj, null, 2);
  }

  static log(label, value) {
    console.log(`${label}:`, debugFormatter.stringify(value));
  }
}