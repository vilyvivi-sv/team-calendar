import { buildOwnerColorMap, canEditLocally, getOwnerPresentation, normalizeStatus, splitOwners } from './calendar-ui.mjs';
import { buildExportGrid, countLegendRows } from './export-calendar.mjs';
import { buildReadonlyCalendarHtml } from './readonly-export.mjs';

const $ = id => document.getElementById(id);
const states = { todo: '待办', done: '已完成' };
// GitHub Pages does not provide a writable server. Keep this standalone calendar in this browser only.
const browserStorage = location.protocol === 'https:' || location.hostname.endsWith('github.io');
const browserStorageKey = 'spdb-team-calendar-browser-workbench:v1';
const mobile = matchMedia('(max-width: 767px)');
const state = { calendar: null, events: [], ownerColors: {}, filterTimer: null, saving: false, loaded: false, dataRevision: 0, initialDateSelected: false };
const addDays = (date, n) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + n); return value.toISOString().slice(0, 10); };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const mondayOf = date => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

function announce(message, warning = false) {
  $('statusBanner').textContent = message;
  $('statusBanner').hidden = !message;
  $('statusBanner').classList.toggle('warning', warning);
}

function canEdit() { return canEditLocally({ isMobile: mobile.matches, loaded: state.loaded, saving: state.saving }); }
function updateEditingAccess() {
  state.calendar?.setOption('editable', canEdit());
  state.calendar?.setOption('selectable', canEdit());
}
function setSavingControls(disabled) {
  for (const id of ['saveEvent', 'deleteEvent', 'closeEvent', 'refreshButton', 'restoreFile', 'backupCalendar', 'exportMonth', 'exportCustom', 'exportStart', 'exportEnd', 'exportReadonly']) $(id).disabled = disabled;
  document.querySelectorAll('#eventForm input, #eventForm select, #eventForm textarea').forEach(control => { control.disabled = disabled; });
  updateEditingAccess();
}

function activeEvents() { return state.events.filter(row => !row.deleted_at); }
function filteredEvents() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const owner = $('ownerFilter').value;
  const status = $('statusFilter').value;
  return activeEvents().filter(row => (!query || `${row.title} ${row.body || ''} ${row.owner || ''}`.toLocaleLowerCase().includes(query))
    && (!owner || splitOwners(row.owner).includes(owner)) && (!status || normalizeStatus(row.status) === status));
}

/** Hide only completely empty week rows before the first week containing a task. */
function monthContentRange(currentDate) {
  const year = currentDate.getUTCFullYear(), month = currentDate.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
  const firstContentDate = activeEvents()
    .filter(row => row.start_date < nextMonthStart && row.end_date >= monthStart)
    .map(row => row.start_date < monthStart ? monthStart : row.start_date)
    .sort()[0];
  const start = mondayOf(firstContentDate || monthStart);

  // Keep a rolling five-week grid so the first content week has a full month of context after it.
  return { start, end: addDays(start, 35) };
}

function eventToCalendar(row) {
  const presentation = getOwnerPresentation(row.owner, state.ownerColors);
  return { id: row.id, title: row.title, start: row.start_date, end: addDays(row.end_date, 1), allDay: true,
    backgroundColor: presentation.color, borderColor: presentation.borderColor, textColor: '#193252', extendedProps: { row } };
}

function legendItem(label, presentation) {
  const item = document.createElement('span');
  const swatch = document.createElement('i');
  item.className = 'legend-item';
  swatch.className = 'owner-swatch';
  swatch.style.backgroundColor = presentation.color;
  swatch.setAttribute('aria-hidden', 'true');
  item.append(swatch, document.createTextNode(label));
  return item;
}

function updateLegend() {
  const names = [...new Set(activeEvents().flatMap(row => splitOwners(row.owner)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const items = names.map(name => legendItem(name, getOwnerPresentation(name, state.ownerColors)));
  if (activeEvents().some(row => splitOwners(row.owner).length > 1)) items.push(legendItem('多人合作', getOwnerPresentation('多人、合作', state.ownerColors)));
  if (activeEvents().some(row => splitOwners(row.owner).length === 0)) items.push(legendItem('未指定', getOwnerPresentation('', state.ownerColors)));
  $('ownerLegend').replaceChildren(...items);
}

function updateCalendar() {
  if (!state.calendar) return;
  state.calendar.removeAllEvents();
  state.calendar.addEventSource(filteredEvents().map(eventToCalendar));
  const names = [...new Set(activeEvents().flatMap(row => splitOwners(row.owner)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const selected = $('ownerFilter').value;
  $('ownerFilter').replaceChildren(new Option('所有负责人', ''), ...names.map(name => new Option(name, name)));
  $('ownerFilter').value = names.includes(selected) ? selected : '';
  updateLegend();
  $('syncStatus').textContent = `${filteredEvents().length} 项安排 · ${new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} 已更新`;
}

function updateViewButtons() {
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === state.calendar?.view.type;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderCalendar() {
  state.calendar = new FullCalendar.Calendar($('calendar'), {
    initialView: mobile.matches ? 'listMonth' : 'dayGridMonth', initialDate: today(), timeZone: 'UTC', now: () => `${today()}T00:00:00Z`,
    firstDay: 1, headerToolbar: false, height: 'auto', fixedWeekCount: false,
    views: { dayGridMonth: { visibleRange: monthContentRange, dateIncrement: { months: 1 } } },
    locale: { code: 'zh-cn', week: { dow: 1, doy: 4 }, buttonText: { today: '今天', month: '月', week: '周', list: '日程' }, allDayText: '全天', noEventsText: '当前范围暂无工作项' },
    titleFormat: { year: 'numeric', month: 'long' }, dayMaxEvents: false, dayMaxEventRows: false,
    editable: canEdit(), selectable: canEdit(), eventResizableFromStart: true, events: [],
    datesSet: () => { $('calendarTitle').textContent = state.calendar.view.title; updateViewButtons(); },
    dateClick: info => { if (canEdit()) openEditor(null, { start_date: info.dateStr, end_date: info.dateStr }); },
    select: info => { if (canEdit()) openEditor(null, { start_date: info.startStr.slice(0, 10), end_date: addDays(info.endStr.slice(0, 10), -1) }); state.calendar.unselect(); },
    eventClick: info => canEdit() ? openEditor(info.event.extendedProps.row) : showReadOnly(info.event.extendedProps.row), eventDrop: persistDrag, eventResize: persistDrag,
    eventContent: info => {
      const icon = document.createElement('span');
      const title = document.createElement('span');
      const done = normalizeStatus(info.event.extendedProps.row.status) === 'done';
      icon.className = `task-status-icon ${done ? 'is-done' : 'is-todo'}`;
      icon.textContent = done ? '✓' : '○'; icon.setAttribute('aria-hidden', 'true');
      title.className = 'task-event-title'; title.textContent = info.event.title;
      return { domNodes: [icon, title] };
    },
  });
  state.calendar.render();
  updateViewButtons();
}

function applyCalendarData(data) {
  if (data?.schema_version !== 1 || !Array.isArray(data.events)) throw new Error('日历文件格式不正确。');
  state.events = data.events.filter(row => row && typeof row.id === 'string' && typeof row.title === 'string' && row.start_date && row.end_date)
    .map(row => ({ ...row, status: normalizeStatus(row.status) }));
  state.ownerColors = buildOwnerColorMap(state.events, data.owner_colors);
  if (!state.initialDateSelected) {
    const currentDate = today();
    const firstUpcoming = activeEvents()
      .filter(row => row.end_date >= currentDate)
      .map(row => row.start_date < currentDate ? currentDate : row.start_date)
      .sort()[0];
    state.calendar.gotoDate(firstUpcoming || currentDate);
    state.initialDateSelected = true;
  }
  state.loaded = true;
  $('exportReadonly').disabled = false;
  updateEditingAccess();
  updateCalendar();
}

async function readCalendar() {
  if (browserStorage) {
    const stored = localStorage.getItem(browserStorageKey);
    return stored ? JSON.parse(stored) : { schema_version: 1, updated_at: null, owner_colors: {}, events: [] };
  }
  const response = await fetch(`/api/calendar?t=${Date.now()}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `读取日历失败（${response.status}）`);
  return data;
}

async function exportReadonlySnapshot() {
  if (!state.loaded || state.saving) return;
  const readAsset = async path => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`读取页面资源失败：${path}`);
    return response.text();
  };
  try {
    announce('正在生成只读网页…');
    const [calendarScript, calendarCss, workbenchCss] = await Promise.all([
      readAsset('./fullcalendar.global.min.js'), readAsset('./calendar.css'), readAsset('./workbench.css'),
    ]);
    const generatedAt = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
    const html = buildReadonlyCalendarHtml({
      data: { schema_version: 1, initial_date: state.calendar.getDate().toISOString().slice(0, 10), owner_colors: state.ownerColors, events: activeEvents() },
      calendarScript, calendarCss, workbenchCss, generatedAt,
    });
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `团队日历只读快照-${today()}.html`);
    announce('只读网页已下载。文件包含本次导出的日历安排，可直接发给团队查看。');
  } catch (error) {
    announce(`生成只读网页失败：${error.message || '请刷新页面后重试。'}`, true);
  }
}

async function refresh() {
  if (state.saving) return;
  const requestedRevision = state.dataRevision;
  try {
    const data = await readCalendar();
    if (state.saving || requestedRevision !== state.dataRevision) return;
    applyCalendarData(data);
    announce(browserStorage ? '日程只保存在当前浏览器，不会上传。换设备前请下载 JSON 备份。' : '日历已同步保存在此电脑。建议定期下载 JSON 备份。');
  } catch (error) {
    announce(browserStorage
      ? `无法读取当前浏览器中的日历：${error.message || '存储不可用。'} 可尝试“恢复 JSON”导入备份。`
      : `${error.message || '读取日历失败。'} 请检查本机日历服务是否正在运行，再点击刷新。`, true);
    $('syncStatus').textContent = '暂时无法读取';
  }
}

function serialize() { return { schema_version: 1, updated_at: new Date().toISOString(), owner_colors: state.ownerColors, events: state.events }; }

async function saveCalendar({ allowUnloaded = false } = {}) {
  if (!state.loaded && !allowUnloaded) throw new Error('日历尚未成功读取。请先刷新，或使用“恢复 JSON”导入有效备份。');
  if (state.saving) throw new Error('上一项保存仍在进行，请稍后重试。');
  state.dataRevision += 1;
  state.saving = true;
  setSavingControls(true);
  $('syncStatus').textContent = '正在保存…';
  try {
    if (browserStorage) {
      localStorage.setItem(browserStorageKey, JSON.stringify(serialize()));
      applyCalendarData(serialize());
      announce('已保存到当前浏览器。此数据不会与其他设备或成员自动同步，请定期下载 JSON 备份。');
      return;
    }
    const response = await fetch('/api/calendar', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(serialize()) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '保存失败。');
    applyCalendarData(data);
    announce('已保存到本机日历文件。');
  } catch (error) {
    announce(`保存失败，输入内容仍保留在窗口中：${error.message || '请重试。'}`, true);
    throw error;
  } finally {
    state.saving = false;
    setSavingControls(false);
  }
}

function draftFromForm() {
  return { title: $('eventTitle').value.trim(), body: $('eventBody').value, owner: $('eventOwner').value.trim(),
    start_date: $('eventStart').value, end_date: $('eventEnd').value, status: $('eventStatus').value };
}

function openEditor(row, draft = {}) {
  state.editingId = row?.id || null;
  const value = row || draft;
  $('eventHeading').textContent = row ? '编辑工作项' : '新建工作项';
  $('eventTitle').value = value.title || ''; $('eventBody').value = value.body || ''; $('eventOwner').value = value.owner || '';
  $('eventStart').value = value.start_date || today(); $('eventEnd').value = value.end_date || value.start_date || today();
  $('eventStatus').value = normalizeStatus(value.status); $('eventError').textContent = '';
  $('deleteEvent').hidden = !row; $('eventDialog').showModal();
}

async function saveDraft(event) {
  event.preventDefault();
  const draft = draftFromForm();
  if (!draft.title) { $('eventError').textContent = '请填写标题。'; return; }
  if (draft.end_date < draft.start_date) { $('eventError').textContent = '结束日期不能早于开始日期。'; return; }
  const index = state.events.findIndex(row => row.id === state.editingId);
  if (index < 0) {
    const now = new Date().toISOString();
    const row = { id: crypto.randomUUID(), ...draft, created_at: now, updated_at: now };
    state.events.push(row); state.editingId = row.id;
  } else state.events[index] = { ...state.events[index], ...draft, updated_at: new Date().toISOString() };
  try { await saveCalendar(); $('eventDialog').close(); }
  catch (error) { $('eventError').textContent = error.message; }
}

async function persistDrag(info) {
  if (state.saving) { info.revert(); return; }
  const row = state.events.find(item => item.id === info.event.id);
  if (!row) { info.revert(); return; }
  const previous = { start_date: row.start_date, end_date: row.end_date, updated_at: row.updated_at };
  row.start_date = info.event.startStr.slice(0, 10);
  row.end_date = addDays(info.event.endStr.slice(0, 10), -1);
  row.updated_at = new Date().toISOString();
  try { await saveCalendar(); }
  catch { Object.assign(row, previous); info.revert(); updateCalendar(); }
}

async function deleteEvent() {
  const row = state.events.find(item => item.id === state.editingId);
  if (!row || !confirm('将此工作项移入回收站？')) return;
  const previous = { deleted_at: row.deleted_at, updated_at: row.updated_at };
  row.deleted_at = new Date().toISOString(); row.updated_at = row.deleted_at;
  try { await saveCalendar(); $('eventDialog').close(); }
  catch (error) { Object.assign(row, previous); $('eventError').textContent = error.message; updateCalendar(); }
}

function showReadOnly(row) {
  $('readTitle').textContent = row.title; $('readDates').textContent = `${row.start_date} 至 ${row.end_date}`;
  $('readOwner').textContent = `负责人：${row.owner || '未指定'}`; $('readStatus').textContent = `状态：${states[row.status] || states.todo}`;
  $('readBody').textContent = row.body || '无备注'; $('readDialog').showModal();
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadBackup() {
  downloadBlob(new Blob([`${JSON.stringify(serialize(), null, 2)}\n`], { type: 'application/json' }), `calendar-backup-${today()}.json`);
  announce('已下载 JSON 备份。');
}

async function restoreBackup() {
  const file = $('restoreFile').files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (imported?.schema_version !== 1 || !Array.isArray(imported.events)) throw new Error('文件格式不正确。');
    if (!confirm(`将用备份文件中的 ${imported.events.length} 条记录替换当前日历，是否继续？`)) return;
    const previous = serialize();
    state.events = imported.events; state.ownerColors = buildOwnerColorMap(state.events, imported.owner_colors);
    try { await saveCalendar({ allowUnloaded: true }); announce(`已从 ${file.name} 恢复日历。`); }
    catch (error) { state.events = previous.events; state.ownerColors = previous.owner_colors; updateCalendar(); throw error; }
  } catch (error) { announce(`恢复失败：${error.message || '文件无法读取。'}`, true); }
  finally { $('restoreFile').value = ''; }
}

function canvasText(context, value, x, y, maxWidth) {
  let text = String(value || '');
  if (context.measureText(text).width <= maxWidth) { context.fillText(text, x, y); return; }
  while (text && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  context.fillText(`${text}…`, x, y);
}

function exportCalendar(startDate, endDate, label) {
  try {
    const grid = buildExportGrid({ events: activeEvents(), startDate, endDate });
    const scale = 2, width = 1540, margin = 54, headerHeight = 170;
    const gridWidth = width - margin * 2;
    const names = [...new Set(activeEvents().filter(row => row.start_date <= endDate && row.end_date >= startDate).flatMap(row => splitOwners(row.owner)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const legendItems = names.map(name => [name, getOwnerPresentation(name, state.ownerColors)]);
    const inRange = activeEvents().filter(row => row.start_date <= endDate && row.end_date >= startDate);
    if (inRange.some(row => splitOwners(row.owner).length > 1)) legendItems.push(['多人合作', getOwnerPresentation('多人、合作', state.ownerColors)]);
    if (inRange.some(row => splitOwners(row.owner).length === 0)) legendItems.push(['未指定', getOwnerPresentation('', state.ownerColors)]);
    if (legendItems.length === 0) legendItems.push(['暂无负责人', { color: '#e7edf5' }]);
    const measureContext = document.createElement('canvas').getContext('2d');
    measureContext.font = '13px Segoe UI, Microsoft YaHei, sans-serif';
    const legendRows = countLegendRows(legendItems.map(([name]) => name), { maxWidth: gridWidth, measureText: name => measureContext.measureText(name).width });
    const legendHeight = 80 + legendRows * 22;
    const gridTop = headerHeight + legendHeight;
    const gridHeight = grid.weeks.reduce((sum, week) => sum + week.height, 0);
    const canvas = document.createElement('canvas');
    canvas.width = width * scale; canvas.height = (gridTop + gridHeight + margin) * scale;
    const context = canvas.getContext('2d'); context.scale(scale, scale); context.fillStyle = '#f4f7fb'; context.fillRect(0, 0, width, gridTop + gridHeight + margin);
    context.fillStyle = '#102d57'; context.fillRect(0, 0, width, 10);
    context.fillStyle = '#c72630'; context.font = '700 14px Segoe UI, Microsoft YaHei, sans-serif'; context.fillText('TEAM CALENDAR', margin, 51);
    context.fillStyle = '#102d57'; context.font = '700 34px Segoe UI, Microsoft YaHei, sans-serif'; context.fillText('团队日历', margin, 96);
    context.fillStyle = '#60728c'; context.font = '16px Segoe UI, Microsoft YaHei, sans-serif'; context.fillText(label, margin, 128);
    context.fillStyle = '#60728c'; context.font = '13px Segoe UI, Microsoft YaHei, sans-serif'; context.fillText(`导出日期：${startDate} 至 ${endDate}`, margin, 153);

    const gridX = margin, columnWidth = gridWidth / 7, weekdayY = gridTop + 22;
    context.font = '13px Segoe UI, Microsoft YaHei, sans-serif';
    context.textAlign = 'left';
    let legendX = margin, legendRow = 0;
    for (const [name, presentation] of legendItems) {
      const itemWidth = context.measureText(name).width + 43;
      if (legendX + itemWidth > width - margin) { legendRow += 1; legendX = margin; }
      context.fillStyle = presentation.color; context.strokeStyle = '#0002'; context.lineWidth = 1;
      context.beginPath(); context.roundRect(legendX, headerHeight + 45 + legendRow * 22, 15, 15, 4); context.fill(); context.stroke();
      context.fillStyle = '#42536a'; context.fillText(name, legendX + 22, headerHeight + 58 + legendRow * 22);
      legendX += itemWidth;
    }
    const statusLegendY = headerHeight + 66 + legendRows * 22;
    context.fillStyle = '#65758b'; context.font = '600 13px Segoe UI, Microsoft YaHei, sans-serif'; context.textAlign = 'left';
    context.fillText('○ 待办     ✓ 已完成', margin, statusLegendY);
    context.fillStyle = '#f0f3f8'; context.fillRect(gridX, gridTop, gridWidth, 34);
    const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    weekdays.forEach((day, index) => { context.fillStyle = '#738198'; context.textAlign = 'center'; context.font = '600 14px Segoe UI, Microsoft YaHei, sans-serif'; context.fillText(day, gridX + columnWidth * (index + .5), weekdayY); });

    let y = gridTop + 34;
    for (const week of grid.weeks) {
      context.fillStyle = '#fff'; context.fillRect(gridX, y, gridWidth, week.height);
      for (let column = 0; column < 7; column += 1) {
        const x = gridX + column * columnWidth;
        context.strokeStyle = '#e4e9f0'; context.lineWidth = 1; context.strokeRect(x, y, columnWidth, week.height);
        const date = week.days[column], dimmed = date < startDate || date > endDate;
        context.fillStyle = dimmed ? '#b7c0ce' : '#4f6078'; context.font = '12px Segoe UI, Microsoft YaHei, sans-serif'; context.textAlign = 'right';
        context.fillText(`${Number(date.slice(-2))}日`, x + columnWidth - 9, y + 21);
      }
      if (week.segments.length === 0 && inRange.length === 0 && week === grid.weeks[0]) {
        context.fillStyle = '#8b97a8'; context.font = '14px Segoe UI, Microsoft YaHei, sans-serif'; context.textAlign = 'center';
        context.fillText('此日期范围暂无工作项', gridX + gridWidth / 2, y + 70);
      }
      for (const segment of week.segments) {
        const owner = getOwnerPresentation(segment.owner, state.ownerColors);
        const x = gridX + segment.startColumn * columnWidth + 3;
        const barWidth = (segment.endColumn - segment.startColumn + 1) * columnWidth - 6;
        const barY = y + 32 + segment.lane * grid.laneHeight;
        context.fillStyle = owner.color; context.strokeStyle = owner.borderColor; context.lineWidth = 1;
        context.beginPath(); context.roundRect(x, barY, barWidth, 33, 5); context.fill(); context.stroke();
        context.save(); context.beginPath(); context.rect(x + 7, barY, Math.max(0, barWidth - 12), 33); context.clip();
        context.textAlign = 'left'; context.fillStyle = '#193252'; context.font = '600 12px Segoe UI, Microsoft YaHei, sans-serif';
        const status = segment.status === 'done' ? '✓' : '○';
        canvasText(context, `${status} ${segment.title}`, x + 8, barY + 14, barWidth - 16);
        context.fillStyle = '#53647a'; context.font = '10px Segoe UI, Microsoft YaHei, sans-serif';
        canvasText(context, segment.owner || '未指定', x + 8, barY + 28, barWidth - 16);
        context.restore();
      }
      y += week.height;
    }
    context.textAlign = 'right'; context.fillStyle = '#7a8798'; context.font = '11px Segoe UI, Microsoft YaHei, sans-serif';
    context.fillText(`导出于 ${today()} · 仅供团队安排查看`, width - margin, y + 20);
    canvas.toBlob(blob => {
      if (!blob) { announce('图片生成失败，请重试。', true); return; }
      downloadBlob(blob, `团队日历-${startDate}-${endDate}.png`);
      announce('日历长图已导出为 PNG。');
    }, 'image/png');
  } catch (error) { announce(error.message || '导出失败。', true); }
}

function getVisibleMonthRange() {
  const date = state.calendar.getDate();
  const year = date.getFullYear(), month = date.getMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}

renderCalendar();
$('prevButton').addEventListener('click', () => state.calendar.prev());
$('nextButton').addEventListener('click', () => state.calendar.next());
$('todayButton').addEventListener('click', () => state.calendar.gotoDate(today()));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => state.calendar.changeView(button.dataset.view)));
for (const id of ['ownerFilter', 'statusFilter']) $(id).addEventListener('change', updateCalendar);
$('search').addEventListener('input', () => { clearTimeout(state.filterTimer); state.filterTimer = setTimeout(updateCalendar, 200); });
$('refreshButton').addEventListener('click', refresh);
$('eventForm').addEventListener('submit', saveDraft);
$('deleteEvent').addEventListener('click', deleteEvent);
$('closeEvent').addEventListener('click', () => $('eventDialog').close());
document.querySelector('[data-close-read]').addEventListener('click', () => $('readDialog').close());
$('backupCalendar').addEventListener('click', downloadBackup);
$('exportReadonly').addEventListener('click', exportReadonlySnapshot);
$('restoreFile').addEventListener('change', restoreBackup);
$('exportMonth').addEventListener('click', () => {
  const [start, end] = getVisibleMonthRange();
  const date = new Date(`${start}T00:00:00Z`);
  const label = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long' }).format(date);
  exportCalendar(start, end, label);
});
$('exportCustom').addEventListener('click', () => exportCalendar($('exportStart').value, $('exportEnd').value, '自选日期范围'));
$('eventStart').addEventListener('change', () => { if ($('eventEnd').value < $('eventStart').value) $('eventEnd').value = $('eventStart').value; });
mobile.addEventListener('change', () => {
  document.documentElement.classList.toggle('mobile-view', mobile.matches);
  updateEditingAccess();
  if (mobile.matches) state.calendar.changeView('listMonth');
});
document.documentElement.classList.toggle('mobile-view', mobile.matches);
refresh();
setInterval(() => { if (document.visibilityState === 'visible' && !state.saving) refresh(); }, 10_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !state.saving) refresh(); });
