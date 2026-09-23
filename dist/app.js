const STORAGE_KEY = 'food-rhythm-entries-v1';
const hungerLabels = { 1: '微餓', 2: '有點餓', 3: '感到餓', 4: '很餓', 5: '極度飢餓' };
const fullnessLabels = { 1: '微飽', 2: '有點飽', 3: '飽足', 4: '很飽', 5: '過度飽足' };
const state = {
  entries: [],
  selectedDate: todayKey(),
  weekAnchor: new Date(),
  monthAnchor: new Date(),
  reviewPeriod: 'week',
  view: 'today'
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function todayKey() {
  const now = new Date();
  return localDateKey(now);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function shiftDate(key, days) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function formatDate(key, options = {}) {
  return new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'short', ...options }).format(dateFromKey(key));
}

function loadEntries() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(stored)) {
      const realEntries = stored.filter(entry => !String(entry.id).startsWith('demo-'));
      const migrated = migrateEntries(realEntries);
      if (realEntries.length !== stored.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem('food-rhythm-demo-seeded-v1');
      return migrated;
    }
  } catch (_) {}
  localStorage.removeItem('food-rhythm-demo-seeded-v1');
  return [];
}

function migrateEntries(entries) {
  let changed = false;
  const migrated = entries.map(entry => {
    if (entry.type !== 'feeling') return entry;
    changed = true;
    const oldLevel = Number(entry.level) || 3;
    if (oldLevel <= 2) return { ...entry, type: 'hunger', level: oldLevel === 1 ? 5 : 4 };
    return { ...entry, type: 'fullness', level: oldLevel };
  });
  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  return migrated;
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
  $('#storage-status').textContent = '剛剛已儲存';
  setTimeout(() => { $('#storage-status').textContent = '已儲存在這台裝置'; }, 1400);
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function entriesForDate(date) {
  return sortEntries(state.entries.filter(entry => entry.date === date));
}

function entryTitle(entry) {
  if (entry.type === 'food') return entry.food;
  const labels = entry.type === 'hunger' ? hungerLabels : fullnessLabels;
  return `${labels[entry.level] || '未標示'}（${entry.level} / 5）`;
}

function entryIcon(type) {
  if (type === 'food') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v8m3-8v8M5 7h7M8.5 11v10M17 3v18m0-18c2 2 3 5 3 8h-3"/></svg>';
  return type === 'hunger'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14a8 8 0 1 1 16 0M12 14l4-4M6 18h12"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14a8 8 0 1 1 16 0M12 14l-3-3M6 18h12"/></svg>';
}

function minutes(time) {
  if (!time) return null;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(value) {
  if (value == null || Number.isNaN(value)) return '尚無資料';
  const rounded = Math.round(value);
  return `${String(Math.floor(rounded / 60) % 24).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function getWeekRange(anchor = state.weekAnchor) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const weekday = start.getDay() || 7;
  start.setDate(start.getDate() - weekday + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: localDateKey(start), end: localDateKey(end) };
}

function weeklyStats(anchor = state.weekAnchor) {
  const range = getWeekRange(anchor);
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(range.start, index));
  const entries = sortEntries(state.entries.filter(entry => entry.date >= range.start && entry.date <= range.end));
  const firstHunger = [];
  const firstFood = [];
  const lastFood = [];
  const responseTimes = [];

  days.forEach(day => {
    const dayEntries = entries.filter(entry => entry.date === day);
    const hunger = dayEntries.find(entry => entry.type === 'hunger');
    const foods = dayEntries.filter(entry => entry.type === 'food');
    if (hunger) firstHunger.push(minutes(hunger.time));
    if (foods[0]) firstFood.push(minutes(foods[0].time));
    if (foods.length) lastFood.push(minutes(foods.at(-1).time));
    if (hunger) {
      const nextFood = foods.find(food => minutes(food.time) >= minutes(hunger.time));
      if (nextFood) responseTimes.push(minutes(nextFood.time) - minutes(hunger.time));
    }
  });

  return {
    range,
    days,
    entries,
    counts: days.map(day => entries.filter(entry => entry.date === day).length),
    firstHunger: average(firstHunger),
    firstFood: average(firstFood),
    lastFood: average(lastFood),
    response: average(responseTimes),
    observedDays: new Set(entries.map(entry => entry.date)).size
  };
}

function renderToday() {
  $('#selected-date').value = state.selectedDate;
  const entries = entriesForDate(state.selectedDate);
  const foodEntries = entries.filter(entry => entry.type === 'food');
  const firstHunger = entries.find(entry => entry.type === 'hunger');
  $('#view-eyebrow').textContent = state.selectedDate === todayKey() ? '今天' : formatDate(state.selectedDate);
  $('#view-title').textContent = state.selectedDate === todayKey() ? '我的飲食節奏' : '這一天的紀錄';
  $('#entry-count').textContent = `${entries.length} 筆紀錄`;
  $('#day-summary').innerHTML = `
    <div class="summary-cell"><span>第一次感到餓</span><strong>${firstHunger?.time || '尚無紀錄'}</strong></div>
    <div class="summary-cell"><span>第一次進食</span><strong>${foodEntries[0]?.time || '尚無紀錄'}</strong></div>
    <div class="summary-cell"><span>最後一次進食</span><strong>${foodEntries.at(-1)?.time || '尚無紀錄'}</strong></div>`;

  const timeline = $('#timeline');
  if (!entries.length) {
    timeline.classList.add('is-empty');
    timeline.replaceChildren($('#empty-template').content.cloneNode(true));
    $('.empty-add', timeline).addEventListener('click', () => openEntryDialog());
    return;
  }
  timeline.classList.remove('is-empty');
  timeline.innerHTML = entries.map(entry => `
    <article class="timeline-entry ${entry.type}" data-id="${escapeHtml(entry.id)}">
      <time class="entry-time">${escapeHtml(entry.time)}</time>
      <span class="entry-dot" aria-hidden="true"></span>
      <button class="entry-card" type="button" aria-label="編輯 ${escapeHtml(entryTitle(entry))}">
        <span class="entry-type">${entryIcon(entry.type)}${entry.type === 'food' ? '吃了東西' : entry.type === 'hunger' ? '飢餓感' : '飽足感'}</span>
        <span class="entry-title">${escapeHtml(entryTitle(entry))}</span>
        ${entry.note ? `<p class="entry-note">${escapeHtml(entry.note)}</p>` : ''}
      </button>
    </article>`).join('');
  $$('.timeline-entry', timeline).forEach(item => item.addEventListener('click', () => openEntryDialog(item.dataset.id)));
}

function renderHistory() {
  const list = $('#history-list');
  const groups = Map.groupBy ? Map.groupBy(sortEntries(state.entries).reverse(), entry => entry.date) : sortEntries(state.entries).reverse().reduce((map, entry) => map.set(entry.date, [...(map.get(entry.date) || []), entry]), new Map());
  if (!state.entries.length) {
    list.replaceChildren($('#empty-template').content.cloneNode(true));
    $('.empty-add', list).addEventListener('click', () => openEntryDialog());
    return;
  }
  list.innerHTML = [...groups.entries()].map(([date, entries]) => `
    <section class="history-day">
      <div class="history-date"><strong>${escapeHtml(formatDate(date))}</strong><span>${entries.length} 筆</span></div>
      <div class="history-items">${entries.map(entry => `
        <button class="history-item ${entry.type}" type="button" data-id="${escapeHtml(entry.id)}">
          <time>${escapeHtml(entry.time)}</time><i aria-hidden="true"></i><span>${escapeHtml(entryTitle(entry))}</span>
        </button>`).join('')}</div>
    </section>`).join('');
  $$('.history-item', list).forEach(item => item.addEventListener('click', () => openEntryDialog(item.dataset.id)));
}

function renderWeekly() {
  const stats = weeklyStats();
  $('#week-range').textContent = `${formatDate(stats.range.start, { weekday: undefined })}－${formatDate(stats.range.end, { weekday: undefined })}`;
  const maxCount = Math.max(...stats.counts, 1);
  $('#weekly-content').innerHTML = `
    <div class="weekly-grid">
      <div class="weekly-stat"><span>平均第一次感到餓</span><strong>${timeFromMinutes(stats.firstHunger)}</strong></div>
      <div class="weekly-stat"><span>平均第一次進食</span><strong>${timeFromMinutes(stats.firstFood)}</strong></div>
      <div class="weekly-stat"><span>感到餓後多久進食</span><strong>${stats.response == null ? '尚無資料' : `${Math.round(stats.response)} 分鐘`}</strong></div>
      <div class="weekly-stat"><span>平均最後進食時間</span><strong>${timeFromMinutes(stats.lastFood)}</strong></div>
    </div>
    <section class="week-chart">
      <h2>每日紀錄次數</h2>
      <div class="bars" aria-label="本週每天的紀錄次數">${stats.counts.map((count, index) => `
        <div class="bar-column" title="${stats.days[index]}：${count} 筆">
          <div class="bar-track"><div class="bar-fill" style="height:${Math.max(3, (count / maxCount) * 100)}%"></div></div>
          <span>${['一','二','三','四','五','六','日'][index]}</span>
        </div>`).join('')}</div>
    </section>
    <p class="weekly-note">${weeklyInsight(stats)}</p>`;
}

function getMonthRange(anchor = state.monthAnchor) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: localDateKey(start), end: localDateKey(end) };
}

function renderMonthly() {
  const range = getMonthRange();
  const entries = sortEntries(state.entries.filter(entry => entry.date >= range.start && entry.date <= range.end));
  const stats = statsForEntries(entries);
  const hungerLevels = entries.filter(entry => entry.type === 'hunger').map(entry => Number(entry.level));
  const fullnessLevels = entries.filter(entry => entry.type === 'fullness').map(entry => Number(entry.level));
  const monthName = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' }).format(state.monthAnchor);
  $('#month-range').textContent = monthName;
  const monthStart = dateFromKey(range.start);
  const weekBuckets = [];
  let cursor = new Date(monthStart);
  let index = 1;
  while (cursor <= dateFromKey(range.end)) {
    const bucketStart = localDateKey(cursor);
    const bucketEndDate = new Date(cursor);
    bucketEndDate.setDate(Math.min(cursor.getDate() + 6, dateFromKey(range.end).getDate()));
    const bucketEnd = localDateKey(bucketEndDate);
    weekBuckets.push({ label: `第 ${index} 週`, count: entries.filter(entry => entry.date >= bucketStart && entry.date <= bucketEnd).length });
    cursor.setDate(cursor.getDate() + 7);
    index += 1;
  }
  const maxCount = Math.max(...weekBuckets.map(item => item.count), 1);
  $('#monthly-content').innerHTML = `
    <div class="weekly-grid">
      <div class="weekly-stat"><span>有紀錄的天數</span><strong>${stats.days} 天</strong></div>
      <div class="weekly-stat"><span>平均第一次感到餓</span><strong>${timeFromMinutes(stats.firstHunger)}</strong></div>
      <div class="weekly-stat"><span>平均飢餓程度</span><strong>${hungerLevels.length ? `${average(hungerLevels).toFixed(1)} / 5` : '尚無資料'}</strong></div>
      <div class="weekly-stat"><span>平均飽足程度</span><strong>${fullnessLevels.length ? `${average(fullnessLevels).toFixed(1)} / 5` : '尚無資料'}</strong></div>
      <div class="weekly-stat"><span>感到餓後多久進食</span><strong>${stats.response == null ? '尚無資料' : `${Math.round(stats.response)} 分鐘`}</strong></div>
      <div class="weekly-stat"><span>平均最後進食時間</span><strong>${timeFromMinutes(stats.lastFood)}</strong></div>
    </div>
    <section class="week-chart">
      <h2>每週紀錄次數</h2>
      <div class="bars month-bars" aria-label="本月每週紀錄次數">${weekBuckets.map(item => `
        <div class="bar-column" title="${item.label}：${item.count} 筆">
          <div class="bar-track"><div class="bar-fill" style="height:${Math.max(3, (item.count / maxCount) * 100)}%"></div></div>
          <span>${item.label}</span>
        </div>`).join('')}</div>
    </section>
    <p class="weekly-note">${monthlyInsight(entries, stats, hungerLevels, fullnessLevels)}</p>`;
}

function monthlyInsight(entries, stats, hungerLevels, fullnessLevels) {
  if (!entries.length) return '這個月還沒有紀錄。持續記下進食、飢餓與飽足感，就能逐步看見長期節奏。';
  const parts = [`這個月有 ${stats.days} 天留下紀錄，共 ${entries.length} 筆`];
  if (stats.firstHunger != null) parts.push(`平均在 ${timeFromMinutes(stats.firstHunger)} 第一次感到餓`);
  if (hungerLevels.length && fullnessLevels.length) parts.push(`平均飢餓 ${average(hungerLevels).toFixed(1)} 級、飽足 ${average(fullnessLevels).toFixed(1)} 級`);
  return `${parts.join('，')}。`;
}

function switchReviewPeriod(period) {
  state.reviewPeriod = period;
  $$('.review-tab').forEach(button => {
    const active = button.dataset.period === period;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $('#week-switcher').hidden = period !== 'week';
  $('#weekly-content').hidden = period !== 'week';
  $('#month-switcher').hidden = period !== 'month';
  $('#monthly-content').hidden = period !== 'month';
  if (period === 'month') renderMonthly(); else renderWeekly();
}

function weeklyInsight(stats) {
  if (!stats.entries.length) return '這週還沒有紀錄。記下幾次進食、飢餓與飽足感後，就能開始看見節奏。';
  if (stats.firstHunger != null && stats.response != null) return `這週通常在 ${timeFromMinutes(stats.firstHunger)} 左右第一次感到餓，約 ${Math.round(stats.response)} 分鐘後開始吃東西。`;
  return `這週有 ${stats.observedDays} 天留下紀錄，共 ${stats.entries.length} 筆。再多記幾次飢餓感，就能計算進食反應時間。`;
}

function renderSideSummary() {
  const stats = weeklyStats(new Date());
  $('#side-summary').innerHTML = `
    <div class="side-stat"><span>有紀錄的天數</span><strong>${stats.observedDays}<small>/ 7 天</small></strong></div>
    <div class="side-stat"><span>平均感到餓</span><strong>${timeFromMinutes(stats.firstHunger)}</strong></div>
    <div class="side-stat"><span>餓到開始吃</span><strong>${stats.response == null ? '尚無資料' : `${Math.round(stats.response)} 分鐘`}</strong></div>`;
  $('#side-insight').textContent = weeklyInsight(stats);
}

function renderAll() {
  renderToday();
  renderHistory();
  renderWeekly();
  renderMonthly();
  renderSideSummary();
}

function switchView(view) {
  state.view = view;
  $$('.app-view').forEach(panel => panel.hidden = panel.id !== `${view}-view`);
  $$('.nav-item').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('#date-controls').hidden = view !== 'today';
  if (view === 'history') {
    $('#view-eyebrow').textContent = '所有日子';
    $('#view-title').textContent = '過去的紀錄';
  } else if (view === 'weekly') {
    $('#view-eyebrow').textContent = '趨勢';
    $('#view-title').textContent = '飲食回顧';
    switchReviewPeriod(state.reviewPeriod);
  } else {
    renderToday();
  }
}

function openEntryDialog(id = null) {
  const dialog = $('#entry-dialog');
  const form = $('#entry-form');
  form.reset();
  $('#form-error').textContent = '';
  $('#entry-id').value = '';
  $('#entry-date').value = state.view === 'today' ? state.selectedDate : todayKey();
  $('#entry-time').value = new Date().toTimeString().slice(0, 5);
  $('#entry-dialog-title').textContent = '新增紀錄';
  $('#delete-entry').hidden = true;
  if (id) {
    const entry = state.entries.find(item => item.id === id);
    if (!entry) return;
    $('#entry-id').value = entry.id;
    $('#entry-date').value = entry.date;
    $('#entry-time').value = entry.time;
    $(`input[name="type"][value="${entry.type}"]`).checked = true;
    $('#food-text').value = entry.food || '';
    if (entry.level && entry.type === 'hunger') $(`input[name="hunger-level"][value="${entry.level}"]`).checked = true;
    if (entry.level && entry.type === 'fullness') $(`input[name="fullness-level"][value="${entry.level}"]`).checked = true;
    $('#entry-note').value = entry.note || '';
    $('#entry-dialog-title').textContent = '編輯紀錄';
    $('#delete-entry').hidden = false;
  }
  updateTypeFields();
  dialog.showModal();
  setTimeout(() => (id ? $('#entry-time') : $('input[name="type"]')).focus(), 0);
}

function updateTypeFields() {
  const type = $('input[name="type"]:checked').value;
  $('#food-fields').hidden = type !== 'food';
  $('#hunger-fields').hidden = type !== 'hunger';
  $('#fullness-fields').hidden = type !== 'fullness';
}

function submitEntry(event) {
  event.preventDefault();
  const type = $('input[name="type"]:checked').value;
  const food = $('#food-text').value.trim();
  if (type === 'food' && !food) {
    $('#form-error').textContent = '請寫下吃了什麼。';
    $('#food-text').focus();
    return;
  }
  const id = $('#entry-id').value;
  const record = {
    id: id || (crypto.randomUUID ? crypto.randomUUID() : `entry-${Date.now()}`),
    date: $('#entry-date').value,
    time: $('#entry-time').value,
    type,
    food: type === 'food' ? food : '',
    level: type === 'hunger' ? Number($('input[name="hunger-level"]:checked').value) : type === 'fullness' ? Number($('input[name="fullness-level"]:checked').value) : null,
    note: $('#entry-note').value.trim(),
    createdAt: id ? state.entries.find(item => item.id === id)?.createdAt || Date.now() : Date.now()
  };
  if (id) state.entries = state.entries.map(entry => entry.id === id ? record : entry);
  else state.entries.push(record);
  state.selectedDate = record.date;
  saveEntries();
  renderAll();
  switchView('today');
  $('#entry-dialog').close();
  toast(id ? '紀錄已更新' : '已記下這一刻');
}

function deleteEntry() {
  const id = $('#entry-id').value;
  if (!id || !confirm('確定要刪除這筆紀錄嗎？')) return;
  state.entries = state.entries.filter(entry => entry.id !== id);
  saveEntries();
  renderAll();
  $('#entry-dialog').close();
  toast('紀錄已刪除');
}

function exportData() {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: state.entries }, null, 2);
  downloadFile(`食刻備份-${todayKey()}.json`, payload, 'application/json');
  toast('備份已下載');
}

function downloadFile(filename, content, type, withBom = false) {
  const blob = new Blob(withBom ? ['\ufeff', content] : [content], { type: `${type};charset=utf-8` });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function exportRangeEntries() {
  const start = $('#export-start').value;
  const end = $('#export-end').value;
  if (!start || !end || start > end) return [];
  return sortEntries(state.entries.filter(entry => entry.date >= start && entry.date <= end));
}

function updateExportCount() {
  const start = $('#export-start').value;
  const end = $('#export-end').value;
  const count = exportRangeEntries().length;
  $('#export-count').textContent = !start || !end || start > end ? '請選擇有效的日期範圍' : `這段期間共有 ${count} 筆紀錄`;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv() {
  const entries = exportRangeEntries();
  if (!entries.length) return alert('選擇的日期範圍內沒有紀錄。');
  const includeNotes = !$('#exclude-notes').checked;
  const headers = ['日期', '時間', '類型', '內容', '飢餓飽足程度'];
  if (includeNotes) headers.push('補充備註');
  const rows = entries.map(entry => {
    const typeLabel = entry.type === 'food' ? '進食' : entry.type === 'hunger' ? '飢餓感' : '飽足感';
    const labels = entry.type === 'hunger' ? hungerLabels : fullnessLabels;
    const row = [entry.date, entry.time, typeLabel, entry.type === 'food' ? entry.food : labels[entry.level], entry.level || ''];
    if (includeNotes) row.push(entry.note || '');
    return row.map(csvCell).join(',');
  });
  const start = $('#export-start').value;
  const end = $('#export-end').value;
  downloadFile(`食刻分析資料-${start}-${end}.csv`, [headers.map(csvCell).join(','), ...rows].join('\n'), 'text/csv', true);
  toast(`已匯出 ${entries.length} 筆 CSV`);
}

function statsForEntries(entries) {
  const days = [...new Set(entries.map(entry => entry.date))];
  const firstHunger = [];
  const firstFood = [];
  const lastFood = [];
  const responseTimes = [];
  days.forEach(day => {
    const items = entries.filter(entry => entry.date === day);
    const hunger = items.find(entry => entry.type === 'hunger');
    const foods = items.filter(entry => entry.type === 'food');
    if (hunger) firstHunger.push(minutes(hunger.time));
    if (foods[0]) firstFood.push(minutes(foods[0].time));
    if (foods.length) lastFood.push(minutes(foods.at(-1).time));
    if (hunger) {
      const nextFood = foods.find(food => minutes(food.time) >= minutes(hunger.time));
      if (nextFood) responseTimes.push(minutes(nextFood.time) - minutes(hunger.time));
    }
  });
  return { days: days.length, firstHunger: average(firstHunger), firstFood: average(firstFood), lastFood: average(lastFood), response: average(responseTimes) };
}

function exportMarkdown() {
  const entries = exportRangeEntries();
  if (!entries.length) return alert('選擇的日期範圍內沒有紀錄。');
  const start = $('#export-start').value;
  const end = $('#export-end').value;
  const includeNotes = !$('#exclude-notes').checked;
  const stats = statsForEntries(entries);
  const lines = [
    '# 飲食節奏分析資料',
    '',
    `期間：${start} 至 ${end}`,
    `紀錄天數：${stats.days} 天`,
    `總紀錄數：${entries.length} 筆`,
    '',
    '## 基本統計',
    '',
    `- 平均第一次感到飢餓：${timeFromMinutes(stats.firstHunger)}`,
    `- 平均第一次進食：${timeFromMinutes(stats.firstFood)}`,
    `- 平均最後一次進食：${timeFromMinutes(stats.lastFood)}`,
    `- 感到餓後到進食的平均時間：${stats.response == null ? '尚無資料' : `${Math.round(stats.response)} 分鐘`}`,
    '',
    '## 詳細紀錄',
    '',
    '| 日期 | 時間 | 類型 | 內容 |' + (includeNotes ? ' 備註 |' : ''),
    '| --- | --- | --- | --- |' + (includeNotes ? ' --- |' : '')
  ];
  entries.forEach(entry => {
    const labels = entry.type === 'hunger' ? hungerLabels : fullnessLabels;
    const content = entry.type === 'food' ? entry.food : `${labels[entry.level]}（${entry.level}/5）`;
    const clean = value => String(value || '').replaceAll('|', '｜').replaceAll('\n', ' ');
    const typeLabel = entry.type === 'food' ? '進食' : entry.type === 'hunger' ? '飢餓感' : '飽足感';
    lines.push(`| ${entry.date} | ${entry.time} | ${typeLabel} | ${clean(content)} |${includeNotes ? ` ${clean(entry.note)} |` : ''}`);
  });
  lines.push('', '## 建議提供給 AI 的問題', '', '請根據以上紀錄，分析我的飢餓出現時段、進食反應時間、進食間隔與可能的週間模式。請區分資料支持的觀察與推測，不要進行醫療診斷；如果資料不足，請直接指出。');
  downloadFile(`食刻-AI分析報告-${start}-${end}.md`, lines.join('\n'), 'text/markdown');
  toast(`已產生 ${entries.length} 筆分析報告`);
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(entries) || !entries.every(item => item.id && item.date && item.time && ['food', 'feeling', 'hunger', 'fullness'].includes(item.type))) throw new Error('invalid');
    state.entries = migrateEntries(entries);
    saveEntries();
    renderAll();
    $('#data-dialog').close();
    toast(`已匯入 ${entries.length} 筆紀錄`);
  } catch (_) {
    alert('無法讀取這份備份，請確認檔案是否由食刻匯出。');
  } finally {
    event.target.value = '';
  }
}

function clearData() {
  if (!confirm('確定要清除所有紀錄嗎？這個動作無法復原，建議先匯出備份。')) return;
  state.entries = [];
  saveEntries();
  renderAll();
  $('#data-dialog').close();
  toast('所有紀錄已清除');
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 1800);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const addEntry = async input => {
    if (!input || !input.date || !input.time || !['food', 'hunger', 'fullness'].includes(input.type)) throw new Error('日期、時間與類型都是必填');
    if (input.type === 'food' && !String(input.food || '').trim()) throw new Error('進食紀錄需要食物內容');
    const entry = { id: crypto.randomUUID(), date: input.date, time: input.time, type: input.type, food: input.type === 'food' ? String(input.food).trim() : '', level: input.type === 'food' ? null : Number(input.level || 3), note: String(input.note || '').trim(), createdAt: Date.now() };
    state.entries.push(entry);
    saveEntries();
    renderAll();
    return { id: entry.id, saved: true };
  };
  try {
    void context.registerTool({
      name: 'add_food_rhythm_entry',
      title: '新增飲食節奏紀錄',
      description: '新增一筆進食、飢餓或飽足紀錄，並同步更新畫面與本機資料。',
      inputSchema: { type: 'object', properties: { date: { type: 'string' }, time: { type: 'string' }, type: { type: 'string', enum: ['food', 'hunger', 'fullness'] }, food: { type: 'string' }, level: { type: 'number', minimum: 1, maximum: 5 }, note: { type: 'string' } }, required: ['date', 'time', 'type'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: addEntry
    });
  } catch (_) {}
}

function bindEvents() {
  $$('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  $('#add-entry').addEventListener('click', () => openEntryDialog());
  $('#entry-form').addEventListener('submit', submitEntry);
  $$('input[name="type"]').forEach(input => input.addEventListener('change', updateTypeFields));
  $('#delete-entry').addEventListener('click', deleteEntry);
  $('#selected-date').addEventListener('change', event => { state.selectedDate = event.target.value; renderToday(); });
  $('#previous-day').addEventListener('click', () => { state.selectedDate = shiftDate(state.selectedDate, -1); renderToday(); });
  $('#next-day').addEventListener('click', () => { state.selectedDate = shiftDate(state.selectedDate, 1); renderToday(); });
  $('#previous-week').addEventListener('click', () => { state.weekAnchor.setDate(state.weekAnchor.getDate() - 7); renderWeekly(); });
  $('#next-week').addEventListener('click', () => { state.weekAnchor.setDate(state.weekAnchor.getDate() + 7); renderWeekly(); });
  $('#previous-month').addEventListener('click', () => { state.monthAnchor.setMonth(state.monthAnchor.getMonth() - 1); renderMonthly(); });
  $('#next-month').addEventListener('click', () => { state.monthAnchor.setMonth(state.monthAnchor.getMonth() + 1); renderMonthly(); });
  $$('.review-tab').forEach(button => button.addEventListener('click', () => switchReviewPeriod(button.dataset.period)));
  $('#open-data').addEventListener('click', () => {
    const sorted = sortEntries(state.entries);
    $('#export-start').value = sorted[0]?.date || todayKey();
    $('#export-end').value = sorted.at(-1)?.date || todayKey();
    updateExportCount();
    $('#data-dialog').showModal();
  });
  $('#export-data').addEventListener('click', exportData);
  $('#export-csv').addEventListener('click', exportCsv);
  $('#export-markdown').addEventListener('click', exportMarkdown);
  $('#export-start').addEventListener('change', updateExportCount);
  $('#export-end').addEventListener('change', updateExportCount);
  $('#import-data').addEventListener('change', importData);
  $('#clear-data').addEventListener('click', clearData);
  $$('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }));
}

state.entries = loadEntries();
bindEvents();
renderAll();
switchView('today');
registerWebMcp();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
