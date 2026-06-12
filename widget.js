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
let _visibleFields = null;
let _scale = 'week';
let _hideDone = false;

const OPTS = {
  title: 'ls_gantt_title',
  start: 'ls_gantt_start',
  end: 'ls_gantt_end',
  status: 'ls_gantt_status',
  progress: 'ls_gantt_progress',
  assignee: 'ls_gantt_assignee',
  fields: 'ls_gantt_fields',
  scale: 'ls_gantt_scale',
  hideDone: 'ls_gantt_hide_done',
};

const FALLBACK_COLORS = ['#271B79', '#16B7C7', '#2F9E44', '#D9480F', '#6741D9', '#C2255C'];

grist.ready({ requiredAccess: 'full', allowSelectBy: true });

grist.onOptions((opts) => {
  opts = opts || {};
  _titleColId = opts[OPTS.title] || null;
  _startColId = opts[OPTS.start] || null;
  _endColId = opts[OPTS.end] || null;
  _statusColId = opts[OPTS.status] || null;
  _progressColId = opts[OPTS.progress] || null;
  _assigneeColId = opts[OPTS.assignee] || null;
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
    <div class="ls-brand-mark" aria-hidden="true">LS</div>
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
  bar.appendChild(_selectControl('Couleur', _statusColId, _choiceCols(), val => _saveOpts({ [OPTS.status]: val || null }), true));

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

  bar.appendChild(_toolbarButton(_openPanel === 'settings' ? 'Masquer options' : 'Options', () => {
    _openPanel = _openPanel === 'settings' ? null : 'settings';
    _render();
  }));
  bar.appendChild(_toolbarButton(_openPanel === 'fields' ? 'Masquer champs' : 'Champs', () => {
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
  panel.appendChild(_selectControl('Avancement', _progressColId, _colsMeta.filter(c => ['Numeric', 'Int'].includes(_type(c))), val => _saveOpts({ [OPTS.progress]: val || null }), true));
  panel.appendChild(_selectControl('Assigné', _assigneeColId, _colsMeta, val => _saveOpts({ [OPTS.assignee]: val || null }), true));
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
  const hidden = new Set([_titleColId, _startColId, _endColId, _statusColId, _progressColId, _assigneeColId]);
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
  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'ls-task-label';
  label.addEventListener('click', () => grist.setCursorPos({ rowId: rec.id }));

  const title = document.createElement('span');
  title.className = 'ls-task-title';
  title.textContent = String(rec[_titleColId] || `#${rec.id}`);
  label.appendChild(title);

  const meta = document.createElement('span');
  meta.className = 'ls-task-meta';
  const pieces = [];
  if (_assigneeColId && !Render.isNil(rec[_assigneeColId])) pieces.push(_labelValue(rec[_assigneeColId]));
  pieces.push(`${Render.formatDate(task.start)} → ${Render.formatDate(task.end)}`);
  meta.textContent = pieces.join(' · ');
  label.appendChild(meta);

  const fields = _dataCols().filter(col => _visibleFields === null || _visibleFields.includes(col.colId));
  const shown = fields.filter(col => !Render.isNil(rec[col.colId])).slice(0, 3);
  if (shown.length) {
    const extra = document.createElement('span');
    extra.className = 'ls-task-extra';
    extra.innerHTML = shown.map(col => Render.field(col.label, col, col.type, rec[col.colId])).join('');
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

function _empty(text) {
  const empty = document.createElement('div');
  empty.className = 'ls-empty';
  empty.textContent = text;
  return empty;
}
