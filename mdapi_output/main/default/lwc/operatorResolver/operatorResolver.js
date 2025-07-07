export default class operatorResolver {
  static getOperatorOptions(fieldType = '') {
    const common = ['=', '!='];

    const opsByType = {
      string: ['=', '!=', 'LIKE'],
      picklist: ['=', '!='],
      reference: ['=', '!='],
      boolean: ['='],
      int: ['=', '!=', '>', '<', '>=', '<='],
      double: ['=', '!=', '>', '<', '>=', '<='],
      currency: ['=', '!=', '>', '<', '>=', '<='],
      date: ['=', '!=', '>', '<', '>=', '<=', 'TODAY', 'LAST_N_DAYS:30'],
      datetime: ['=', '!=', '>', '<', '>=', '<=']
    };

    const safeType = fieldType.toLowerCase();
    const ops = opsByType[safeType] || common;

    return ops.map(op => ({ label: op, value: op }));
  }
}