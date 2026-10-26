const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function mondayOf(value) {
  const date = new Date(`${value}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

/** Estimate wrapped color-legend rows before allocating the export canvas. */
export function countLegendRows(labels, { maxWidth, measureText, itemPadding = 43 } = {}) {
  if (typeof measureText !== 'function' || !Number.isFinite(maxWidth) || maxWidth <= 0) throw new TypeError('图例宽度参数无效。');
  let rows = 0, usedWidth = 0;
  for (const label of labels || []) {
    const itemWidth = measureText(String(label)) + itemPadding;
    if (usedWidth > 0 && usedWidth + itemWidth > maxWidth) { rows += 1; usedWidth = 0; }
    usedWidth += itemWidth;
  }
  return Math.max(1, rows + (usedWidth > 0 ? 1 : 0));
}

/** Build a Monday-first image grid; each returned segment contains display-safe fields only. */
export function buildExportGrid({ events = [], startDate, endDate, baseWeekHeight = 112, laneHeight = 38 } = {}) {
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) {
    throw new TypeError('导出日期范围无效。');
  }

  const firstDay = mondayOf(startDate);
  const lastDay = addDays(mondayOf(endDate), 6);
  const weeks = [];
  for (let weekStart = firstDay; weekStart <= lastDay; weekStart = addDays(weekStart, 7)) {
    weeks.push({ startDate: weekStart, days: Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), segments: [], rowCount: 0, height: baseWeekHeight });
  }

  const visible = events
    .filter(row => row && !row.deleted_at && row.title && isValidDate(row.start_date) && isValidDate(row.end_date)
      && row.start_date <= endDate && row.end_date >= startDate && row.end_date >= row.start_date)
    .map(row => ({
      id: String(row.id || ''), title: String(row.title), owner: String(row.owner || ''),
      status: row.status === 'done' ? 'done' : 'todo', startDate: row.start_date < startDate ? startDate : row.start_date,
      endDate: row.end_date > endDate ? endDate : row.end_date,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.title.localeCompare(b.title, 'zh-CN'));

  for (const task of visible) {
    for (const week of weeks) {
      const start = task.startDate > week.startDate ? task.startDate : week.startDate;
      const end = task.endDate < week.days[6] ? task.endDate : week.days[6];
      if (end < start) continue;
      const startColumn = Math.round((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${week.startDate}T00:00:00Z`)) / DAY_MS);
      const endColumn = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${week.startDate}T00:00:00Z`)) / DAY_MS);
      let lane = 0;
      while (week.segments.some(segment => segment.lane === lane && !(segment.endColumn < startColumn || segment.startColumn > endColumn))) lane += 1;
      week.segments.push({ ...task, startDate: start, endDate: end, startColumn, endColumn, lane });
      week.rowCount = Math.max(week.rowCount, lane + 1);
    }
  }

  for (const week of weeks) week.height = Math.max(baseWeekHeight, 42 + week.rowCount * laneHeight + 24);
  return { startDate, endDate, weeks, baseWeekHeight, laneHeight };
}
