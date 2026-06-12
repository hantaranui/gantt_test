/* render.js — Rendu des valeurs Grist
   Inspiré de la fonction renderFieldValue d'Élodie Gateau
   Adapté à la charte LaSuite.coop
*/

const Render = (() => {

  /* ── Helpers internes ─────────────────────────────────────── */

  function isNil(v) {
    return v === null || v === undefined || v === '' ||
           (Array.isArray(v) && v.length === 0);
  }

  function safeJson(s) {
    try { return typeof s === 'string' ? JSON.parse(s) : s; }
    catch { return null; }
  }

  /* Récupère la couleur de fond associée à un choix depuis les
     widgetOptions de la colonne (tel que stocké par Grist).
     Retourne { bg, text } ou null. */
  function getChoiceColor(colMeta, label) {
    if (!colMeta) return null;
    const wo = safeJson(colMeta.widgetOptions);
    if (!wo) return null;

    if (wo.choicesById) {
      const entry = Object.values(wo.choicesById)
        .find(c => (c.label ?? c.value) === label);
      if (entry?.fillColor) return colorPair(entry.fillColor, entry.textColor);
    }
    if (wo.choiceOptions) {
      const entry = wo.choiceOptions[label];
      if (entry?.fillColor) return colorPair(entry.fillColor, entry.textColor);
    }
    return null;
  }

  function colorPair(fill, text) {
    const bg = fill?.startsWith('#') ? fill : (fill ? '#' + fill : null);
    const fg = text?.startsWith('#') ? text : (text ? '#' + text : null);
    return bg ? { bg, fg: fg || darken(bg) } : null;
  }

  /* Assombrit un hex pour obtenir un texte lisible sur fond coloré */
  function darken(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    return lum > 0.55 ? '#1A1154' : '#FFFFFF';
  }

  function formatDate(v) {
    if (!v) return '';
    const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
  }

  function formatDateTime(v) {
    if (!v) return '';
    const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString('fr-FR', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    });
  }

  /* ── Badge HTML ───────────────────────────────────────────── */
  function badge(label, colors, extraClass = '') {
    if (!label) return '';
    const cls = 'ls-badge ' + (extraClass || 'ls-badge-default');
    const style = colors
      ? `background:${colors.bg};color:${colors.fg};`
      : '';
    return `<span class="${cls}" style="${style}" title="${label}">${label}</span>`;
  }

  /* ── Rendu principal ──────────────────────────────────────── */

  /* colMeta : objet colonne depuis _grist_Tables_column (optionnel)
     fieldType : string ex. "Choice", "Ref:Utilisateurs", "Date"...
     value : valeur brute depuis grist.onRecords                    */
  function value(colMeta, fieldType, val) {
    if (isNil(val)) return '<span style="color:#9B9B95">—</span>';

    const type = (fieldType || '').split(':')[0];

    switch (type) {
      case 'Bool':
        return val
          ? '<span style="color:#271B79;font-size:13px">✓</span>'
          : '<span style="color:#E2E2DE;font-size:13px">○</span>';

      case 'Date':
        return `<span>${formatDate(val)}</span>`;

      case 'DateTime':
        return `<span>${formatDateTime(val)}</span>`;

      case 'Choice': {
        const colors = getChoiceColor(colMeta, val);
        return badge(String(val), colors);
      }

      case 'ChoiceList': {
        const items = Array.isArray(val) ? val : [val];
        return items
          .filter(Boolean)
          .map(item => badge(String(item), getChoiceColor(colMeta, item)))
          .join(' ');
      }

      case 'Ref':
      case 'RefList': {
        const items = Array.isArray(val) ? val : [val];
        return items
          .filter(Boolean)
          .map(item => {
            const label = typeof item === 'object'
              ? (item.label ?? item.name ?? item.TITRE ?? String(item.id ?? item))
              : String(item);
            return badge(label, null, 'ls-badge ls-badge-ref');
          })
          .join(' ');
      }

      case 'Numeric':
      case 'Int': {
        const n = Number(val);
        return isNaN(n) ? String(val) : n.toLocaleString('fr-FR');
      }

      default:
        return `<span>${String(val)}</span>`;
    }
  }

  /* Rendu d'un champ complet : label + valeur */
  function field(label, colMeta, fieldType, val) {
    if (isNil(val)) return '';
    const rendered = value(colMeta, fieldType, val);
    return `
      <div class="ls-card-field">
        <span class="ls-card-field-label">${label} :</span>
        <span>${rendered}</span>
      </div>`;
  }

  return { value, field, getChoiceColor, isNil, formatDate };
})();
