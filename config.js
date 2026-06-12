/* config.js — Ancien panneau de configuration du Kanban
   Gère : colonnes mappées, champs visibles sur les cartes,
          mode lecture seule. Tout est persisté via widgetApi.setOption.
*/

const Config = (() => {

  const OPT_FIELDS   = 'ls_visible_fields';   // liste des colIds à afficher
  const OPT_READONLY = 'ls_readonly';          // bool
  const OPT_TITLECOL = 'ls_title_col';         // colId utilisé comme titre

  let _opts    = {};
  let _colsMeta = [];   // snapshot de _grist_Tables_column
  let _onChangeCb = null;

  /* ── Lecture / écriture options ───────────────────────────── */

  function getVisibleFields() {
    return Array.isArray(_opts[OPT_FIELDS]) ? _opts[OPT_FIELDS] : null;
  }

  function isReadonly() {
    return !!_opts[OPT_READONLY];
  }

  function getTitleCol() {
    return _opts[OPT_TITLECOL] || null;
  }

  async function setVisibleFields(fields) {
    await grist.widgetApi.setOption(OPT_FIELDS, fields);
  }

  async function setReadonly(val) {
    await grist.widgetApi.setOption(OPT_READONLY, val);
  }

  async function setTitleCol(colId) {
    await grist.widgetApi.setOption(OPT_TITLECOL, colId);
  }

  /* ── Mise à jour depuis Grist ─────────────────────────────── */

  function onOptions(opts, cb) {
    _opts = opts || {};
    _onChangeCb = cb;
  }

  function setColsMeta(cols) {
    _colsMeta = cols || [];
  }

  /* ── Rendu du panneau ─────────────────────────────────────── */

  function render(containerEl) {
    containerEl.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'ls-config-title';
    title.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> Configuration du Gantt';
    containerEl.appendChild(title);

    const userCols = _colsMeta.filter(c =>
      !c.colId.startsWith('gristHelper') &&
      c.colId !== 'id' &&
      c.type !== 'Attachments'
    );

    /* Section : colonne titre */
    containerEl.appendChild(_sectionTitle('Colonne titre des cartes'));
    const titleSel = document.createElement('select');
    titleSel.className = 'ls-config-select';
    titleSel.style.marginBottom = '16px';
    userCols.forEach(col => {
      if (!['Choice','ChoiceList','Ref','RefList'].includes(col.type.split(':')[0])) {
        const opt = document.createElement('option');
        opt.value = col.colId;
        opt.textContent = col.label || col.colId;
        opt.selected = col.colId === getTitleCol();
        titleSel.appendChild(opt);
      }
    });
    titleSel.addEventListener('change', async () => {
      await setTitleCol(titleSel.value);
      _onChangeCb && _onChangeCb();
    });
    containerEl.appendChild(titleSel);

    /* Section : champs visibles sur les cartes */
    containerEl.appendChild(_sectionTitle('Champs affichés sur les cartes'));
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#9B9B95;margin-bottom:10px';
    hint.textContent = 'Cochez les champs à afficher. Décochez pour alléger les cartes.';
    containerEl.appendChild(hint);

    const currentVisible = getVisibleFields();
    const allColIds = userCols.map(c => c.colId);

    userCols.forEach(col => {
      if (col.colId === getTitleCol()) return;

      const row = document.createElement('div');
      row.className = 'ls-config-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'cfg_' + col.colId;
      cb.checked = currentVisible === null
        ? true
        : currentVisible.includes(col.colId);

      cb.addEventListener('change', async () => {
        const allCbs = containerEl.querySelectorAll('input[type=checkbox][id^="cfg_"]');
        const visible = Array.from(allCbs)
          .filter(c => c.checked)
          .map(c => c.id.replace('cfg_', ''));
        await setVisibleFields(visible);
        _onChangeCb && _onChangeCb();
      });

      const lbl = document.createElement('label');
      lbl.htmlFor = 'cfg_' + col.colId;
      lbl.style.cursor = 'pointer';
      lbl.style.flex = '1';

      const typeTag = document.createElement('span');
      typeTag.style.cssText = 'font-size:10px;color:#9B9B95;margin-left:6px;font-family:monospace';
      typeTag.textContent = col.type.split(':')[0];

      lbl.textContent = col.label || col.colId;
      lbl.appendChild(typeTag);

      row.appendChild(cb);
      row.appendChild(lbl);
      containerEl.appendChild(row);
    });

    /* Section : mode lecture seule */
    containerEl.appendChild(_sectionTitle('Options'));

    const roRow = document.createElement('div');
    roRow.className = 'ls-toggle-row';
    roRow.innerHTML = `
      <span>Mode lecture seule (pas de drag & drop ni d'ajout)</span>
      <label class="ls-toggle">
        <input type="checkbox" id="cfg_readonly" ${isReadonly() ? 'checked' : ''}>
        <span class="ls-toggle-slider"></span>
      </label>`;
    containerEl.appendChild(roRow);

    containerEl.querySelector('#cfg_readonly')
      .addEventListener('change', async (e) => {
        await setReadonly(e.target.checked);
        _onChangeCb && _onChangeCb();
      });
  }

  function _sectionTitle(text) {
    const el = document.createElement('div');
    el.className = 'ls-config-section';
    const lbl = document.createElement('div');
    lbl.className = 'ls-config-label';
    lbl.textContent = text;
    el.appendChild(lbl);
    return el;
  }

  return {
    onOptions,
    setColsMeta,
    getVisibleFields,
    isReadonly,
    getTitleCol,
    render,
    OPT_FIELDS,
    OPT_READONLY,
    OPT_TITLECOL,
  };
})();
