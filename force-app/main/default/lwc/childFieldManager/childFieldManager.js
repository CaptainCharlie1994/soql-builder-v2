export default class childFieldManager {
  static buildOptions(fields = []) {
    return fields.map(f => ({
      label: `${f.name} (${f.type})`,
      value: f.name
    }));
  }

  static buildConfig(rel, fields = [], selectedFields = []) {
    return {
      rel,
      options: this.buildOptions(fields),
      selected: selectedFields.length > 0 ? selectedFields : ['Id']
    };
  }
}