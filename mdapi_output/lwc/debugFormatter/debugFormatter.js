export default class debugFormatter {
  static getCircularReplacer() {
    const seen = new WeakSet();
    return (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return;
        seen.add(value);
      }
      return value;
    };
  }

  static stringify(obj) {
    try {
      return JSON.stringify(obj, debugFormatter.getCircularReplacer(), 2);
    } catch (e) {
      return `Error stringifying object: ${e?.message || e}`;
    }
  }

  static log(label, value) {
    console.log(`${label}:`, debugFormatter.stringify(value));
  }
}