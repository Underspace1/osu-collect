/* osu!collect web UI — no framework, no build step. */
'use strict';

const TOKEN = document.querySelector('meta[name="osu-collect-token"]').content;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------------ */
/* Preferences (per-browser)                                           */
/* ------------------------------------------------------------------ */

const PREF_KEY = 'oc.prefs';
const prefs = Object.assign(
  { theme: 'dark', accent: 'pink', density: 'comfortable', lang: navigator.language?.startsWith('fr') ? 'fr' : 'en', jump: true, sound: true, volume: 0.5 },
  safeJSON(localStorageGet(PREF_KEY)) || {},
);

function localStorageGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
function safeJSON(s) { try { return JSON.parse(s); } catch (_) { return null; } }

function savePrefs() { localStorageSet(PREF_KEY, JSON.stringify(prefs)); applyPrefs(); }

function applyPrefs() {
  const root = document.documentElement;
  const dark = prefs.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : prefs.theme !== 'light';
  root.dataset.theme = dark ? 'dark' : 'light';
  if (prefs.theme === 'lazer') {
    root.dataset.skin = 'lazer';
    if (!document.getElementById('lazer-font')) {
      const l = document.createElement('link');
      l.id = 'lazer-font'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700&display=swap';
      document.head.append(l);
    }
  } else delete root.dataset.skin;
  Triangles.sync();
  if (prefs.accent && prefs.accent !== 'pink') root.dataset.accent = prefs.accent; else delete root.dataset.accent;
  root.dataset.density = prefs.density;
  root.lang = prefs.lang;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => prefs.theme === 'system' && applyPrefs());

/* ------------------------------------------------------------------ */
/* i18n                                                                */
/* ------------------------------------------------------------------ */

const STR = {
  en: {
    nav_download: 'Download', nav_downloads: 'Downloads', nav_settings: 'Settings',
    live: 'Connected', offline: 'Reconnecting…',
    dl_title: 'Download a collection', dl_sub: 'Paste a link from osu!collector to preview and download every beatmap.',
    dl_placeholder: 'https://osucollector.com/collections/12345  or  12345',
    dl_load: 'Load collection', dl_recent: 'Last used:',
    step1_t: 'Paste a collection', step1_d: 'Any osu!collector URL or numeric ID works.',
    step2_t: 'Pick a folder', step2_d: 'Point it at your osu! Songs folder or anywhere you like.',
    step3_t: 'Download', step3_d: 'Maps are pulled from several mirrors with automatic failover, and a collection.db is written for import.',
    collection: 'Collection', by: 'by',
    st_sets: 'Beatmapsets', st_diffs: 'Difficulties', st_favs: 'Favourites', st_id: 'Collection ID',
    dest: 'Destination folder', browse: 'Browse', download: 'Download collection', downloading: 'Starting…',
    beatmaps: 'Beatmaps', show_more: 'Show more', open_osu: 'Open on osu!', open_collector: 'osu!collector',
    unknown_set: 'Beatmapset', diffs: (n) => `${n} diff${n === 1 ? '' : 's'}`,
    runs_title: 'Downloads', runs_sub: 'Live progress of everything started in this session.',
    runs_empty_t: 'Nothing downloading yet', runs_empty_d: 'Start a collection download and its progress will show up here in real time.',
    runs_empty_btn: 'Download a collection', clear_done: 'Clear finished',
    s_pending: 'Queued', s_resolving: 'Resolving', s_rechecking: 'Checking files', s_downloading: 'Downloading', s_completed: 'Completed', s_failed: 'Failed', s_cancelled: 'Cancelled',
    maps_of: (a, b) => `${a} of ${b} maps`, resolving_n: (a, b) => `Fetching collection… ${a}/${b}`, resolving: 'Fetching collection…',
    r_downloaded: 'Downloaded', r_skipped: 'Skipped', r_failed: 'Failed', r_remaining: 'Remaining', r_size: 'Size', r_elapsed: 'Elapsed',
    eta: 'left', active: 'In progress', recent: 'Recently finished', failures: 'Failed maps',
    cancel: 'Stop', remove: 'Remove', open_folder: 'Open folder',
    m_pending: 'Queued', m_downloading: 'Downloading', m_verifying: 'Verifying', m_success: 'Done', m_skipped: 'Skipped', m_failed: 'Failed', m_aborted: 'Aborted',
    set_title: 'Settings', set_sub: 'Saved to your osu!collect config file, shared with the terminal app.',
    g_appearance: 'Appearance', g_appearance_d: 'Only affects this browser.',
    theme: 'Theme', theme_d: 'Light, dark, the osu!lazer-inspired skin, or follow your system.', t_dark: 'Dark', t_light: 'Light', t_system: 'System', t_lazer: 'Lazer',
    sound: 'Interface sounds', sound_d: 'Short sounds when you click, toggle or finish a download.',
    volume: 'Volume', volume_d: 'How loud interface sounds are.',
    accent: 'Accent colour', accent_d: 'Used for buttons, progress and highlights.',
    density: 'Density', density_d: 'Spacing between elements.', d_comfortable: 'Comfortable', d_compact: 'Compact',
    language: 'Language', language_d: 'Interface language.',
    jump: 'Open Downloads on start', jump_d: 'Switch to the Downloads page when a download begins.',
    g_downloads: 'Downloads', g_downloads_d: 'Defaults used for every new download.',
    def_dir: 'Default folder', def_dir_d: 'Where collections are saved when you don’t pick one.',
    threads: 'Parallel downloads', threads_d: 'How many maps download at once. Leave empty for automatic.', auto: 'auto',
    video: 'Include videos', video_d: 'Download beatmap background videos when the mirror has them.',
    skip_imported: 'Skip maps I already have', skip_imported_d: 'Maps already in your osu! library are skipped but still added to collection.db.',
    g_mirrors: 'Mirrors', g_mirrors_d: 'Tried from top to bottom. Drag to reorder.',
    custom_mirrors: 'Custom mirrors', custom_mirrors_d: 'URL templates containing {id}, tried after the built-in mirrors.',
    add_mirror: 'Add mirror', move_up: 'Move up', move_down: 'Move down',
    g_osu: 'osu! installation', g_osu_d: 'Used to detect maps you already have.',
    client: 'Client', client_d: 'Which osu! you play on.',
    osu_path: 'Install folder', osu_path_d: 'Leave empty to auto-detect.', detected: 'Detected:', not_detected: 'Not detected',
    g_advanced: 'Advanced',
    auto_defer: 'Requeue rate-limited maps', auto_defer_d: 'Instead of waiting on a throttled mirror, retry the map later.',
    defer_secs: 'Wait before requeue', defer_secs_d: 'Seconds to wait on a rate limit before requeueing.',
    validation: 'Archive validation', validation_d: 'How strictly downloaded .osz files are checked.',
    v_off: 'Off', v_magic: 'Standard', v_eocd: 'Strict',
    unsaved: 'You have unsaved changes', discard: 'Discard', save: 'Save changes', saved: 'Settings saved',
    pick_folder: 'Choose a folder', up: 'Up', select_folder: 'Use this folder', cancel_btn: 'Cancel', empty_dir: 'No sub-folders here',
    err_generic: 'Something went wrong', started: 'Download started', started_d: (n) => `${n} is now downloading.`,
    finished: 'Download finished', finished_d: (n, a, b) => `${n}: ${a} downloaded, ${b} failed.`,
    loading: 'Loading…', meta_unavailable: 'Map titles unavailable — showing beatmapset IDs.',
  },
  fr: {
    nav_download: 'Télécharger', nav_downloads: 'Téléchargements', nav_settings: 'Paramètres',
    live: 'Connecté', offline: 'Reconnexion…',
    dl_title: 'Télécharger une collection', dl_sub: 'Collez un lien osu!collector pour prévisualiser et télécharger toutes les beatmaps.',
    dl_placeholder: 'https://osucollector.com/collections/12345  ou  12345',
    dl_load: 'Charger', dl_recent: 'Dernière utilisée :',
    step1_t: 'Collez une collection', step1_d: 'N’importe quel lien osu!collector ou identifiant numérique.',
    step2_t: 'Choisissez un dossier', step2_d: 'Votre dossier Songs d’osu! ou n’importe où ailleurs.',
    step3_t: 'Téléchargez', step3_d: 'Les maps passent par plusieurs miroirs avec bascule automatique, et un collection.db est généré pour l’import.',
    collection: 'Collection', by: 'par',
    st_sets: 'Beatmapsets', st_diffs: 'Difficultés', st_favs: 'Favoris', st_id: 'ID de collection',
    dest: 'Dossier de destination', browse: 'Parcourir', download: 'Télécharger la collection', downloading: 'Démarrage…',
    beatmaps: 'Beatmaps', show_more: 'Afficher plus', open_osu: 'Ouvrir sur osu!', open_collector: 'osu!collector',
    unknown_set: 'Beatmapset', diffs: (n) => `${n} diff${n === 1 ? '' : 's'}`,
    runs_title: 'Téléchargements', runs_sub: 'Progression en direct de tout ce qui a été lancé pendant cette session.',
    runs_empty_t: 'Aucun téléchargement', runs_empty_d: 'Lancez le téléchargement d’une collection et sa progression s’affichera ici en temps réel.',
    runs_empty_btn: 'Télécharger une collection', clear_done: 'Effacer les terminés',
    s_pending: 'En attente', s_resolving: 'Résolution', s_rechecking: 'Vérification', s_downloading: 'Téléchargement', s_completed: 'Terminé', s_failed: 'Échec', s_cancelled: 'Annulé',
    maps_of: (a, b) => `${a} sur ${b} maps`, resolving_n: (a, b) => `Récupération de la collection… ${a}/${b}`, resolving: 'Récupération de la collection…',
    r_downloaded: 'Téléchargées', r_skipped: 'Ignorées', r_failed: 'Échecs', r_remaining: 'Restantes', r_size: 'Taille', r_elapsed: 'Durée',
    eta: 'restant', active: 'En cours', recent: 'Terminées récemment', failures: 'Maps en échec',
    cancel: 'Arrêter', remove: 'Retirer', open_folder: 'Ouvrir le dossier',
    m_pending: 'En attente', m_downloading: 'Téléchargement', m_verifying: 'Vérification', m_success: 'OK', m_skipped: 'Ignorée', m_failed: 'Échec', m_aborted: 'Annulée',
    set_title: 'Paramètres', set_sub: 'Enregistrés dans le fichier de config d’osu!collect, partagé avec l’application terminal.',
    g_appearance: 'Apparence', g_appearance_d: 'Ne concerne que ce navigateur.',
    theme: 'Thème', theme_d: 'Clair, sombre, le skin inspiré d\u2019osu!lazer, ou selon le système.', t_dark: 'Sombre', t_light: 'Clair', t_system: 'Système', t_lazer: 'Lazer',
    sound: 'Sons de l\u2019interface', sound_d: 'Petits sons au clic, aux bascules et à la fin d\u2019un téléchargement.',
    volume: 'Volume', volume_d: 'Volume des sons de l\u2019interface.',
    accent: 'Couleur d’accent', accent_d: 'Utilisée pour les boutons, la progression et les surlignages.',
    density: 'Densité', density_d: 'Espacement entre les éléments.', d_comfortable: 'Confortable', d_compact: 'Compacte',
    language: 'Langue', language_d: 'Langue de l’interface.',
    jump: 'Ouvrir Téléchargements au lancement', jump_d: 'Basculer sur la page Téléchargements quand un téléchargement démarre.',
    g_downloads: 'Téléchargements', g_downloads_d: 'Valeurs par défaut pour chaque nouveau téléchargement.',
    def_dir: 'Dossier par défaut', def_dir_d: 'Où les collections sont enregistrées si vous n’en choisissez pas.',
    threads: 'Téléchargements parallèles', threads_d: 'Nombre de maps téléchargées en même temps. Vide = automatique.', auto: 'auto',
    video: 'Inclure les vidéos', video_d: 'Télécharger les vidéos de fond quand le miroir les propose.',
    skip_imported: 'Ignorer les maps déjà installées', skip_imported_d: 'Les maps déjà dans votre bibliothèque osu! sont ignorées mais ajoutées au collection.db.',
    g_mirrors: 'Miroirs', g_mirrors_d: 'Essayés de haut en bas. Glissez pour réordonner.',
    custom_mirrors: 'Miroirs personnalisés', custom_mirrors_d: 'Modèles d’URL contenant {id}, essayés après les miroirs intégrés.',
    add_mirror: 'Ajouter un miroir', move_up: 'Monter', move_down: 'Descendre',
    g_osu: 'Installation osu!', g_osu_d: 'Sert à détecter les maps que vous avez déjà.',
    client: 'Client', client_d: 'La version d’osu! que vous utilisez.',
    osu_path: 'Dossier d’installation', osu_path_d: 'Laisser vide pour la détection automatique.', detected: 'Détecté :', not_detected: 'Non détecté',
    g_advanced: 'Avancé',
    auto_defer: 'Remettre en file les maps limitées', auto_defer_d: 'Au lieu d’attendre un miroir saturé, réessayer la map plus tard.',
    defer_secs: 'Attente avant remise en file', defer_secs_d: 'Secondes d’attente sur une limite avant de remettre en file.',
    validation: 'Validation des archives', validation_d: 'Niveau de vérification des fichiers .osz téléchargés.',
    v_off: 'Désactivée', v_magic: 'Standard', v_eocd: 'Stricte',
    unsaved: 'Modifications non enregistrées', discard: 'Annuler', save: 'Enregistrer', saved: 'Paramètres enregistrés',
    pick_folder: 'Choisir un dossier', up: 'Parent', select_folder: 'Utiliser ce dossier', cancel_btn: 'Annuler', empty_dir: 'Aucun sous-dossier',
    err_generic: 'Une erreur est survenue', started: 'Téléchargement lancé', started_d: (n) => `${n} est en cours de téléchargement.`,
    finished: 'Téléchargement terminé', finished_d: (n, a, b) => `${n} : ${a} téléchargées, ${b} en échec.`,
    loading: 'Chargement…', meta_unavailable: 'Titres indisponibles — affichage des identifiants.',
  },
};

function t(key, ...args) {
  const v = (STR[prefs.lang] || STR.en)[key] ?? STR.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}
function fmtNum(n) { return new Intl.NumberFormat(prefs.lang).format(n ?? 0); }
function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
}
const coverCard = (id) => `https://assets.ppy.sh/beatmaps/${id}/covers/card.jpg`;
const coverList = (id) => `https://assets.ppy.sh/beatmaps/${id}/covers/list@2x.jpg`;
/* Layer a gradient under the remote cover: if the image fails, the gradient shows. */
const bg = (url) => `background-image:url('${url}'),linear-gradient(135deg,color-mix(in srgb,var(--accent) 30%,#24242c),#18181e)`;

/* MingCute icon set (icons.js): outline by default, filled variant on demand. */
const icon = (name, cls = '', filled = false) => {
  const set = MINGCUTE[name] || MINGCUTE.info;
  return `<svg class="mc ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${filled && set.fill ? set.fill : set.line}</svg>`;
};

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { 'x-osu-collect-token': TOKEN, ...(opts.body ? { 'content-type': 'application/json' } : {}), ...opts.headers },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
  return data;
}

function toast(title, body = '', kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'ok' ? 'check' : kind === 'bad' ? 'alert' : 'info')}<div><b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ''}</div>`;
  el.insertAdjacentHTML('beforeend', '<i class="toast-timer"></i>');
  $('#toasts').append(el);
  Sound.play(kind === 'ok' ? 'success' : kind === 'bad' ? 'error' : 'notify');
  setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 320); }, 4500);
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const S = {
  info: null,
  settings: null,
  runs: new Map(),
  collection: null,       // current preview
  collectionInput: '',
  shown: 48,
  meta: new Map(),        // set id -> { title, artist, creator, diffs: [] }
  metaCursor: undefined,  // undefined = not fetched, null = exhausted
  metaFailed: false,
  metaLoading: false,
  collections: new Map(), // collection id -> preview (for thumbnails on run cards)
  openDetails: new Set(),
  dest: '',
};

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

const ROUTES = {
  download: { title: () => t('dl_title'), sub: () => t('dl_sub'), render: renderDownload },
  downloads: { title: () => t('runs_title'), sub: () => t('runs_sub'), render: renderRuns },
  settings: { title: () => t('set_title'), sub: () => t('set_sub'), render: renderSettings },
};

function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES[r] ? r : 'download';
}

function render() {
  const r = currentRoute();
  const route = ROUTES[r];
  $('#page-title').textContent = route.title();
  $('#page-sub').textContent = route.sub();
  $('#topbar-actions').innerHTML = '';
  renderNav(r);
  const view = $('#view');
  view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter');
  S.animateNext = true;
  route.render(view);
  S.animateNext = false;
  document.title = `${route.title()} · osu!collect`;
}

function renderNav(active = currentRoute()) {
  const running = [...S.runs.values()].filter(isRunning).length;
  $('#nav').innerHTML = [
    ['download', 'download', t('nav_download')],
    ['downloads', 'list', t('nav_downloads'), running],
    ['settings', 'settings', t('nav_settings')],
  ].map(([r, ic, label, count]) => `
    <a href="#/${r}" class="${r === active ? 'active' : ''}">${icon(ic, '', r === active)}<span class="lbl">${esc(label)}</span>${count ? `<span class="count">${count}</span>` : ''}</a>
  `).join('');
}

window.addEventListener('hashchange', render);

/* ------------------------------------------------------------------ */
/* Download page                                                       */
/* ------------------------------------------------------------------ */

function renderDownload(view) {
  const c = S.collection;
  const recent = S.settings?.recent_collection;
  view.innerHTML = `
    <div class="card search-card">
      <form class="search-row" id="load-form">
        <div class="field-with-icon">
          ${icon('link')}
          <input class="input lg" id="col-input" autocomplete="off" spellcheck="false" placeholder="${esc(t('dl_placeholder'))}" value="${esc(S.collectionInput)}">
        </div>
        <button class="btn primary lg" id="load-btn" type="submit">${esc(t('dl_load'))}</button>
      </form>
      ${recent && !c ? `<p class="search-hint">${esc(t('dl_recent'))} <button type="button" id="use-recent">${esc(recent)}</button></p>` : ''}
    </div>
    <div id="preview">${c ? '' : stepsHtml()}</div>
  `;
  $('#load-form').addEventListener('submit', (e) => { e.preventDefault(); loadCollection($('#col-input').value); });
  $('#col-input').addEventListener('input', (e) => { S.collectionInput = e.target.value; });
  $('#col-input').addEventListener('paste', () => setTimeout(() => loadCollection($('#col-input').value), 0));
  $('#use-recent')?.addEventListener('click', () => { $('#col-input').value = recent; loadCollection(recent); });
  if (c) renderPreview();
}

function stepsHtml() {
  return `<div class="steps">
    ${[1, 2, 3].map((n) => `<div class="card step"><div class="num">${n}</div><h3>${esc(t(`step${n}_t`))}</h3><p>${esc(t(`step${n}_d`))}</p></div>`).join('')}
  </div>`;
}

function previewSkeleton() {
  return `<div class="card collection-hero">
    <div class="hero-banner skel" style="border-radius:0"></div>
    <div class="hero-body"><div class="hero-cover skel"></div><div class="hero-info"><div class="skel" style="height:14px;width:90px;margin-bottom:10px"></div><div class="skel" style="height:26px;width:60%"></div></div></div>
    <div class="hero-stats">${'<div class="skel" style="height:36px;width:90px"></div>'.repeat(4)}</div>
  </div>`;
}

async function loadCollection(input) {
  input = (input || '').trim();
  if (!input) return;
  S.collectionInput = input;
  const btn = $('#load-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('loading'); }
  $('#preview').innerHTML = previewSkeleton();
  try {
    const c = await api(`/collections/${encodeURIComponent(input)}`);
    if (S.collection?.id !== c.id) {
      S.meta = new Map(); S.metaCursor = undefined; S.metaFailed = false; S.shown = 48;
    }
    S.collection = c;
    S.collections.set(c.id, c);
    if (!S.dest) S.dest = S.settings?.directory || S.settings?.default_directory || '';
    renderPreview();
    fetchMeta();
  } catch (e) {
    S.collection = null;
    $('#preview').innerHTML = stepsHtml();
    toast(t('err_generic'), e.message, 'bad');
  } finally {
    const b = $('#load-btn');
    if (b) { b.disabled = false; b.textContent = t('dl_load'); }
  }
}

function renderPreview() {
  const c = S.collection; const el = $('#preview');
  if (!c || !el) return;
  const ids = c.beatmapset_ids;
  const mosaic = ids.slice(0, 12).map((id) => `<div style="${bg(coverCard(id))}"></div>`).join('');
  const busy = [...S.runs.values()].some((r) => isRunning(r) && r.collection_id === c.id);
  el.innerHTML = `
    <div class="card collection-hero ${S.heroAnimated === c.id ? '' : 'hero-enter'}">
      <div class="hero-banner"><div class="hero-mosaic">${mosaic}</div></div>
      <div class="hero-body">
        <div class="hero-cover" style="${bg(coverList(ids[0]))}"></div>
        <div class="hero-info">
          <div class="eyebrow">${esc(t('collection'))} #${c.id}</div>
          <h2>${esc(c.name)}</h2>
          <span class="uploader"><img src="https://a.ppy.sh/${c.uploader_id}" alt="" onerror="this.style.visibility='hidden'">${esc(t('by'))} <b>${esc(c.uploader)}</b></span>
        </div>
        <div style="display:flex;gap:8px">
          <a class="btn" href="https://osucollector.com/collections/${c.id}" target="_blank" rel="noopener">${icon('external')}${esc(t('open_collector'))}</a>
        </div>
      </div>
      ${c.description ? `<p class="hero-desc">${esc(c.description)}</p>` : ''}
      <div class="hero-stats">
        <div class="stat"><b data-count="${ids.length}">${fmtNum(ids.length)}</b><span>${esc(t('st_sets'))}</span></div>
        <div class="stat"><b data-count="${c.beatmap_count}">${fmtNum(c.beatmap_count)}</b><span>${esc(t('st_diffs'))}</span></div>
        <div class="stat"><b data-count="${c.favourites}">${fmtNum(c.favourites)}</b><span>${esc(t('st_favs'))}</span></div>
        <div class="stat"><b class="mono">${c.id}</b><span>${esc(t('st_id'))}</span></div>
      </div>
      <form class="dest" id="dest-form">
        <label for="dest-input">${esc(t('dest'))}</label>
        <input class="input" id="dest-input" spellcheck="false" value="${esc(S.dest)}">
        <button class="btn" type="button" id="browse-btn">${icon('folder')}${esc(t('browse'))}</button>
        <button class="btn primary" type="submit" id="start-btn" ${busy ? 'disabled' : ''}>${icon('download')}${esc(t('download'))}</button>
      </form>
    </div>
    <div class="section-title"><h2>${esc(t('beatmaps'))} <span class="faint">· ${fmtNum(ids.length)}</span></h2>
      ${S.metaFailed ? `<span class="faint" style="font-size:13px">${esc(t('meta_unavailable'))}</span>` : ''}</div>
    <div class="maps-grid stagger" id="maps-grid">${mapsGridHtml()}</div>
    ${S.shown < ids.length ? `<div class="more-row"><button class="btn" id="more-btn">${esc(t('show_more'))}</button></div>` : ''}
  `;
  if (S.heroAnimated !== c.id) { S.heroAnimated = c.id; $$('[data-count]', el).forEach(countUp); }
  $('#dest-input').addEventListener('input', (e) => { S.dest = e.target.value; });
  $('#browse-btn').addEventListener('click', () => pickFolder(S.dest, (p) => { S.dest = p; $('#dest-input').value = p; }));
  $('#dest-form').addEventListener('submit', (e) => { e.preventDefault(); startDownload(); });
  $('#more-btn')?.addEventListener('click', () => { S.shown += 48; renderPreview(); fetchMeta(); });
}

function mapsGridHtml() {
  const ids = S.collection.beatmapset_ids.slice(0, S.shown);
  return ids.map((id, i) => {
    const m = S.meta.get(id);
    const title = m?.title || `${t('unknown_set')} #${id}`;
    const stars = m?.diffs?.length ? Math.max(...m.diffs.map((d) => d.stars)) : null;
    return `<div class="map-card" style="--i:${Math.min(i, 24)}">
      <div class="cover" style="${bg(coverCard(id))}"></div>
      <div class="body">
        <div class="title" title="${esc(title)}">${esc(title)}</div>
        <div class="artist">${m ? esc(m.artist) + (m.creator ? ` · <span style="opacity:.75">${esc(m.creator)}</span>` : '') : `<span class="mono">${id}</span>`}</div>
        <div class="meta">${m?.diffs?.length ? `<span class="chip">${esc(t('diffs', m.diffs.length))}</span>` : ''}${stars ? `<span class="chip">★ ${stars.toFixed(2)}</span>` : ''}${m?.status ? `<span class="chip">${esc(m.status)}</span>` : ''}</div>
      </div>
      <a class="ext" href="https://osu.ppy.sh/beatmapsets/${id}" target="_blank" rel="noopener" title="${esc(t('open_osu'))}">${icon('external')}</a>
    </div>`;
  }).join('');
}

/* Pull beatmap titles page by page until the visible cards are covered. */
async function fetchMeta() {
  const c = S.collection;
  if (!c || S.metaLoading || S.metaCursor === null || S.metaFailed) return;
  S.metaLoading = true;
  try {
    let pages = 0;
    const needed = () => c.beatmapset_ids.slice(0, S.shown).some((id) => !S.meta.has(id));
    while (S.collection?.id === c.id && S.metaCursor !== null && needed() && pages < 8) {
      const q = S.metaCursor ? `?cursor=${encodeURIComponent(S.metaCursor)}` : '';
      const page = await api(`/collections/${c.id}/maps${q}`);
      for (const m of page.maps) {
        const cur = S.meta.get(m.set_id) || { title: m.title, artist: m.artist, creator: m.creator, status: m.status, diffs: [] };
        cur.diffs.push({ version: m.version, stars: m.stars, mode: m.mode });
        S.meta.set(m.set_id, cur);
      }
      S.metaCursor = page.next_cursor ?? null;
      pages++;
      if (page.maps.length === 0) break;
    }
  } catch (_) {
    S.metaFailed = true;
  } finally {
    S.metaLoading = false;
    if (S.collection?.id === c.id && currentRoute() === 'download') {
      const grid = $('#maps-grid');
      if (grid) grid.innerHTML = mapsGridHtml();
      if (S.metaFailed) renderPreview();
    }
    if (currentRoute() === 'downloads') renderRuns($('#view'));
  }
}

async function startDownload() {
  const c = S.collection; if (!c) return;
  const btn = $('#start-btn');
  btn.disabled = true; btn.innerHTML = esc(t('downloading'));
  try {
    const run = await api('/downloads', { method: 'POST', body: JSON.stringify({ collection: String(c.id), directory: S.dest }) });
    S.runs.set(run.id, run);
    toast(t('started'), t('started_d', c.name), 'ok');
    if (prefs.jump) location.hash = '#/downloads'; else renderPreview();
    renderNav();
  } catch (e) {
    toast(t('err_generic'), e.message, 'bad');
    btn.disabled = false; btn.innerHTML = `${icon('download')}${esc(t('download'))}`;
  }
}

/* ------------------------------------------------------------------ */
/* Downloads page                                                      */
/* ------------------------------------------------------------------ */

const isRunning = (r) => !['completed', 'failed', 'cancelled'].includes(r.stage);

function stagePill(stage) {
  const cls = { completed: 'ok', failed: 'bad', cancelled: 'warn' }[stage] || 'run';
  return `<span class="pill ${cls}"><span class="dot"></span>${esc(t(`s_${stage}`))}</span>`;
}

function mapStateClass(stage) {
  return { success: 'ok', failed: 'bad', aborted: 'warn', skipped: 'skip', pending: 'skip' }[stage] || 'run';
}

function mapRow(m) {
  const meta = S.meta.get(m.id);
  const name = meta ? `${meta.artist} — ${meta.title}` : `${t('unknown_set')} #${m.id}`;
  const pct = m.total ? Math.min(100, (m.downloaded / m.total) * 100) : 0;
  const live = m.stage === 'downloading' || m.stage === 'verifying';
  return `<div class="map-row">
    <div class="thumb" style="${bg(coverList(m.id))}"></div>
    <div class="name"><div title="${esc(name)}">${esc(name)}</div>
      ${live ? `<div class="progress"><div style="width:${pct}%"></div></div>` : `<small>${esc(m.message || '')}</small>`}</div>
    <span class="state ${mapStateClass(m.stage)}">${live && m.total ? `${Math.round(pct)}%` : esc(t(`m_${m.stage}`))}</span>
  </div>`;
}

function runCard(r) {
  const done = r.downloaded + r.skipped + r.failed;
  const pct = r.total ? Math.min(100, (done / r.total) * 100) : 0;
  const running = isRunning(r);
  const resolving = r.stage === 'pending' || r.stage === 'resolving' || r.stage === 'rechecking';
  const elapsed = (r.finished_at || Date.now()) - r.started_at;
  const remainingBytes = Math.max(0, r.bytes_total - r.bytes_done);
  const eta = running && r.speed > 1024 && r.bytes_total ? fmtDur((remainingBytes / r.speed) * 1000) : null;
  const col = r.collection_id ? S.collections.get(r.collection_id) : null;
  const thumbId = col?.beatmapset_ids?.[0] ?? r.recent[0]?.id ?? r.active[0]?.id;
  const barCls = r.stage === 'completed' ? 'ok' : r.stage === 'failed' ? 'bad' : '';
  const line = resolving
    ? (r.resolve ? t('resolving_n', r.resolve[0], r.resolve[1]) : t('resolving'))
    : t('maps_of', fmtNum(done), fmtNum(r.total));
  const right = [
    r.bytes_total ? `${fmtBytes(r.bytes_done)} / ${fmtBytes(r.bytes_total)}` : (r.bytes_done ? fmtBytes(r.bytes_done) : ''),
    running && r.speed > 0 ? `${fmtBytes(r.speed)}/s` : '',
    eta ? `${eta} ${t('eta')}` : '',
  ].filter(Boolean).join(' · ');
  const detailsOpen = S.openDetails.has(r.id);
  const hasDetail = r.active.length || r.recent.length;

  return `<article class="card run" data-run="${r.id}">
    <div class="run-head">
      <div class="run-thumb" style="${thumbId ? bg(coverList(thumbId)) : bg('')}"></div>
      <div class="run-title">
        <h3 title="${esc(r.name)}">${esc(r.name)}</h3>
        <p>${r.uploader ? `${esc(t('by'))} ${esc(r.uploader)} · ` : ''}<span class="mono">${esc(r.output_dir)}</span></p>
      </div>
      ${stagePill(r.stage)}
      <div class="run-actions">
        <button class="btn sm icon ghost" data-act="open" title="${esc(t('open_folder'))}">${icon('folderOpen')}</button>
        ${running
          ? `<button class="btn sm danger" data-act="cancel">${icon('stop')}${esc(t('cancel'))}</button>`
          : `<button class="btn sm icon ghost" data-act="dismiss" title="${esc(t('remove'))}">${icon('x')}</button>`}
      </div>
    </div>
    <div class="run-progress">
      <div class="line"><span>${esc(line)}</span><span>${esc(right)}</span></div>
      <div class="progress ${barCls} ${resolving && running ? 'indeterminate' : ''}"><div style="width:${resolving ? (r.resolve ? (r.resolve[0] / Math.max(1, r.resolve[1])) * 100 : 0) : pct}%"></div></div>
    </div>
    ${r.error ? `<div class="run-notice bad">${icon('alert')}<span>${esc(r.error)}</span></div>` : ''}
    ${r.notice ? `<div class="run-notice">${icon('info')}<span>${esc(r.notice)}</span></div>` : ''}
    <div class="run-stats">
      <div class="stat"><b>${fmtNum(r.downloaded)}</b><span>${esc(t('r_downloaded'))}</span></div>
      <div class="stat"><b>${fmtNum(r.skipped)}</b><span>${esc(t('r_skipped'))}</span></div>
      <div class="stat"><b style="${r.failed ? 'color:var(--bad)' : ''}">${fmtNum(r.failed)}</b><span>${esc(t('r_failed'))}</span></div>
      <div class="stat"><b>${fmtNum(Math.max(0, r.total - done))}</b><span>${esc(t('r_remaining'))}</span></div>
      <div class="stat"><b>${r.bytes_total ? fmtBytes(r.bytes_total) : '—'}</b><span>${esc(t('r_size'))}</span></div>
      <div class="stat"><b>${fmtDur(elapsed)}</b><span>${esc(t('r_elapsed'))}</span></div>
    </div>
    ${hasDetail ? `<details class="run-detail" ${detailsOpen ? 'open' : ''} data-detail="${r.id}">
      <summary>${icon('chevron')}${r.active.length ? `${esc(t('active'))} · ${r.active.length}` : ''}${r.active.length && r.recent.length ? '&nbsp;&nbsp;/&nbsp;&nbsp;' : ''}${r.recent.length ? esc(t('recent')) : ''}</summary>
      <div class="map-rows">${[...r.active, ...r.recent].slice(0, 40).map(mapRow).join('')}</div>
    </details>` : ''}
    ${r.failures.length ? `<details class="run-detail"><summary>${icon('chevron')}${esc(t('failures'))} · ${r.failures.length}</summary>
      <div class="map-rows">${r.failures.map((f) => `<div class="map-row"><div class="thumb" style="${bg(coverList(f.id))}"></div><div class="name"><div>${esc(f.title || `${t('unknown_set')} #${f.id}`)}</div><small>${esc(f.reason)}</small></div><a class="btn sm icon ghost" href="https://osu.ppy.sh/beatmapsets/${f.id}" target="_blank" rel="noopener">${icon('external')}</a></div>`).join('')}</div>
    </details>` : ''}
  </article>`;
}

/* Fetch titles for runs whose collection wasn't previewed in this tab. */
const metaRequested = new Set();
async function ensureRunMeta(colId) {
  if (!colId || metaRequested.has(colId) || S.collection?.id === colId) return;
  metaRequested.add(colId);
  try {
    let cursor = ''; let pages = 0;
    do {
      const page = await api(`/collections/${colId}/maps${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const m of page.maps) {
        const cur = S.meta.get(m.set_id) || { title: m.title, artist: m.artist, creator: m.creator, status: m.status, diffs: [] };
        cur.diffs.push({ version: m.version, stars: m.stars, mode: m.mode });
        S.meta.set(m.set_id, cur);
      }
      cursor = page.next_cursor; pages++;
    } while (cursor && pages < 20);
    scheduleRunsRender();
  } catch (_) {}
}

function renderRuns(view) {
  if (!view) return;
  const runs = [...S.runs.values()].sort((a, b) => b.id - a.id);
  runs.forEach((r) => ensureRunMeta(r.collection_id));
  const actions = $('#topbar-actions');
  const anyDone = runs.some((r) => !isRunning(r));
  actions.innerHTML = anyDone ? `<button class="btn" id="clear-done">${icon('trash')}${esc(t('clear_done'))}</button>` : '';
  $('#clear-done')?.addEventListener('click', async () => {
    for (const r of runs.filter((x) => !isRunning(x))) {
      try { await api(`/downloads/${r.id}/dismiss`, { method: 'POST' }); S.runs.delete(r.id); } catch (_) {}
    }
    renderRuns($('#view')); renderNav();
  });

  if (!runs.length) {
    view.innerHTML = `<div class="card empty">
      <div class="glyph">${icon('download')}</div>
      <h3>${esc(t('runs_empty_t'))}</h3><p>${esc(t('runs_empty_d'))}</p>
      <a class="btn primary" href="#/download">${esc(t('runs_empty_btn'))}</a>
    </div>`;
    return;
  }

  // Preserve scroll position across live re-renders.
  const y = window.scrollY;
  view.innerHTML = `<div class="runs ${S.animateNext ? 'stagger' : ''}">${runs.map(runCard).join('')}</div>`;
  window.scrollTo(0, y);

  $$('details[data-detail]', view).forEach((d) => d.addEventListener('toggle', () => {
    const id = Number(d.dataset.detail);
    d.open ? S.openDetails.add(id) : S.openDetails.delete(id);
  }));
  $$('[data-act]', view).forEach((b) => b.addEventListener('click', async () => {
    const card = b.closest('[data-run]'); const id = Number(card.dataset.run); const r = S.runs.get(id);
    try {
      if (b.dataset.act === 'cancel') { S.runs.set(id, await api(`/downloads/${id}/cancel`, { method: 'POST' })); }
      if (b.dataset.act === 'dismiss') { await api(`/downloads/${id}/dismiss`, { method: 'POST' }); S.runs.delete(id); }
      if (b.dataset.act === 'open') { await api('/open', { method: 'POST', body: JSON.stringify({ path: r.output_dir }) }); }
      renderRuns($('#view')); renderNav();
    } catch (e) { toast(t('err_generic'), e.message, 'bad'); }
  }));
}

/* Coalesce frequent SSE updates into one render per animation frame. */
let runsRenderQueued = false;
function scheduleRunsRender() {
  if (runsRenderQueued) return;
  runsRenderQueued = true;
  requestAnimationFrame(() => {
    runsRenderQueued = false;
    renderNav();
    if (currentRoute() === 'downloads') renderRuns($('#view'));
  });
}

/* ------------------------------------------------------------------ */
/* Settings page                                                       */
/* ------------------------------------------------------------------ */

let draft = null;
const dirty = () => draft && S.settings && JSON.stringify(draft) !== JSON.stringify(S.settings);

function row(label, desc, control, extra = '') {
  return `<div class="row ${extra}"><div class="label"><b>${esc(label)}</b>${desc ? `<span>${esc(desc)}</span>` : ''}</div><div class="control">${control}</div></div>`;
}
const toggle = (key, on) => `<label class="switch"><input type="checkbox" data-k="${key}" ${on ? 'checked' : ''}><span></span></label>`;
const seg = (name, value, opts) => `<div class="segmented" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === value ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;

const ACCENTS = { pink: '#ff66aa', blue: '#4f9dff', violet: '#9b7bff', green: '#35c48a', orange: '#ff9a3d', red: '#ff5c6c' };

function renderSettings(view) {
  if (!S.settings) { view.innerHTML = `<div class="card card-pad">${esc(t('loading'))}</div>`; return; }
  if (!draft) draft = structuredClone(S.settings);
  const d = draft;
  const groups = [['appearance', t('g_appearance')], ['downloads', t('g_downloads')], ['mirrors', t('g_mirrors')], ['osu', t('g_osu')], ['advanced', t('g_advanced')]];
  view.innerHTML = `<div class="settings ${S.animateNext ? 'stagger' : ''}">
    <nav class="settings-nav">${groups.map(([id, l]) => `<a href="#/settings" data-jump="${id}">${esc(l)}</a>`).join('')}</nav>
    <div>
      <section class="settings-group" id="g-appearance">
        <h2>${esc(t('g_appearance'))}</h2><p>${esc(t('g_appearance_d'))}</p>
        <div class="card rows">
          ${row(t('theme'), t('theme_d'), seg('theme', prefs.theme, [['dark', t('t_dark')], ['light', t('t_light')], ['lazer', t('t_lazer')], ['system', t('t_system')]]))}
          ${row(t('accent'), t('accent_d'), `<div class="swatches">${Object.entries(ACCENTS).map(([k, c]) => `<button type="button" class="swatch ${prefs.accent === k ? 'on' : ''}" data-accent="${k}" style="--c:${c}" title="${k}"></button>`).join('')}</div>`)}
          ${row(t('density'), t('density_d'), seg('density', prefs.density, [['comfortable', t('d_comfortable')], ['compact', t('d_compact')]]))}
          ${row(t('language'), t('language_d'), seg('lang', prefs.lang, [['en', 'English'], ['fr', 'Français']]))}
          ${row(t('sound'), t('sound_d'), `<label class="switch"><input type="checkbox" id="pref-sound" ${prefs.sound ? 'checked' : ''}><span></span></label>`)}
          ${row(t('volume'), t('volume_d'), `${icon(prefs.volume > 0 ? 'volume' : 'volumeOff', 'vol-ico')}<input type="range" class="range" id="pref-volume" min="0" max="1" step="0.05" value="${prefs.volume}" ${prefs.sound ? '' : 'disabled'}>`)}
          ${row(t('jump'), t('jump_d'), `<label class="switch"><input type="checkbox" id="pref-jump" ${prefs.jump ? 'checked' : ''}><span></span></label>`)}
        </div>
      </section>

      <section class="settings-group" id="g-downloads">
        <h2>${esc(t('g_downloads'))}</h2><p>${esc(t('g_downloads_d'))}</p>
        <div class="card rows">
          ${row(t('def_dir'), t('def_dir_d'), `<input class="input mono" data-k="directory" placeholder="${esc(d.default_directory)}" value="${esc(d.directory || '')}"><button class="btn icon" type="button" id="pick-def">${icon('folder')}</button>`)}
          ${row(t('threads'), t('threads_d'), `<input class="input num" type="number" min="1" max="100" data-k="threads" placeholder="${esc(t('auto'))} (${d.default_threads})" value="${d.threads ?? ''}">`)}
          ${row(t('video'), t('video_d'), toggle('video', d.video))}
          ${row(t('skip_imported'), t('skip_imported_d'), toggle('skip_already_imported', d.skip_already_imported))}
        </div>
      </section>

      <section class="settings-group" id="g-mirrors">
        <h2>${esc(t('g_mirrors'))}</h2><p>${esc(t('g_mirrors_d'))}</p>
        <div class="card rows" style="padding:0">
          <ul class="mirror-list" id="mirror-list">${d.mirrors.map((m, i) => `
            <li class="mirror" draggable="true" data-i="${i}">
              <span class="handle">${icon('grip')}</span>
              <span class="rank">${i + 1}</span>
              <div class="who"><b>${esc(m.label)}</b><small>${esc(m.key)}</small></div>
              <div class="order-btns">
                <button class="btn sm icon ghost" data-move="-1" title="${esc(t('move_up'))}" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
                <button class="btn sm icon ghost" data-move="1" title="${esc(t('move_down'))}" ${i === d.mirrors.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
              </div>
              <label class="switch"><input type="checkbox" data-mirror="${i}" ${m.enabled ? 'checked' : ''}><span></span></label>
            </li>`).join('')}
          </ul>
        </div>
        <div class="card rows" style="margin-top:12px">
          ${row(t('custom_mirrors'), t('custom_mirrors_d'), `<div class="custom-list" id="custom-list" style="width:100%">
              ${d.custom_mirrors.map((u, i) => `<div class="item"><input class="input" data-custom="${i}" value="${esc(u)}" placeholder="https://example.com/d/{id}"><button class="btn icon ghost" data-del-custom="${i}">${icon('trash')}</button></div>`).join('')}
              <div><button class="btn sm" id="add-custom" type="button">${icon('plus')}${esc(t('add_mirror'))}</button></div>
            </div>`, 'stack')}
        </div>
      </section>

      <section class="settings-group" id="g-osu">
        <h2>${esc(t('g_osu'))}</h2><p>${esc(t('g_osu_d'))}</p>
        <div class="card rows">
          ${row(t('client'), t('client_d'), seg('osu_client', d.osu_client, [['stable', 'osu! stable'], ['lazer', 'osu! lazer']]))}
          ${row(t('osu_path'), `${t('osu_path_d')} ${d.detected_osu_path ? `${t('detected')} ${d.detected_osu_path}` : t('not_detected')}`, `<input class="input mono" data-k="osu_path" placeholder="${esc(d.detected_osu_path)}" value="${esc(d.osu_path || '')}"><button class="btn icon" type="button" id="pick-osu">${icon('folder')}</button>`)}
        </div>
      </section>

      <section class="settings-group" id="g-advanced">
        <h2>${esc(t('g_advanced'))}</h2>
        <div class="card rows">
          ${row(t('auto_defer'), t('auto_defer_d'), toggle('auto_skip_rate_limited', d.auto_skip_rate_limited))}
          ${row(t('defer_secs'), t('defer_secs_d'), `<input class="input num" type="number" min="1" max="3600" data-k="rate_limit_skip_secs" value="${d.rate_limit_skip_secs}" ${d.auto_skip_rate_limited ? '' : 'disabled'}>`)}
          ${row(t('validation'), t('validation_d'), seg('archive_validation', d.archive_validation, [['off', t('v_off')], ['magic', t('v_magic')], ['eocd', t('v_eocd')]]))}
        </div>
      </section>
      <div style="height:64px"></div>
    </div>
  </div>
  <div class="savebar ${dirty() ? '' : 'off'}" id="savebar">
    <span>${esc(t('unsaved'))}</span>
    <button class="btn ghost" id="discard">${esc(t('discard'))}</button>
    <button class="btn primary" id="save">${esc(t('save'))}</button>
  </div>`;
  bindSettings(view);
}

function bindSettings(view) {
  const refresh = () => $('#savebar')?.classList.toggle('off', !dirty());
  const rerender = () => { const y = window.scrollY; renderSettings(view); window.scrollTo(0, y); };

  $$('[data-jump]', view).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); $(`#g-${a.dataset.jump}`).scrollIntoView({ behavior: 'smooth' }); }));

  // Local preferences apply immediately.
  $$('[data-seg]', view).forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const name = g.dataset.seg; const v = b.dataset.v;
    if (['theme', 'density', 'lang'].includes(name)) {
      prefs[name] = v; savePrefs();
      if (name === 'lang') { render(); return; }
    } else { draft[name] = v; }
    if (name === 'osu_client') draft.detected_osu_path = ''; // re-detected on save
    rerender();
  }));
  $$('[data-accent]', view).forEach((b) => b.addEventListener('click', () => { prefs.accent = b.dataset.accent; savePrefs(); rerender(); }));
  $('#pref-jump').addEventListener('change', (e) => { prefs.jump = e.target.checked; savePrefs(); });
  $('#pref-sound').addEventListener('change', (e) => { prefs.sound = e.target.checked; savePrefs(); if (prefs.sound) Sound.play('success'); rerender(); });
  $('#pref-volume').addEventListener('input', (e) => { prefs.volume = Number(e.target.value); savePrefs(); });
  $('#pref-volume').addEventListener('change', () => Sound.play('tick', { force: true }));

  $$('[data-k]', view).forEach((inp) => inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') { draft[k] = inp.checked; if (k === 'auto_skip_rate_limited') return rerender(); }
    else if (k === 'threads') draft.threads = inp.value === '' ? null : Math.max(1, Math.min(100, Number(inp.value) || 1));
    else if (k === 'rate_limit_skip_secs') draft.rate_limit_skip_secs = Math.max(1, Number(inp.value) || 1);
    else draft[k] = inp.value.trim() === '' ? null : inp.value;
    refresh();
  }));

  $('#pick-def').addEventListener('click', () => pickFolder(draft.directory || draft.default_directory, (p) => { draft.directory = p; rerender(); }));
  $('#pick-osu').addEventListener('click', () => pickFolder(draft.osu_path || draft.detected_osu_path, (p) => { draft.osu_path = p; rerender(); }));

  // Mirrors: toggles, arrows, drag & drop.
  $$('[data-mirror]', view).forEach((inp) => inp.addEventListener('change', () => { draft.mirrors[Number(inp.dataset.mirror)].enabled = inp.checked; refresh(); }));
  const move = (from, to) => { if (to < 0 || to >= draft.mirrors.length) return; const [m] = draft.mirrors.splice(from, 1); draft.mirrors.splice(to, 0, m); rerender(); };
  $$('[data-move]', view).forEach((b) => b.addEventListener('click', () => { const i = Number(b.closest('[data-i]').dataset.i); move(i, i + Number(b.dataset.move)); }));
  let dragFrom = null;
  $$('.mirror', view).forEach((li) => {
    li.addEventListener('dragstart', (e) => { dragFrom = Number(li.dataset.i); li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drop-target'); });
    li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
    li.addEventListener('drop', (e) => { e.preventDefault(); li.classList.remove('drop-target'); if (dragFrom !== null) move(dragFrom, Number(li.dataset.i)); dragFrom = null; });
  });

  $$('[data-custom]', view).forEach((inp) => inp.addEventListener('input', () => { draft.custom_mirrors[Number(inp.dataset.custom)] = inp.value; refresh(); }));
  $$('[data-del-custom]', view).forEach((b) => b.addEventListener('click', () => { draft.custom_mirrors.splice(Number(b.dataset.delCustom), 1); rerender(); }));
  $('#add-custom').addEventListener('click', () => { draft.custom_mirrors.push(''); rerender(); $(`[data-custom="${draft.custom_mirrors.length - 1}"]`)?.focus(); });

  $('#discard').addEventListener('click', () => { draft = structuredClone(S.settings); rerender(); });
  $('#save').addEventListener('click', async () => {
    try {
      const body = { ...draft, custom_mirrors: draft.custom_mirrors.filter((u) => u.trim()) };
      S.settings = await api('/settings', { method: 'PUT', body: JSON.stringify(body) });
      draft = structuredClone(S.settings);
      if (!S.collection) S.dest = '';
      toast(t('saved'), '', 'ok');
      rerender();
    } catch (e) { toast(t('err_generic'), e.message, 'bad'); }
  });
}

/* ------------------------------------------------------------------ */
/* Folder picker                                                       */
/* ------------------------------------------------------------------ */

function pickFolder(start, onPick) {
  const root = $('#modal-root');
  let current = null;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  async function go(path) {
    try {
      const q = path ? `?path=${encodeURIComponent(path)}` : '';
      current = await api(`/fs${q}`);
      draw();
    } catch (e) {
      if (path) go(''); else toast(t('err_generic'), e.message, 'bad');
    }
  }
  function draw() {
    const l = current;
    const first = !root.firstChild;
    if (first) Sound.play('open');
    root.innerHTML = `<div class="modal-backdrop ${first ? '' : 'no-anim'}" id="mb"><div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(t('pick_folder'))}</h3><button class="btn sm icon ghost" id="mclose">${icon('x')}</button></div>
      <div class="modal-body">
        <div class="crumb"><button class="btn sm" id="mup" ${l.parent ? '' : 'disabled'}>${icon('arrowUp')}${esc(t('up'))}</button><div class="path" title="${esc(l.path)}"><span style="unicode-bidi:plaintext">${esc(l.display)}</span></div></div>
        <div class="shortcuts">${l.shortcuts.map((s, i) => `<button class="btn sm" data-sc="${i}">${icon(i === 0 ? 'home' : 'folder')}${esc(s.name)}</button>`).join('')}</div>
        <div class="dir-list">${l.dirs.length ? l.dirs.map((dd, i) => `<button data-dir="${i}">${icon('folder')}<span>${esc(dd.name)}</span></button>`).join('') : `<div class="faint" style="padding:14px">${esc(t('empty_dir'))}</div>`}</div>
      </div>
      <div class="modal-foot"><button class="btn ghost" id="mcancel">${esc(t('cancel_btn'))}</button><button class="btn primary" id="mok">${esc(t('select_folder'))}</button></div>
    </div></div>`;
    $('#mb').addEventListener('click', (e) => { if (e.target.id === 'mb') close(); });
    $('#mclose').addEventListener('click', close);
    $('#mcancel').addEventListener('click', close);
    $('#mup').addEventListener('click', () => go(l.parent));
    $$('[data-sc]', root).forEach((b) => b.addEventListener('click', () => go(l.shortcuts[Number(b.dataset.sc)].path)));
    $$('[data-dir]', root).forEach((b) => b.addEventListener('click', () => go(l.dirs[Number(b.dataset.dir)].path)));
    $('#mok').addEventListener('click', () => { onPick(l.path); close(); });
  }
  go(start || '');
}

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

function connect() {
  const es = new EventSource(`/api/events?t=${encodeURIComponent(TOKEN)}`);
  const conn = $('#conn');
  es.addEventListener('open', () => { conn.className = 'conn live'; $('#conn-label').textContent = t('live'); syncRuns(); });
  es.addEventListener('error', () => { conn.className = 'conn down'; $('#conn-label').textContent = t('offline'); });
  es.addEventListener('run', (e) => {
    const run = JSON.parse(e.data);
    const prev = S.runs.get(run.id);
    S.runs.set(run.id, run);
    if (prev && isRunning(prev) && run.stage === 'completed') toast(t('finished'), t('finished_d', run.name, run.downloaded, run.failed), run.failed ? 'info' : 'ok');
    if (prev && isRunning(prev) && run.stage === 'failed') toast(t('s_failed'), run.error || run.name, 'bad');
    scheduleRunsRender();
  });
  es.addEventListener('resync', syncRuns);
}

async function syncRuns() {
  try {
    const list = await api('/downloads');
    S.runs = new Map(list.map((r) => [r.id, r]));
    scheduleRunsRender();
  } catch (_) {}
}

/* ------------------------------------------------------------------ */
/* Motion helpers                                                      */
/* ------------------------------------------------------------------ */

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function countUp(el) {
  const target = Number(el.dataset.count) || 0;
  if (reducedMotion() || target < 2) return;
  const start = performance.now(); const dur = 700;
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtNum(Math.round(target * eased));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* An osu!-style hit burst: an expanding ring from the click point. */
function hitBurst(el, e) {
  if (reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const ring = document.createElement('span');
  ring.className = 'burst';
  const size = Math.max(r.width, r.height) * 1.4;
  ring.style.width = ring.style.height = `${size}px`;
  ring.style.left = `${(e.clientX || r.left + r.width / 2) - r.left - size / 2}px`;
  ring.style.top = `${(e.clientY || r.top + r.height / 2) - r.top - size / 2}px`;
  el.append(ring);
  ring.addEventListener('animationend', () => ring.remove());
}

/* Global feedback: every button press gets a sound and a burst. */
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.btn, .nav a, .segmented button, .swatch, .dir-list button, .search-hint button, .settings-nav a');
  if (!el || el.disabled) return;
  if (el.matches('.btn')) hitBurst(el, e);
  Sound.play(el.matches('.btn.primary') ? 'confirm' : el.matches('.nav a') ? 'nav' : 'tick');
});
document.addEventListener('change', (e) => {
  if (e.target.matches('.switch input')) Sound.play(e.target.checked ? 'on' : 'off');
});
document.addEventListener('pointerover', (e) => {
  const el = e.target.closest('.nav a, .map-card, .btn');
  if (!el || el.contains(e.relatedTarget)) return;
  Sound.play('hover');
});

/* ------------------------------------------------------------------ */
/* Sounds — synthesised with Web Audio, no audio files.                */
/* ------------------------------------------------------------------ */

const Sound = (() => {
  let ctx = null; let master = null; let lastHover = 0;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = prefs.volume * 0.6;
    return ctx;
  }
  // One enveloped oscillator note.
  function tone(freq, { at = 0, dur = 0.08, type = 'sine', gain = 0.25, slide = 0, attack = 0.004 } = {}) {
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  // Short filtered noise, used for the "whoosh".
  function noise({ dur = 0.18, gain = 0.12, from = 400, to = 2400 } = {}) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }
  const lazer = () => prefs.theme === 'lazer';
  const SOUNDS = {
    tick: () => tone(lazer() ? 1500 : 1180, { dur: 0.05, type: 'triangle', gain: 0.18, slide: 0.7 }),
    nav: () => { tone(880, { dur: 0.06, type: 'triangle', gain: 0.14 }); tone(1320, { at: 0.035, dur: 0.07, type: 'sine', gain: 0.1 }); },
    hover: () => tone(lazer() ? 2400 : 2000, { dur: 0.025, type: 'sine', gain: 0.035 }),
    confirm: () => { tone(660, { dur: 0.07, type: 'triangle', gain: 0.2 }); tone(990, { at: 0.05, dur: 0.12, type: 'sine', gain: 0.16 }); },
    on: () => { tone(740, { dur: 0.05, type: 'sine', gain: 0.16 }); tone(1110, { at: 0.04, dur: 0.07, type: 'sine', gain: 0.14 }); },
    off: () => { tone(1110, { dur: 0.05, type: 'sine', gain: 0.14 }); tone(740, { at: 0.04, dur: 0.07, type: 'sine', gain: 0.14 }); },
    success: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.22, type: 'sine', gain: 0.14 })),
    notify: () => { tone(988, { dur: 0.12, gain: 0.12 }); tone(1318.5, { at: 0.09, dur: 0.2, gain: 0.1 }); },
    error: () => { tone(330, { dur: 0.14, type: 'square', gain: 0.06, slide: 0.8 }); tone(247, { at: 0.12, dur: 0.2, type: 'square', gain: 0.06, slide: 0.8 }); },
    open: () => noise({ dur: 0.16, gain: 0.08 }),
  };
  return {
    play(name, { force = false } = {}) {
      if (!prefs.sound && !force) return;
      if (name === 'hover') { const now = performance.now(); if (now - lastHover < 60) return; lastHover = now; }
      try { if (ensure()) SOUNDS[name]?.(); } catch (_) {}
    },
  };
})();

/* ------------------------------------------------------------------ */
/* Lazer background — drifting triangles, drawn on a canvas.           */
/* ------------------------------------------------------------------ */

const Triangles = (() => {
  let raf = 0; let tris = []; let last = 0;
  const cv = () => document.getElementById('triangles');
  function seed(w, h) {
    const n = Math.round((w * h) / 26000);
    tris = Array.from({ length: n }, () => spawn(w, h, Math.random() * h));
  }
  function spawn(w, h, y = h + 60) {
    const size = 24 + Math.random() * 110;
    return { x: Math.random() * w, y, size, speed: 6 + (130 / size) * 4 * Math.random() + 4, shade: Math.random() };
  }
  function frame(now) {
    const c = cv(); if (!c) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const ctx = c.getContext('2d'); const dpr = window.devicePixelRatio || 1;
    const w = innerWidth; const h = innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff66aa';
    for (const tr of tris) {
      tr.y -= tr.speed * dt;
      if (tr.y + tr.size < -10) Object.assign(tr, spawn(w, h));
      const sz = tr.size;
      ctx.beginPath();
      ctx.moveTo(tr.x, tr.y - sz * 0.58); ctx.lineTo(tr.x + sz / 2, tr.y + sz * 0.29); ctx.lineTo(tr.x - sz / 2, tr.y + sz * 0.29); ctx.closePath();
      if (tr.shade > 0.7) { ctx.fillStyle = accent; ctx.globalAlpha = 0.05 + (tr.shade - 0.7) * 0.18; }
      else { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.018 + tr.shade * 0.035; }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  function resize() {
    const c = cv(); if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    seed(innerWidth, innerHeight);
  }
  window.addEventListener('resize', () => { if (raf) resize(); });
  return {
    sync() {
      const on = prefs.theme === 'lazer';
      if (on && !raf) {
        resize(); last = 0;
        if (reducedMotion()) { frame(performance.now()); cancelAnimationFrame(raf); raf = -1; } else raf = requestAnimationFrame(frame);
      } else if (!on && raf) {
        if (raf > 0) cancelAnimationFrame(raf); raf = 0;
        const c = cv(); c?.getContext('2d').clearRect(0, 0, c.width, c.height);
      }
    },
  };
})();

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

(async function boot() {
  applyPrefs();
  render();
  try {
    const [info, settings] = await Promise.all([api('/info'), api('/settings')]);
    S.info = info; S.settings = settings;
    $('#version').textContent = `v${info.version}`;
    render();
  } catch (e) {
    toast(t('err_generic'), e.message, 'bad');
  }
  connect();
  // Refresh elapsed timers on the downloads page even when no event arrives.
  setInterval(() => { if (currentRoute() === 'downloads' && [...S.runs.values()].some(isRunning)) scheduleRunsRender(); }, 1000);
})();
