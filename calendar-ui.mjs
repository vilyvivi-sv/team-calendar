const COLLABORATION_HUE = 272;
const UNASSIGNED_HUE = 215;

/** Offer direct file writes only on secure pages with the File System Access API. */
export function getFilePickerStrategy(environment) {
  return environment?.isSecureContext === true && typeof environment.showOpenFilePicker === 'function'
    ? 'native'
    : 'file-input';
}

/** Turn picker failures into instructions users can act on. */
export function describeFilePickerError(error) {
  if (error?.name === 'AbortError') return '没有选择到日历文件。请使用兼容选择入口再试一次。';
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return '浏览器阻止了直接连接文件。请使用兼容选择入口，继续用网页编辑。';
  }
  return `连接日历文件失败：${error?.message || '请确认选择的是克隆仓库中的 calendar.json。'}`;
}

/** Convert free-text owner entries into individual member names. */
export function splitOwners(value) {
  return [...new Set(String(value || '').split(/[、，,；;]+/).map(name => name.trim()).filter(Boolean))];
}

/** Keep old or unknown status values usable while exposing only two statuses. */
export function normalizeStatus(status) {
  return status === 'done' ? 'done' : 'todo';
}

function ownerHash(name) {
  // FNV-1a gives each name a reproducible starting hue across browsers.
  let hash = 2166136261;
  for (const character of name) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

function hueIsDistinct(hue, used) {
  return used.every(other => {
    const gap = Math.abs(hue - other);
    return Math.min(gap, 360 - gap) >= 24;
  });
}

/** Keep persisted member colors and assign distinct, repeatable hues to new names. */
export function buildOwnerColorMap(events, savedColors = {}) {
  const colors = {};
  for (const [name, value] of Object.entries(savedColors || {})) {
    const hue = Number(value);
    if (name.trim() && Number.isInteger(hue) && hue >= 0 && hue < 360) colors[name] = hue;
  }

  const used = Object.values(colors);
  const names = [...new Set((events || []).filter(row => !row.deleted_at).flatMap(row => splitOwners(row.owner)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  for (const name of names) {
    if (Object.hasOwn(colors, name)) continue;
    let hue = ownerHash(name);
    // Walk the color wheel only if a new member's initial hue is too close to an existing one.
    for (let step = 0; step < 360 && !hueIsDistinct(hue, used); step += 1) hue = (hue + 137) % 360;
    colors[name] = hue;
    used.push(hue);
  }
  return colors;
}

function colorPair(hue) {
  return { color: `hsl(${hue} 68% 90%)`, borderColor: `hsl(${hue} 42% 73%)` };
}

/** Provide a consistent color for a single owner, shared task, or unassigned task. */
export function getOwnerPresentation(owner, colors = {}) {
  const names = splitOwners(owner);
  if (names.length > 1) return { kind: 'collaboration', label: '多人合作', ...colorPair(COLLABORATION_HUE) };
  if (names.length === 0) return { kind: 'unassigned', label: '未指定', ...colorPair(UNASSIGNED_HUE) };
  const name = names[0];
  return { kind: 'person', label: name, ...colorPair(Number.isInteger(colors[name]) ? colors[name] : ownerHash(name)) };
}
