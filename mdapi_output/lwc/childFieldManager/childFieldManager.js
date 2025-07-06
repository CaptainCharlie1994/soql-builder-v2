export default class childFieldManager {
  static buildOptions(fields = []) {
    return fields.map(f => ({
      label: `${f.name} (${f.type})`,
      value: f.name
    }));
  }

  static buildConfig(rel, fields = [], selectedMainFields = []) {
    return {
      rel,
      options: this.buildOptions(fields),
      selected: selectedMainFields.length > 0 ? selectedMainFields : ['Id']
    };
  }
}