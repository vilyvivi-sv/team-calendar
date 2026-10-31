/** Build a portable, offline-capable HTML snapshot with no editing controls. */
export function buildReadonlyCalendarHtml({ data, calendarScript, calendarCss, workbenchCss, generatedAt }) {
  const snapshot = {
    schema_version: 1,
    initial_date: data.initial_date || new Date().toISOString().slice(0, 10),
    owner_colors: data.owner_colors || {},
    // Deleted items stay in the source calendar's recycle bin and are excluded from shared snapshots.
    events: (data.events || []).filter(item => !item.deleted_at).map(item => ({
      id: item.id,
      title: item.title,
      body: item.body || '',
      owner: item.owner || '',
      start_date: item.start_date,
      end_date: item.end_date,
      status: item.status === 'done' ? 'done' : 'todo',
    })),
  };
  const safeJson = JSON.stringify(snapshot)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const safeScript = calendarScript.replace(/<\/script/gi, '<\\/script');
  const safeCss = `${calendarCss}\n${workbenchCss}\n${viewerCss}`.replace(/<\/style/gi, '<\\/style');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#102d57">
  <meta name="description" content="财富团队工作日历只读快照">
  <title>财富团队工作日历只读快照</title>
  <style>${safeCss}</style>
  <script>${safeScript}</script>
</head>
<body>
  <header class="topbar"><div class="brand"><span class="brand-mark">日历</span><span>财富团队工作日历</span></div><span class="read-only-label">只读快照</span></header>
  <main class="page">
    <section class="intro"><div><p class="eyebrow">TEAM CALENDAR · READ ONLY</p><h1>财富团队工作日历</h1><p class="muted">点击日历事项可查看详情；此文件为 ${generatedAt} 导出的静态快照。</p></div></section>
    <section class="calendar-panel">
      <div class="calendar-toolbar"><div class="date-navigation"><button id="prevButton" class="icon" aria-label="上一期">‹</button><button id="nextButton" class="icon" aria-label="下一期">›</button><button id="todayButton" class="quiet">今天</button><h2 id="calendarTitle"></h2></div><div id="views" class="segmented" aria-label="日历视图"><button data-view="dayGridMonth">月历</button><button data-view="dayGridWeek">周历</button><button data-view="listMonth">日程</button></div></div>
      <div class="filters"><label class="search-label"><span class="sr-only">搜索工作项</span><input id="search" type="search" placeholder="搜索工作项…" maxlength="200"></label><label>负责人筛选<select id="ownerFilter"><option value="">所有负责人</option></select></label><label>状态筛选<select id="statusFilter"><option value="">全部状态</option><option value="todo">待办</option><option value="done">已完成</option></select></label></div>
      <div class="calendar-with-week-navigation"><div id="calendar" aria-label="财富团队工作日历"></div><aside id="weekNavigation" class="week-navigation" aria-label="按周定位"><label for="weekNavigator">周导航</label><input id="weekNavigator" type="range" min="0" max="1" step="7" value="0" aria-label="拖动定位到某一周" aria-orientation="vertical" disabled><output id="weekNavigatorLabel" for="weekNavigator">读取日历中</output></aside></div>
      <footer class="calendar-footer"><div class="calendar-legends"><div id="ownerLegend" class="legend" aria-label="执行人颜色图例"></div><div class="status-legend" aria-label="任务状态图例"><span><i class="task-status-icon is-todo" aria-hidden="true">○</i>待办</span><span><i class="task-status-icon is-done" aria-hidden="true">✓</i>已完成</span></div></div><span id="syncStatus" class="muted"></span></footer>
      <p class="usage-note">这是离线只读副本，不会修改日历。安排更新后，请维护者重新导出并发送新版文件。</p>
    </section>
  </main>
  <dialog id="readDialog" class="drawer"><div class="dialog-head"><div><p class="eyebrow">WORK ITEM</p><h2 id="readTitle"></h2></div><button id="closeRead" class="icon" aria-label="关闭" type="button">×</button></div><p id="readDates" class="field-note"></p><p id="readOwner" class="field-note"></p><p id="readStatus" class="field-note"></p><p id="readBody" class="read-body"></p></dialog>
  <script>
    const data = __CALENDAR_DATA__;
    (() => {
      const $ = id => document.getElementById(id);
      const addDays = (date, count) => {
        const value = new Date(date + 'T00:00:00Z');
        value.setUTCDate(value.getUTCDate() + count);
        return value.toISOString().slice(0, 10);
      };
      const dayOrdinal = date => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
      const ordinalDate = value => new Date(value * 86400000).toISOString().slice(0, 10);
      const mondayOrdinal = value => value - ((new Date(value * 86400000).getUTCDay() + 6) % 7);
      const splitOwners = value => [...new Set(String(value || '').split(/[、，,；;]+/).map(name => name.trim()).filter(Boolean))];
      const hashOwner = name => {
        let hash = 2166136261;
        for (const character of name) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
        return (hash >>> 0) % 360;
      };
      const presentation = owner => {
        const names = splitOwners(owner);
        const hue = names.length > 1 ? 90 : names.length === 0 ? 215 : Number.isInteger(data.owner_colors[names[0]]) ? data.owner_colors[names[0]] : hashOwner(names[0]);
        return { color: 'hsl(' + hue + ' 68% 90%)', borderColor: 'hsl(' + hue + ' 42% 73%)' };
      };
      const statusText = status => status === 'done' ? '已完成' : '待办';
      const items = data.events.filter(item => item && item.id && item.title && item.start_date && item.end_date);
      const mobile = matchMedia('(max-width: 767px)');
      let filterTimer;
      const calendar = new FullCalendar.Calendar($('calendar'), {
        initialView: mobile.matches ? 'listMonth' : 'dayGridMonth', initialDate: data.initial_date,
        timeZone: 'UTC', firstDay: 1, headerToolbar: false, height: 'auto', fixedWeekCount: false,
        locale: { code: 'zh-cn', week: { dow: 1, doy: 4 }, buttonText: { today: '今天', month: '月', week: '周', list: '日程' }, allDayText: '全天', noEventsText: '当前范围暂无工作项' },
        titleFormat: { year: 'numeric', month: 'long' }, dayMaxEvents: false, dayMaxEventRows: false,
        editable: false, selectable: false, events: [],
        datesSet: () => { $('calendarTitle').textContent = calendar.view.title; updateViewButtons(); syncWeekNavigator(); },
        eventClick: info => showDetails(info.event.extendedProps.item),
        eventContent: info => {
          const icon = document.createElement('span');
          const title = document.createElement('span');
          icon.className = 'task-status-icon ' + (info.event.extendedProps.item.status === 'done' ? 'is-done' : 'is-todo');
          icon.textContent = info.event.extendedProps.item.status === 'done' ? '✓' : '○';
          icon.setAttribute('aria-hidden', 'true');
          title.className = 'task-event-title';
          title.textContent = info.event.title;
          return { domNodes: [icon, title] };
        },
      });
      function updateViewButtons() {
        document.querySelectorAll('[data-view]').forEach(button => {
          const active = button.dataset.view === calendar.view.type;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        });
      }
      function syncWeekNavigator() {
        const slider = $('weekNavigator');
        const currentDate = calendar.getDate().toISOString().slice(0, 10);
        const currentOrdinal = dayOrdinal(currentDate);
        const anchors = [dayOrdinal(data.initial_date) - 365 * 5, dayOrdinal(data.initial_date) + 365 * 5, currentOrdinal - 365, currentOrdinal + 365];
        for (const item of items) anchors.push(dayOrdinal(item.start_date), dayOrdinal(item.end_date));
        const minimum = mondayOrdinal(Math.min(...anchors));
        const maximum = mondayOrdinal(Math.max(...anchors));
        const weekStart = mondayOrdinal(currentOrdinal);
        slider.min = String(minimum); slider.max = String(maximum); slider.step = '7'; slider.value = String(weekStart); slider.disabled = false;
        $('weekNavigation').hidden = calendar.view.type === 'listMonth';
        const weekEnd = ordinalDate(weekStart + 6);
        const firstYear = ordinalDate(weekStart).slice(0, 4);
        const yearLabel = firstYear === weekEnd.slice(0, 4) ? firstYear + '年' : firstYear + '-' + weekEnd.slice(0, 4) + '年';
        $('weekNavigatorLabel').textContent = yearLabel + '\n' + ordinalDate(weekStart).slice(5) + ' — ' + weekEnd.slice(5);
        slider.setAttribute('aria-valuetext', ordinalDate(weekStart) + ' 至 ' + ordinalDate(weekStart + 6));
      }
      function updateLegend() {
        const names = [...new Set(items.flatMap(item => splitOwners(item.owner)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
        const rows = names.map(name => [name, presentation(name)]);
        if (items.some(item => splitOwners(item.owner).length > 1)) rows.push(['多人合作', presentation('多人、合作')]);
        if (items.some(item => splitOwners(item.owner).length === 0)) rows.push(['未指定', presentation('')]);
        $('ownerLegend').replaceChildren(...rows.map(([name, color]) => {
          const item = document.createElement('span');
          const swatch = document.createElement('i');
          item.className = 'legend-item'; swatch.className = 'owner-swatch'; swatch.style.backgroundColor = color.color;
          swatch.setAttribute('aria-hidden', 'true'); item.append(swatch, document.createTextNode(name)); return item;
        }));
      }
      function refreshEvents() {
        const query = $('search').value.trim().toLocaleLowerCase();
        const owner = $('ownerFilter').value;
        const status = $('statusFilter').value;
        const visible = items.filter(item => (!query || (item.title + ' ' + (item.body || '') + ' ' + (item.owner || '')).toLocaleLowerCase().includes(query))
          && (!owner || splitOwners(item.owner).includes(owner)) && (!status || (item.status === 'done' ? 'done' : 'todo') === status));
        calendar.removeAllEvents();
        calendar.addEventSource(visible.map(item => {
          const color = presentation(item.owner);
          return { id: item.id, title: item.title, start: item.start_date, end: addDays(item.end_date, 1), allDay: true,
            backgroundColor: color.color, borderColor: color.borderColor, textColor: '#193252', extendedProps: { item } };
        }));
        const names = [...new Set(items.flatMap(item => splitOwners(item.owner)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
        const selected = owner;
        $('ownerFilter').replaceChildren(new Option('所有负责人', ''), ...names.map(name => new Option(name, name)));
        $('ownerFilter').value = names.includes(selected) ? selected : '';
        updateLegend();
        $('syncStatus').textContent = visible.length + ' 项安排';
      }
      function showDetails(item) {
        $('readTitle').textContent = item.title;
        $('readDates').textContent = item.start_date === item.end_date ? item.start_date : item.start_date + ' 至 ' + item.end_date;
        $('readOwner').textContent = '负责人：' + (item.owner || '未指定');
        $('readStatus').textContent = '状态：' + statusText(item.status);
        $('readBody').textContent = item.body || '无备注';
        $('readDialog').showModal();
      }
      calendar.render();
      $('prevButton').addEventListener('click', () => calendar.prev());
      $('nextButton').addEventListener('click', () => calendar.next());
      $('todayButton').addEventListener('click', () => calendar.today());
      $('weekNavigator').addEventListener('input', event => calendar.changeView('dayGridWeek', ordinalDate(Number(event.currentTarget.value))));
      document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => calendar.changeView(button.dataset.view)));
      $('ownerFilter').addEventListener('change', refreshEvents);
      $('statusFilter').addEventListener('change', refreshEvents);
      $('search').addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(refreshEvents, 180); });
      $('closeRead').addEventListener('click', () => $('readDialog').close());
      $('readDialog').addEventListener('click', event => { if (event.target === $('readDialog')) $('readDialog').close(); });
      document.documentElement.classList.toggle('mobile-view', mobile.matches);
      mobile.addEventListener('change', () => { document.documentElement.classList.toggle('mobile-view', mobile.matches); if (mobile.matches) calendar.changeView('listMonth'); });
      refreshEvents();
    })();
  </script>
</body>
</html>`
    .replace('__CALENDAR_DATA__', safeJson);
}

const viewerCss = `
.fc .fc-daygrid-day-frame{height:auto;min-height:100%;overflow:visible}.fc .fc-daygrid-day-events{min-height:0;overflow:visible}.fc .fc-daygrid-event-harness{flex:none}.fc .fc-daygrid-event{white-space:normal;line-height:1.3;cursor:pointer}.fc .task-event-title{white-space:normal;overflow-wrap:anywhere}.fc .fc-daygrid-event .task-status-icon,.fc .fc-list-event-title .task-status-icon{margin-right:4px}.task-status-icon.is-todo,.task-status-icon.is-done{color:#51627a}.fc .fc-daygrid-more-link{display:none}.readonly-note{font-size:12px;line-height:1.7;color:#77849a;margin:14px 3px}.readonly-intro{align-items:center}.fc .fc-event{cursor:pointer}@media(max-width:767px){.topbar{height:54px;padding:0 15px}.page{margin:17px auto;padding:0 12px}.calendar-panel{border-radius:12px;padding:13px}.intro{margin-top:16px}.intro h1{font-size:25px}.intro .muted{font-size:13px}.calendar-toolbar{align-items:flex-start;flex-direction:column}.date-navigation{width:100%}.date-navigation h2{flex:1}.segmented{align-self:stretch}.segmented button{flex:1}.filters{display:grid;grid-template-columns:1fr 1fr}.search-label{grid-column:1/-1}.calendar-footer{align-items:flex-start;flex-direction:column;gap:10px}.calendar-legends{gap:9px}.calendar-legends .legend{gap:6px 11px}.fc .fc-list-event-title{white-space:normal}.fc .fc-list-event-time{width:0;font-size:0}}`;
