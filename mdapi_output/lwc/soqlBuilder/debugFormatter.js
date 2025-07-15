// debugFormatter.js

function getCircularReplacer() {
  const seen = new WeakSet();
  return (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return;
      seen.add(value);
    }
    return value;
  };
}

export function stringify(obj) {
  try {
    return typeof obj === 'string'
      ? obj
      : JSON.stringify(obj, getCircularReplacer(), 2);
  } catch (e) {
    return `Error stringifying object: ${e?.message || e}`;
  }
}

export function log(label, value) {
  console.log(`${label}:`, stringify(value));
}