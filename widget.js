/* widget.js — Gantt LaSuite.coop pour Grist
   Reprend la base du Kanban : mêmes records, mêmes métadonnées, options persistées.
*/

let _records = [];
let _colsMeta = [];
let _tableId = null;
let _openPanel = null;

let _titleColId = null;
let _startColId = null;
let _endColId = null;
let _statusColId = null;
let _progressColId = null;
let _assigneeColId = null;
let _productColId = null;
let _visibleFields = null;
let _scale = 'week';
let _hideDone = false;
let _expandedRecordId = null;

const OPTS = {
  title: 'ls_gantt_title',
  start: 'ls_gantt_start',
  end: 'ls_gantt_end',
  status: 'ls_gantt_status',
  progress: 'ls_gantt_progress',
  assignee: 'ls_gantt_assignee',
  product: 'ls_gantt_product',
  fields: 'ls_gantt_fields',
  scale: 'ls_gantt_scale',
  hideDone: 'ls_gantt_hide_done',
};

const FALLBACK_COLORS = ['#271B79', '#16B7C7', '#2F9E44', '#D9480F', '#6741D9', '#C2255C'];
const AVATAR_COLORS = ['#271B79', '#16B7C7', '#2F9E44', '#D9480F', '#6741D9', '#C2255C'];

grist.ready({ requiredAccess: 'full', allowSelectBy: true });

grist.onOptions((opts) => {
  opts = opts || {};
  _titleColId = opts[OPTS.title] || null;
  _startColId = opts[OPTS.start] || null;
  _endColId = opts[OPTS.end] || null;
  _statusColId = opts[OPTS.status] || null;
  _progressColId = opts[OPTS.progress] || null;
  _assigneeColId = opts[OPTS.assignee] || null;
  _productColId = opts[OPTS.product] || null;
  _visibleFields = Array.isArray(opts[OPTS.fields]) ? opts[OPTS.fields] : null;
  _scale = opts[OPTS.scale] || 'week';
  _hideDone = !!opts[OPTS.hideDone];
  _render();
});

grist.onRecords(async (records) => {
  _records = records || [];
  await _resolveTableId();
  await _loadColsMeta();
  _autoConfigure();
  _render();
});

async function _resolveTableId() {
  if (_tableId) return;
  try {
    const t = grist.selectedTable;
    if (t?.getTableId) {
      _tableId = await t.getTableId();
      return;
    }
  } catch(e) {}
  try {
    const info = await grist.getTable();
    _tableId = info?.tableId || info?._tableId || null;
  } catch(e) {}
}

async function _loadColsMeta() {
  if (!_tableId) return;
  try {
    const tablesData = await grist.docApi.fetchTable('_grist_Tables');
    const colsData = await grist.docApi.fetchTable('_grist_Tables_column');
    const tIdx = tablesData.tableId.indexOf(_tableId);
    const tableRef = tIdx !== -1 ? tablesData.id[tIdx] : null;
    _colsMeta = colsData.id.map((id, i) => ({
      id,
      parentId: colsData.parentId?.[i] ?? null,
      colId: colsData.colId[i],
      label: colsData.label[i] || colsData.colId[i],
      type: colsData.type[i] || 'Text',
      widgetOptions: colsData.widgetOptions?.[i] ?? null,
    })).filter(c => {
      if (!c.colId || c.colId === 'id' || c.colId === 'manualSort' || c.colId.startsWith('gristHelper')) return false;
      if (tableRef !== null && c.parentId !== null) return c.parentId === tableRef;
      return true;
    });
  } catch(e) {
    console.warn('[gantt] _loadColsMeta:', e);
  }
}

function _autoConfigure() {
  if (!_colsMeta.length) return;
  const dateCols = _dateCols();
  const textCols = _colsMeta.filter(c => ['Text', 'Any'].includes(_type(c)));
  const choiceCols = _choiceCols();
  const numericCols = _colsMeta.filter(c => ['Numeric', 'Int'].includes(_type(c)));

  _titleColId ||= _findCol(textCols, ['titre', 'title', 'nom', 'name', 'sujet', 'objet'])?.colId || textCols[0]?.colId || _colsMeta[0]?.colId;
  _startColId ||= _findCol(dateCols, ['debut', 'début', 'start', 'date_debut', 'date_début', 'commence'])?.colId || dateCols[0]?.colId;
  _endColId ||= _findCol(dateCols, ['fin', 'end', 'date_fin', 'echeance', 'échéance', 'deadline', 'due'])?.colId || dateCols.find(c => c.colId !== _startColId)?.colId || _startColId;
  _statusColId ||= _findCol(choiceCols, ['statut', 'status', 'etat', 'état', 'phase'])?.colId || choiceCols[0]?.colId || null;
  _progressColId ||= _findCol(numericCols, ['avancement', 'progress', 'progression', 'pourcentage', 'percent'])?.colId || null;
  _assigneeColId ||= _findCol(_colsMeta, ['assigne', 'assigné', 'responsable', 'testeur', 'owner', 'pilote'])?.colId || null;
  _productColId ||= _findCol(_colsMeta, ['produit', 'product', 'application', 'app'])?.colId || null;
}

function _findCol(cols, needles) {
  return cols.find(c => {
    const s = `${c.colId} ${c.label}`.toLowerCase();
    return needles.some(n => s.includes(n));
  });
}

function _type(col) {
  return String(col?.type || '').split(':')[0];
}

function _dateCols() {
  return _colsMeta.filter(c => {
    const t = String(c.type || '').toLowerCase();
    let w = '';
    try {
      const wo = typeof c.widgetOptions === 'string' ? JSON.parse(c.widgetOptions) : (c.widgetOptions || {});
      w = String(wo?.widget || '').toLowerCase();
    } catch(e) {}
    return t.includes('date') || w === 'date' || w === 'datetime';
  });
}

function _choiceCols() {
  return _colsMeta.filter(c => ['Choice', 'ChoiceList'].includes(_type(c)));
}

async function _saveOpts(patch) {
  const current = {
    [OPTS.title]: _titleColId,
    [OPTS.start]: _startColId,
    [OPTS.end]: _endColId,
    [OPTS.status]: _statusColId,
    [OPTS.progress]: _progressColId,
    [OPTS.assignee]: _assigneeColId,
    [OPTS.product]: _productColId,
    [OPTS.fields]: _visibleFields,
    [OPTS.scale]: _scale,
    [OPTS.hideDone]: _hideDone,
    ...patch,
  };
  _titleColId = current[OPTS.title];
  _startColId = current[OPTS.start];
  _endColId = current[OPTS.end];
  _statusColId = current[OPTS.status];
  _progressColId = current[OPTS.progress];
  _assigneeColId = current[OPTS.assignee];
  _productColId = current[OPTS.product];
  _visibleFields = current[OPTS.fields];
  _scale = current[OPTS.scale];
  _hideDone = current[OPTS.hideDone];
  try {
    for (const [key, value] of Object.entries(current)) {
      await grist.widgetApi.setOption(key, value);
    }
  } catch(e) {
    console.warn('[gantt] setOption:', e);
  }
  _render();
}

function _render() {
  const board = document.getElementById('ls-board');
  if (!board) return;
  board.innerHTML = '';

  board.appendChild(_buildHeader());
  board.appendChild(_buildToolbar());

  if (!_startColId || !_endColId) {
    board.appendChild(_empty('Choisissez une date de début et une date de fin pour afficher le Gantt.'));
    return;
  }

  const tasks = _getTasks();
  if (!tasks.length) {
    board.appendChild(_empty('Aucune ligne avec des dates exploitables.'));
    return;
  }

  board.appendChild(_buildGantt(tasks));
}

function _buildHeader() {
  const header = document.createElement('div');
  header.className = 'ls-app-header';
  header.innerHTML = `
    <div class="ls-brand-mark" aria-hidden="true">${_logoSvg()}</div>
    <div>
      <div class="ls-app-title">Gantt LaSuite</div>
      <div class="ls-app-subtitle">${_records.length} ligne${_records.length > 1 ? 's' : ''}</div>
    </div>`;
  return header;
}

function _buildToolbar() {
  const bar = document.createElement('div');
  bar.className = 'ls-toolbar';

  bar.appendChild(_selectControl('Début', _startColId, _dateCols(), val => _saveOpts({ [OPTS.start]: val || null })));
  bar.appendChild(_selectControl('Fin', _endColId, _dateCols(), val => _saveOpts({ [OPTS.end]: val || null })));
  bar.appendChild(_selectControl('Titre', _titleColId, _colsMeta, val => _saveOpts({ [OPTS.title]: val || null })));

  const scale = document.createElement('div');
  scale.className = 'ls-segmented';
  [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].forEach(([value, label]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = value === _scale ? 'active' : '';
    btn.textContent = label;
    btn.addEventListener('click', () => _saveOpts({ [OPTS.scale]: value }));
    scale.appendChild(btn);
  });
  bar.appendChild(scale);

  bar.appendChild(_toolbarButton(_openPanel === 'settings' ? 'Masquer réglages' : 'Réglages', () => {
    _openPanel = _openPanel === 'settings' ? null : 'settings';
    _render();
  }));
  bar.appendChild(_toolbarButton(_openPanel === 'fields' ? 'Masquer détails' : 'Détails', () => {
    _openPanel = _openPanel === 'fields' ? null : 'fields';
    _render();
  }));

  if (_openPanel === 'settings') bar.appendChild(_buildSettingsPanel());
  if (_openPanel === 'fields') bar.appendChild(_buildFieldsPanel());

  return bar;
}

function _selectControl(label, value, cols, onChange, allowNone = false) {
  const wrap = document.createElement('label');
  wrap.className = 'ls-select-wrap';
  const text = document.createElement('span');
  text.textContent = label;
  const sel = document.createElement('select');
  sel.className = 'ls-toolbar-select';
  if (allowNone) {
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Aucun';
    sel.appendChild(none);
  }
  cols.forEach(col => {
    const opt = document.createElement('option');
    opt.value = col.colId;
    opt.textContent = col.label || col.colId;
    opt.selected = col.colId === value;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(text);
  wrap.appendChild(sel);
  return wrap;
}

function _toolbarButton(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ls-toolbar-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function _buildSettingsPanel() {
  const panel = document.createElement('div');
  panel.className = 'ls-panel';
  panel.appendChild(_selectControl('Couleur', _statusColId, _choiceCols(), val => _saveOpts({ [OPTS.status]: val || null }), true));
  panel.appendChild(_selectControl('Avancement', _progressColId, _colsMeta.filter(c => ['Numeric', 'Int'].includes(_type(c))), val => _saveOpts({ [OPTS.progress]: val || null }), true));
  panel.appendChild(_selectControl('Assigné', _assigneeColId, _colsMeta, val => _saveOpts({ [OPTS.assignee]: val || null }), true));
  panel.appendChild(_selectControl('Produit', _productColId, _colsMeta, val => _saveOpts({ [OPTS.product]: val || null }), true));
  panel.appendChild(_checkbox('Masquer les éléments terminés', _hideDone, checked => _saveOpts({ [OPTS.hideDone]: checked })));
  return panel;
}

function _buildFieldsPanel() {
  const panel = document.createElement('div');
  panel.className = 'ls-panel';
  const all = _dataCols();
  panel.appendChild(_checkbox('Afficher tous les champs', _visibleFields === null, checked => {
    _saveOpts({ [OPTS.fields]: checked ? null : [] });
  }));
  const grid = document.createElement('div');
  grid.className = 'ls-panel-grid';
  all.forEach(col => {
    grid.appendChild(_checkbox(col.label || col.colId, _visibleFields === null || _visibleFields.includes(col.colId), checked => {
      let cur = _visibleFields ? [..._visibleFields] : all.map(c => c.colId);
      if (checked && !cur.includes(col.colId)) cur.push(col.colId);
      if (!checked) cur = cur.filter(id => id !== col.colId);
      _saveOpts({ [OPTS.fields]: cur.length === all.length ? null : cur });
    }));
  });
  panel.appendChild(grid);
  return panel;
}

function _checkbox(label, checked, onChange) {
  const row = document.createElement('label');
  row.className = 'ls-check-row';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.addEventListener('change', () => onChange(cb.checked));
  const span = document.createElement('span');
  span.textContent = label;
  row.appendChild(cb);
  row.appendChild(span);
  return row;
}

function _dataCols() {
  const hidden = new Set([_titleColId, _startColId, _endColId, _statusColId, _progressColId, _assigneeColId, _productColId]);
  return _colsMeta.filter(c => !hidden.has(c.colId) && _type(c) !== 'Attachments');
}

function _getTasks() {
  return _records.map(rec => {
    const start = _toDate(rec[_startColId]);
    const end = _toDate(rec[_endColId]) || start;
    if (!start) return null;
    const safeEnd = end < start ? start : end;
    const status = _statusColId ? rec[_statusColId] : null;
    const progress = _progressColId ? _progressValue(rec[_progressColId]) : null;
    if (_hideDone && (_isDone(status) || progress === 100)) return null;
    return { rec, start, end: safeEnd, status, progress };
  }).filter(Boolean).sort((a, b) => a.start - b.start || a.end - b.end);
}

function _toDate(value) {
  if (!value) return null;
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (isNaN(d)) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function _progressValue(value) {
  const n = Number(value);
  if (isNaN(n)) return null;
  return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
}

function _isDone(value) {
  return ['terminé', 'termine', 'done', 'fini', 'closed', 'archivé', 'archive'].includes(String(value || '').trim().toLowerCase());
}

function _buildGantt(tasks) {
  const range = _buildRange(tasks);
  const wrap = document.createElement('div');
  wrap.className = 'ls-gantt-wrap';
  wrap.style.setProperty('--unit-count', range.units.length);
  wrap.style.setProperty('--unit-width', _scale === 'day' ? '42px' : (_scale === 'week' ? '78px' : '112px'));

  const grid = document.createElement('div');
  grid.className = 'ls-gantt-grid';
  grid.style.gridTemplateColumns = `var(--label-width) repeat(${range.units.length}, var(--unit-width))`;

  grid.appendChild(_cornerCell());
  range.units.forEach(unit => grid.appendChild(_headerCell(unit)));

  tasks.forEach((task, index) => {
    const rowLabel = _taskLabel(task);
    grid.appendChild(rowLabel);
    range.units.forEach(() => {
      const cell = document.createElement('div');
      cell.className = 'ls-gantt-cell';
      grid.appendChild(cell);
    });
    const bar = _taskBar(task, range, index + 2);
    grid.appendChild(bar);
  });

  wrap.appendChild(grid);
  return wrap;
}

function _buildRange(tasks) {
  const min = new Date(Math.min(...tasks.map(t => t.start.getTime())));
  const max = new Date(Math.max(...tasks.map(t => t.end.getTime())));
  const start = _floorUnit(_addDays(min, _scale === 'month' ? -15 : -7));
  const end = _ceilUnit(_addDays(max, _scale === 'month' ? 15 : 7));
  const units = [];
  let cursor = new Date(start);
  while (cursor <= end && units.length < 260) {
    const unitStart = new Date(cursor);
    const next = _nextUnit(cursor);
    units.push({ start: unitStart, end: _addDays(next, -1), label: _unitLabel(unitStart) });
    cursor = next;
  }
  return { start, end, units };
}

function _floorUnit(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (_scale === 'week') {
    const day = (d.getDay() + 6) % 7;
    return _addDays(d, -day);
  }
  if (_scale === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  return d;
}

function _ceilUnit(date) {
  const d = _floorUnit(date);
  while (d < date) {
    const next = _nextUnit(d);
    d.setTime(next.getTime());
  }
  return d;
}

function _nextUnit(date) {
  const d = new Date(date);
  if (_scale === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return _addDays(d, _scale === 'week' ? 7 : 1);
}

function _addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function _unitLabel(date) {
  if (_scale === 'month') return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  if (_scale === 'week') return `S${_weekNumber(date)}`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function _weekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function _cornerCell() {
  const cell = document.createElement('div');
  cell.className = 'ls-gantt-corner';
  cell.textContent = 'Élément';
  return cell;
}

function _headerCell(unit) {
  const cell = document.createElement('div');
  cell.className = 'ls-gantt-head';
  cell.textContent = unit.label;
  return cell;
}

function _taskLabel(task) {
  const { rec } = task;
  const label = document.createElement('div');
  label.className = 'ls-task-label';
  if (_expandedRecordId === rec.id) label.classList.add('expanded');

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'ls-task-main';
  main.addEventListener('click', () => _toggleTask(rec.id));

  const caret = document.createElement('span');
  caret.className = 'ls-task-caret';
  caret.textContent = _expandedRecordId === rec.id ? '⌄' : '›';
  main.appendChild(caret);

  const titleWrap = document.createElement('span');
  titleWrap.className = 'ls-task-title-wrap';
  const title = document.createElement('span');
  title.className = 'ls-task-title';
  title.textContent = String(rec[_titleColId] || `#${rec.id}`);
  titleWrap.appendChild(title);

  const chips = document.createElement('span');
  chips.className = 'ls-task-chips';
  const product = _productText(rec);
  if (product) chips.appendChild(_chip(product, 'product'));
  const assignee = _assigneeText(rec);
  if (assignee) chips.appendChild(_chip(assignee, 'assignee'));
  titleWrap.appendChild(chips);
  main.appendChild(titleWrap);

  if (assignee) main.appendChild(_avatar(assignee));

  label.appendChild(main);

  const meta = document.createElement('span');
  meta.className = 'ls-task-meta';
  meta.textContent = `${Render.formatDate(task.start)} → ${Render.formatDate(task.end)}`;
  label.appendChild(meta);

  if (_expandedRecordId === rec.id) {
    const fields = _dataCols().filter(col => _visibleFields === null || _visibleFields.includes(col.colId));
    const shown = fields.filter(col => !Render.isNil(rec[col.colId]));
    const extra = document.createElement('div');
    extra.className = 'ls-task-extra';
    extra.innerHTML = shown.length
      ? shown.map(col => Render.field(col.label, col, col.type, rec[col.colId])).join('')
      : '<span class="ls-muted">Aucun détail supplémentaire.</span>';
    label.appendChild(extra);
  }

  return label;
}

function _taskBar(task, range, rowNumber) {
  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'ls-gantt-bar';
  bar.style.gridRow = String(rowNumber);
  bar.style.gridColumn = `${_unitIndex(task.start, range) + 2} / ${_unitIndex(task.end, range) + 3}`;
  bar.style.background = _statusColor(task);
  bar.title = `${String(task.rec[_titleColId] || `#${task.rec.id}`)} · ${Render.formatDate(task.start)} - ${Render.formatDate(task.end)}`;
  bar.addEventListener('click', () => grist.setCursorPos({ rowId: task.rec.id }));

  const text = document.createElement('span');
  text.className = 'ls-gantt-bar-text';
  text.textContent = String(task.rec[_titleColId] || `#${task.rec.id}`);
  bar.appendChild(text);

  if (task.progress !== null) {
    const progress = document.createElement('span');
    progress.className = 'ls-gantt-progress';
    progress.style.width = `${task.progress}%`;
    bar.appendChild(progress);
  }

  const assignee = _assigneeText(task.rec);
  if (assignee) bar.appendChild(_avatar(assignee));

  return bar;
}

function _unitIndex(date, range) {
  const t = _floorUnit(date).getTime();
  const idx = range.units.findIndex(u => u.start.getTime() === t);
  if (idx !== -1) return idx;
  return Math.max(0, Math.min(range.units.length - 1, range.units.findIndex(u => date >= u.start && date <= u.end)));
}

function _statusColor(task) {
  if (!_statusColId || Render.isNil(task.status)) return '#271B79';
  const meta = _colsMeta.find(c => c.colId === _statusColId);
  const colors = Render.getChoiceColor(meta, String(task.status));
  if (colors?.bg) return colors.bg;
  let h = 0;
  const s = String(task.status);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % FALLBACK_COLORS.length;
  return FALLBACK_COLORS[h];
}

function _labelValue(value) {
  if (Array.isArray(value)) return value.map(_labelValue).join(', ');
  if (value && typeof value === 'object') return value.label ?? value.name ?? value.TITRE ?? String(value.id ?? '');
  return String(value);
}

function _toggleTask(rowId) {
  _expandedRecordId = _expandedRecordId === rowId ? null : rowId;
  grist.setCursorPos({ rowId });
  _render();
}

function _productText(rec) {
  return _productColId && !Render.isNil(rec[_productColId]) ? _labelValue(rec[_productColId]) : '';
}

function _assigneeText(rec) {
  return _assigneeColId && !Render.isNil(rec[_assigneeColId]) ? _labelValue(rec[_assigneeColId]) : '';
}

function _chip(text, kind) {
  const chip = document.createElement('span');
  chip.className = `ls-chip ${kind ? 'ls-chip-' + kind : ''}`;
  chip.textContent = text;
  chip.title = text;
  return chip;
}

function _avatar(label) {
  const avatar = document.createElement('span');
  avatar.className = 'ls-avatar';
  avatar.style.background = _avatarColor(label);
  avatar.textContent = _initials(label);
  avatar.title = label;
  return avatar;
}

function _avatarColor(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function _initials(s) {
  const parts = String(s || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function _logoSvg() {
  return `<svg width="44" height="44" viewBox="0 0 329 331" fill="none" xmlns="http://www.w3.org/2000/svg" style="--marked-color:#16B7C7;--text-color:#271B79;--second-marked-color:#B9FFB7">
    <path d="M30 115c0-46.9442 38.0558-85 85-85H244c46.944 0 85 38.0558 85 85V246c0 46.944-38.056 85-85 85H115c-46.9442 0-85-38.056-85-85V115z" fill="var(--marked-color)"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M244 42H115c-40.3168 0-73 32.6832-73 73V246c0 40.317 32.6832 73 73 73H244c40.317 0 73-32.683 73-73V115c0-40.3168-32.683-73-73-73zM115 30c-46.9442 0-85 38.0558-85 85V246c0 46.944 38.0558 85 85 85H244c46.944 0 85-38.056 85-85V115c0-46.9442-38.056-85-85-85H115z" fill="var(--text-color)"/>
    <path d="M0 64C0 28.6538 28.6538 0 64 0H236c35.346 0 64 28.6538 64 64V236c0 35.346-28.654 64-64 64H64c-35.3462 0-64-28.654-64-64V64z" fill="var(--second-marked-color)"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M236 12H64C35.2812 12 12 35.2812 12 64V236c0 28.719 23.2812 52 52 52H236c28.719 0 52-23.281 52-52V64c0-28.7188-23.281-52-52-52zM64 0C28.6538 0 0 28.6538 0 64V236c0 35.346 28.6538 64 64 64H236c35.346 0 64-28.654 64-64V64c0-35.3462-28.654-64-64-64H64z" fill="var(--text-color)"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M140.585 139.932l18.758 23.314C161.2 162.547 163.598 161.839 165.282 162.008 168.83 162.291 171.903 164.022 174.503 167.203 177.104 170.383 178.19 173.739 177.763 177.273 177.415 180.741 175.612 183.808 172.353 186.474L146.718 207.44C143.538 210.041 140.175 211.199 136.628 210.917 133.16 210.569 130.126 208.805 127.526 205.625 124.926 202.445 123.8 199.12 124.147 195.652 124.574 192.119 126.378 189.052 129.557 186.451 130.034 186.061 130.262 185.61 130.24 185.097 130.219 184.583 129.941 184.081 129.406 183.59l-16.359-18.062C111.992 164.4 111.107 164.129 110.392 164.714 104.669 169.395 100.759 174.914 98.6619 181.273 96.5001 187.551 96.2348 194.203 97.8658 201.227 99.5113 208.107 102.999 214.806 108.329 221.325 113.66 227.844 119.644 232.568 126.283 235.497 132.857 238.345 139.586 239.276 146.472 238.288 153.372 237.155 159.882 234.086 166.003 229.08l24.085-19.699c6.041-4.941 10.261-10.648 12.662-17.122C205.085 185.706 205.509 178.924 204.023 171.915 202.471 164.826 199.03 158.021 193.7 151.502 188.37 144.983 182.497 140.234 176.082 137.255 169.602 134.197 163.071 133.104 156.49 133.976 153.16 134.345 149.939 135.223 146.827 136.608L146.482 136.754S145.464 137.24 145.365 137.299C144.83 137.62 144.347 137.924 143.901 138.205 142.917 138.823 142.109 139.331 141.308 139.672 141.068 139.766 140.827 139.853 140.585 139.932z" fill="var(--marked-color)"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M107.21 150.897C101.88 144.378 98.4388 137.574 96.8873 130.485 95.4007 123.475 95.825 116.694 98.1602 110.14 100.64 103.601 104.94 97.8291 111.061 92.8232l24.085-19.6987C141.187 68.1836 147.617 65.1793 154.438 64.1117 161.323 63.1236 168.053 64.054 174.627 66.9028 181.266 69.8311 187.25 74.5548 192.58 81.0741 197.911 87.5933 201.398 94.2927 203.044 101.172 204.755 108.131 204.529 114.75 202.367 121.029 200.35 127.322 196.48 132.809 190.757 137.49 190.041 138.075 189.116 137.837 187.982 136.774l-16.598-17.867L171.092 118.549C170.312 117.595 170.359 116.761 171.233 116.046 174.492 113.38 176.296 110.313 176.643 106.845 177.071 103.311 175.984 99.9546 173.384 96.7745 170.784 93.5944 167.71 91.863 164.163 91.5802 160.695 91.2324 157.332 92.3913 154.073 95.0568L128.438 116.023C125.258 118.624 123.455 121.691 123.028 125.224 122.68 128.692 123.806 132.017 126.406 135.197 129.006 138.377 132.04 140.141 135.508 140.489 137.473 140.645 138.654 140.622 140.506 139.894l18.758 23.314C158.937 163.331 158.627 163.454 158.341 163.571 157.89 163.755 157.159 164.146 156.997 164.276 156.904 164.352 155.46 165.165 155.059 165.328 154.907 165.39 154.818 165.427 154.73 165.463 154.554 165.534 154.379 165.604 153.723 165.869 150.743 167.071 147.705 167.948 144.539 168.325 137.958 169.198 131.387 168.138 124.828 165.144 118.413 162.165 112.54 157.416 107.21 150.897z" fill="var(--text-color)"/>
  </svg>`;
}

function _empty(text) {
  const empty = document.createElement('div');
  empty.className = 'ls-empty';
  empty.textContent = text;
  return empty;
}
