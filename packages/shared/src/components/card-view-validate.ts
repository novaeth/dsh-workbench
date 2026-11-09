/**
 * 跑一遍 schema 卡的运行时形状检查：空数组 = 可用；否则是给人看的原因。
 * 模块产物是 JS，类型挡不住漏字段或拼错的 section，外壳在挂卡之前用这条挡一次。
 */
export function cardViewProblemsOf(value: unknown): readonly string[] {
  const reasons: string[] = [];
  if (!isRecord(value)) return ['CardView 必须是对象'];

  if (value.version !== 1) reasons.push('CardView.version 必须是 1');
  if (!isText(value.titleKey)) reasons.push('titleKey 必须是非空字符串');
  if (value.idleKey !== undefined && typeof value.idleKey !== 'string') {
    reasons.push('idleKey 必须是字符串');
  }
  if (value.meta !== undefined && typeof value.meta !== 'function') {
    reasons.push('meta 必须是函数');
  }
  checkPlatform(value.platform, reasons);
  if (value.platformOf !== undefined && typeof value.platformOf !== 'function') {
    reasons.push('platformOf 必须是函数');
  }
  if (value.refreshMs !== undefined && !(typeof value.refreshMs === 'number' && value.refreshMs > 0)) {
    reasons.push('refreshMs 必须是正数');
  }
  checkRead(value.read, reasons);
  checkSections(value.sections, reasons);
  checkSettings(value.settings, reasons);
  checkActions(value.actions, reasons);
  if (value.custom !== undefined && typeof value.custom !== 'function') {
    reasons.push('custom 必须是函数');
  }
  if (value.customBody !== undefined && typeof value.customBody !== 'function') {
    reasons.push('customBody 必须是函数');
  }
  if (value.customLongTask !== undefined && typeof value.customLongTask !== 'function') {
    reasons.push('customLongTask 必须是函数');
  }
  return reasons;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function checkPlatform(value: unknown, reasons: string[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    reasons.push('platform 必须是对象');
    return;
  }
  if (!isText(value.href)) reasons.push('platform.href 必须是非空字符串');
  if (!isText(value.labelKey)) reasons.push('platform.labelKey 必须是非空字符串');
}

function checkRead(value: unknown, reasons: string[]): void {
  if (!isRecord(value)) {
    reasons.push('read 必须是对象');
    return;
  }
  if (!isText(value.route)) reasons.push('read.route 必须是非空字符串');
  if (
    value.query !== undefined &&
    !isRecord(value.query) &&
    typeof value.query !== 'function'
  ) {
    reasons.push('read.query 必须是对象或函数');
  }
  if (value.fact !== undefined && typeof value.fact !== 'string') {
    reasons.push('read.fact 必须是字符串');
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'function') {
    reasons.push('read.enabled 必须是函数');
  }
  if (typeof value.map !== 'function') reasons.push('read.map 必须是函数');
}

function checkSections(value: unknown, reasons: string[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    reasons.push('sections 必须是对象');
    return;
  }
  const known = new Set(['metrics', 'rows', 'activity', 'longTask']);
  for (const [key, section] of Object.entries(value)) {
    if (!known.has(key)) {
      reasons.push(`不认识的 section：${key}`);
    } else if (typeof section !== 'function') {
      reasons.push(`sections.${key} 必须是函数`);
    }
  }
}

function checkSettings(value: unknown, reasons: string[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    reasons.push('settings 必须是对象');
    return;
  }
  if (!isText(value.gearKey)) reasons.push('settings.gearKey 必须是非空字符串');
  if (value.labelKey !== undefined && typeof value.labelKey !== 'string') {
    reasons.push('settings.labelKey 必须是字符串');
  }
  if (!isText(value.titleKey)) reasons.push('settings.titleKey 必须是非空字符串');
  checkFields(value.fields, reasons);
  if (typeof value.values !== 'function') reasons.push('settings.values 必须是函数');
  checkSave(value.save, reasons);
  checkLabels(value.labels, reasons);
}

function checkFields(value: unknown, reasons: string[]): void {
  if (!Array.isArray(value)) {
    reasons.push('settings.fields 必须是数组');
    return;
  }
  value.forEach((field, index) => {
    if (!isRecord(field)) {
      reasons.push(`settings.fields[${String(index)}] 必须是对象`);
      return;
    }
    if (!isText(field.key)) reasons.push(`settings.fields[${String(index)}].key 必须是非空字符串`);
    if (!isText(field.labelKey)) {
      reasons.push(`settings.fields[${String(index)}].labelKey 必须是非空字符串`);
    }
    if (field.hintKey !== undefined && typeof field.hintKey !== 'string') {
      reasons.push(`settings.fields[${String(index)}].hintKey 必须是字符串`);
    }
    if (field.kind === 'select') {
      if (
        field.options === undefined &&
        field.optionsOf === undefined &&
        field.load === undefined
      ) {
        reasons.push(`settings.fields[${String(index)}] 要有 options / optionsOf / load`);
      }
      if (field.options !== undefined) checkOptions(field.options, index, reasons);
      if (field.optionsOf !== undefined && typeof field.optionsOf !== 'function') {
        reasons.push(`settings.fields[${String(index)}].optionsOf 必须是函数`);
      }
      if (field.load !== undefined) checkLoad(field.load, index, reasons);
      if (field.search !== undefined && typeof field.search !== 'boolean') {
        reasons.push(`settings.fields[${String(index)}].search 必须是布尔值`);
      }
      return;
    }
    if (field.kind !== 'text') {
      reasons.push(`settings.fields[${String(index)}].kind 只支持 select / text`);
      return;
    }
    if (field.placeholderKey !== undefined && typeof field.placeholderKey !== 'string') {
      reasons.push(`settings.fields[${String(index)}].placeholderKey 必须是字符串`);
    }
  });
}

function checkOptions(value: unknown, index: number, reasons: string[]): void {
  if (!Array.isArray(value)) {
    reasons.push(`settings.fields[${String(index)}].options 必须是数组`);
    return;
  }
  value.forEach((option, optionIndex) => {
    if (!isRecord(option)) {
      reasons.push(`settings.fields[${String(index)}].options[${String(optionIndex)}] 必须是对象`);
      return;
    }
    if (!isText(option.value)) {
      reasons.push(
        `settings.fields[${String(index)}].options[${String(optionIndex)}].value 必须是非空字符串`,
      );
    }
    if (!isText(option.labelKey) && !isText(option.label)) {
      reasons.push(
        `settings.fields[${String(index)}].options[${String(optionIndex)}] 要有 label 或 labelKey`,
      );
    }
  });
}

function checkLoad(value: unknown, index: number, reasons: string[]): void {
  if (!isRecord(value)) {
    reasons.push(`settings.fields[${String(index)}].load 必须是对象`);
    return;
  }
  if (!isText(value.route)) {
    reasons.push(`settings.fields[${String(index)}].load.route 必须是非空字符串`);
  }
  if (
    value.query !== undefined &&
    !isRecord(value.query) &&
    typeof value.query !== 'function'
  ) {
    reasons.push(`settings.fields[${String(index)}].load.query 必须是对象或函数`);
  }
  if (typeof value.pick !== 'function') {
    reasons.push(`settings.fields[${String(index)}].load.pick 必须是函数`);
  }
}

function checkSave(value: unknown, reasons: string[]): void {
  if (!isRecord(value)) {
    reasons.push('settings.save 必须是对象');
    return;
  }
  if (!isText(value.route)) reasons.push('settings.save.route 必须是非空字符串');
  if (typeof value.body !== 'function') reasons.push('settings.save.body 必须是函数');
  if (value.openWhen !== undefined && typeof value.openWhen !== 'function') {
    reasons.push('settings.openWhen 必须是函数');
  }
}

function checkLabels(value: unknown, reasons: string[]): void {
  if (!isRecord(value)) {
    reasons.push('settings.labels 必须是对象');
    return;
  }
  for (const key of ['cancelKey', 'saveKey', 'savingKey', 'failedKey']) {
    if (!isText(value[key])) reasons.push(`settings.labels.${key} 必须是非空字符串`);
  }
}

function checkActions(value: unknown, reasons: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    reasons.push('actions 必须是数组');
    return;
  }
  value.forEach((action, index) => {
    if (!isRecord(action)) {
      reasons.push(`actions[${String(index)}] 必须是对象`);
      return;
    }
    if (!isText(action.labelKey) && !isText(action.label)) {
      reasons.push(`actions[${String(index)}] 要有 label 或 labelKey`);
    }
    if (action.kind === 'open-url') {
      if (!isText(action.href)) reasons.push(`actions[${String(index)}].href 必须是非空字符串`);
      return;
    }
    if (action.kind === 'chat') {
      if (!isRecord(action.chip) || !isText(action.chip.kind) || !Array.isArray(action.chip.parts)) {
        reasons.push(`actions[${String(index)}].chip 要有 kind 与 parts`);
      }
      if (
        action.chip !== undefined &&
        isRecord(action.chip) &&
        action.chip.label !== undefined &&
        typeof action.chip.label !== 'string'
      ) {
        reasons.push(`actions[${String(index)}].chip.label 必须是字符串`);
      }
      return;
    }
    if (action.kind !== 'retry') {
      reasons.push(`actions[${String(index)}].kind 只支持 open-url / retry / chat`);
    }
  });
}
