// storage.js – Zentrales Storage-Modul (EnergiScout)
// Wird per importScripts() in background.js geladen.
// Stellt das globale EnergiStorage-Objekt bereit.
//
// Architektur:
//   chrome.storage.local  → heiss: aktuelle Daten, Popup-Performance, Puffer
//   File System (FSAPI)   → kalt:  persistente JSON-Dateien im Nutzer-Ordner

const EnergiStorage = (() => {
  'use strict';

  // ── IndexedDB: FileSystemDirectoryHandle persistent speichern ─────────────
  // Handles sind structured-cloneable und können in IDB gespeichert werden.

  const IDB_NAME    = 'energiescout';
  const IDB_VERSION = 1;
  const IDB_STORE   = 'fs';
  const HANDLE_KEY  = 'rootHandle';
  const PERSONAL_ROOT = 'personal_dashboard';
  const PERSONAL_DATA_ROOT = `${PERSONAL_ROOT}/data`;
  const PERSONAL_EXPORTS_ROOT = `${PERSONAL_ROOT}/exports`;
  const SETTINGS_ROOT = 'settings';
  const COMPANY_DASHBOARD_ROOT = 'company_dashboard';
  const LEGACY_DATA_ROOT = 'data';
  const LEGACY_DASHBOARD_ROOT = 'dashboard';
  const LEGACY_EXPORTS_ROOT = 'exports';

  function _personalDataPath(path) {
    return `${PERSONAL_DATA_ROOT}/${path}`;
  }

  function _legacyDataPath(path) {
    return `${LEGACY_DATA_ROOT}/${path}`;
  }

  function _sanitizeDashboardFolderName(value) {
    const base = String(value || 'dashboard').trim().toLowerCase();
    const slug = base
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return slug || `dashboard-${Date.now()}`;
  }

  async function _readPersonalDataJSON(path) {
    const preferred = await _readJSON(_personalDataPath(path));
    if (preferred) return preferred;
    return _readJSON(_legacyDataPath(path));
  }

  function _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function _idbGet(key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      req.onsuccess = e => resolve(e.target.result ?? null);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function _idbSet(key, value) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ── State ─────────────────────────────────────────────────────────────────
  // Service Worker kann jederzeit terminiert werden →
  // _root wird nie dauerhaft gecacht, immer frisch aus IDB geladen.

  let _root      = null;  // FileSystemDirectoryHandle
  let _connected = false;

  // ── Permission ────────────────────────────────────────────────────────────

  async function _hasPermission(handle) {
    try {
      return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
    } catch {
      return false;
    }
  }

  // ── Init: beim Service-Worker-Start aufrufen ──────────────────────────────

  async function init() {
    try {
      const handle = await _idbGet(HANDLE_KEY);
      if (!handle) return false;
      if (!await _hasPermission(handle)) return false;
      _root      = handle;
      _connected = true;
      return true;
    } catch {
      return false;
    }
  }

  // ── Connect: aus Popup/Onboarding mit User-Gesture aufrufen ──────────────
  // dirHandle = FileSystemDirectoryHandle aus showDirectoryPicker()

  async function connect(dirHandle) {
    try {
      await _idbSet(HANDLE_KEY, dirHandle);
      _root      = dirHandle;
      _connected = true;
      await _initFolderStructure();
      await _writeMetaFile();
      await flushBuffer();
      return true;
    } catch (e) {
      console.error('[EnergiStorage] connect() fehlgeschlagen:', e);
      return false;
    }
  }

  // ── Ordnerstruktur automatisch anlegen ────────────────────────────────────

  async function _initFolderStructure() {
    const r = _root;

    // personal_dashboard/
    const personal = await r.getDirectoryHandle(PERSONAL_ROOT, { create: true });
    await personal.getDirectoryHandle('widgets', { create: true });

    // personal_dashboard/data/
    const data = await personal.getDirectoryHandle('data', { create: true });
    await data.getDirectoryHandle('daily',   { create: true });
    await data.getDirectoryHandle('weekly',  { create: true });
    await data.getDirectoryHandle('monthly', { create: true });
    await data.getDirectoryHandle('yearly',  { create: true });

    // company_dashboard/
    const companyDash = await r.getDirectoryHandle(COMPANY_DASHBOARD_ROOT, { create: true });

    // personal_dashboard/exports/
    const exp = await personal.getDirectoryHandle('exports', { create: true });
    await exp.getDirectoryHandle('reports', { create: true });
    await exp.getDirectoryHandle('csv',     { create: true });

    // settings/
    await r.getDirectoryHandle(SETTINGS_ROOT, { create: true });
  }

  // ── Metadaten-Datei schreiben ─────────────────────────────────────────────

  async function _writeMetaFile() {
    const existing = await _readJSON('energiemonitor.json');
    const meta = {
      version:          '1.0',
      schema:           1,
      created:          existing?.created ?? new Date().toISOString().slice(0, 10),
      lastSeen:         new Date().toISOString().slice(0, 10),
      extensionVersion: chrome.runtime.getManifest().version
    };
    await _writeJSON('energiemonitor.json', meta);
  }

  // ── JSON lesen / schreiben ────────────────────────────────────────────────

  async function _writeJSON(path, data) {
    const parts    = path.split('/');
    const fileName = parts.pop();
    let dir = _root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const fh       = await dir.getFileHandle(fileName, { create: true });
    const writable  = await fh.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }

  async function _readJSON(path) {
    try {
      const parts    = path.split('/');
      const fileName = parts.pop();
      let dir = _root;
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part);
      }
      const fh   = await dir.getFileHandle(fileName);
      const file = await fh.getFile();
      return JSON.parse(await file.text());
    } catch {
      return null;
    }
  }

  async function _pathExists(path, kind) {
    try {
      const parts = path.split('/');
      const name = parts.pop();
      let dir = _root;
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part);
      }
      if (kind === 'file') {
        await dir.getFileHandle(name);
      } else {
        await dir.getDirectoryHandle(name);
      }
      return true;
    } catch {
      return false;
    }
  }

  async function _getOrCreateDir(path) {
    const parts = path.split('/').filter(Boolean);
    let dir = _root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    return dir;
  }

  async function _copyFile(fromPath, toPath) {
    const fromParts = fromPath.split('/');
    const fromFileName = fromParts.pop();
    let fromDir = _root;
    for (const part of fromParts) {
      fromDir = await fromDir.getDirectoryHandle(part);
    }
    const sourceHandle = await fromDir.getFileHandle(fromFileName);
    const sourceFile = await sourceHandle.getFile();

    const toParts = toPath.split('/');
    const toFileName = toParts.pop();
    const toDir = await _getOrCreateDir(toParts.join('/'));
    const targetHandle = await toDir.getFileHandle(toFileName, { create: true });
    const writable = await targetHandle.createWritable();
    await writable.write(await sourceFile.arrayBuffer());
    await writable.close();
  }

  async function _copyDirectory(fromPath, toPath) {
    const fromParts = fromPath.split('/').filter(Boolean);
    let fromDir = _root;
    for (const part of fromParts) {
      fromDir = await fromDir.getDirectoryHandle(part);
    }

    await _getOrCreateDir(toPath);

    for await (const entry of fromDir.values()) {
      const nextFrom = `${fromPath}/${entry.name}`;
      const nextTo = `${toPath}/${entry.name}`;
      if (entry.kind === 'directory') {
        await _copyDirectory(nextFrom, nextTo);
      } else {
        await _copyFile(nextFrom, nextTo);
      }
    }
  }

  async function _removeEntry(path, kind) {
    try {
      const parts = path.split('/').filter(Boolean);
      const name = parts.pop();
      let dir = _root;
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part);
      }
      await dir.removeEntry(name, { recursive: kind === 'directory' });
    } catch {
      // ignore
    }
  }

  async function _moveDirectoryIfExists(fromPath, toPath) {
    if (!await _pathExists(fromPath, 'directory')) return false;
    await _copyDirectory(fromPath, toPath);
    await _removeEntry(fromPath, 'directory');
    return true;
  }

  async function _moveFileIfExists(fromPath, toPath) {
    if (!await _pathExists(fromPath, 'file')) return false;
    await _copyFile(fromPath, toPath);
    await _removeEntry(fromPath, 'file');
    return true;
  }

  // ── Puffer (chrome.storage.local als Fallback) ────────────────────────────
  // Solange kein Ordner verbunden ist, landen Daten im Puffer.
  // flushBuffer() schreibt alles nach Verbindung.

  async function _addToBuffer(date, data) {
    const result = await chrome.storage.local.get('_writeBuffer');
    const buf    = result._writeBuffer || {};
    buf[date]    = data;
    await chrome.storage.local.set({ _writeBuffer: buf });
  }

  async function flushBuffer() {
    if (!_connected) return;
    const result = await chrome.storage.local.get('_writeBuffer');
    const buf    = result._writeBuffer || {};
    const dates  = Object.keys(buf);
    if (dates.length === 0) return;

    for (const date of dates) {
      await _writeJSON(_personalDataPath(`daily/${date}.json`), buf[date]);
    }
    // Aggregate nach Flush für alle gepufferten Tage neu berechnen
    for (const date of dates) {
      await _recomputeAggregates(date, buf[date]);
    }
    await chrome.storage.local.remove('_writeBuffer');
  }

  // ── Daily Data ────────────────────────────────────────────────────────────
  // Lesen: zuerst chrome.storage.local (schnell), dann Datei (Fallback)
  // Schreiben: immer chrome.storage.local + parallel in Datei

  async function getDayData(date) {
    const key    = `day_${date}`;
    const local  = await chrome.storage.local.get(key);
    if (local[key]) return local[key];

    if (_connected) {
      const fromFile = await _readPersonalDataJSON(`daily/${date}.json`);
      if (fromFile) {
        // In chrome.storage cachen für schnelle Folge-Reads
        await chrome.storage.local.set({ [key]: fromFile });
        return fromFile;
      }
    }
    return { date, services: {}, totalWh: 0, requests: [] };
  }

  async function saveDayData(date, data) {
    // 1. Immer in chrome.storage.local (Popup-Performance)
    await chrome.storage.local.set({ [`day_${date}`]: data });

    // 2. In Datei schreiben wenn verbunden
    if (_connected) {
      await _writeJSON(_personalDataPath(`daily/${date}.json`), data);
      // Aggregate nur beim Tageswechsel neu berechnen (nicht bei jedem Request)
      const today = new Date().toISOString().slice(0, 10);
      if (date !== today) {
        await _recomputeAggregates(date, data);
      }
    } else {
      await _addToBuffer(date, data);
    }
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  // Werden aus dem fertigen Tages-File berechnet — niemals inkrementell,
  // um Doppelzählungen durch mehrfache saveDayData-Aufrufe zu vermeiden.

  function _getWeekKey(dateStr) {
    const d     = new Date(dateStr + 'T12:00:00');
    const jan1  = new Date(d.getFullYear(), 0, 1);
    const week  = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  async function _recomputeAggregates(date, dayData) {
    await _recomputeWeekly(date, dayData);
    await _recomputeMonthly(date, dayData);
    await _recomputeYearly(date, dayData);
  }

  async function _recomputeWeekly(date, dayData) {
    const weekKey  = _getWeekKey(date);
    const path     = _personalDataPath(`weekly/${weekKey}.json`);
    const existing = (await _readJSON(path)) || { week: weekKey, totalWh: 0, services: {}, requestCount: 0, days: {} };

    // Diesen Tag im Aggregat ersetzen (nicht addieren)
    existing.days[date] = {
      totalWh:      dayData.totalWh,
      requestCount: (dayData.requests || []).length,
      services:     dayData.services
    };

    // Gesamt aus allen Tagen neu berechnen
    existing.totalWh      = 0;
    existing.requestCount = 0;
    existing.services     = {};
    for (const d of Object.values(existing.days)) {
      existing.totalWh      += d.totalWh || 0;
      existing.requestCount += d.requestCount || 0;
      for (const [svc, sd] of Object.entries(d.services || {})) {
        if (!existing.services[svc]) existing.services[svc] = { count: 0, wh: 0 };
        existing.services[svc].count += sd.count || 0;
        existing.services[svc].wh   += sd.wh   || 0;
      }
    }
    await _writeJSON(path, existing);
  }

  async function _recomputeMonthly(date, dayData) {
    const monthKey = date.slice(0, 7);
    const path     = _personalDataPath(`monthly/${monthKey}.json`);
    const existing = (await _readJSON(path)) || { month: monthKey, totalWh: 0, services: {}, requestCount: 0, days: {} };

    existing.days[date] = {
      totalWh:      dayData.totalWh,
      requestCount: (dayData.requests || []).length,
      services:     dayData.services
    };

    existing.totalWh      = 0;
    existing.requestCount = 0;
    existing.services     = {};
    for (const d of Object.values(existing.days)) {
      existing.totalWh      += d.totalWh || 0;
      existing.requestCount += d.requestCount || 0;
      for (const [svc, sd] of Object.entries(d.services || {})) {
        if (!existing.services[svc]) existing.services[svc] = { count: 0, wh: 0 };
        existing.services[svc].count += sd.count || 0;
        existing.services[svc].wh   += sd.wh   || 0;
      }
    }
    await _writeJSON(path, existing);
  }

  async function _recomputeYearly(date, dayData) {
    const yearKey  = date.slice(0, 4);
    const path     = _personalDataPath(`yearly/${yearKey}.json`);
    const existing = (await _readJSON(path)) || { year: yearKey, totalWh: 0, services: {}, requestCount: 0, days: {} };

    existing.days[date] = {
      totalWh:      dayData.totalWh,
      requestCount: (dayData.requests || []).length,
      services:     dayData.services
    };

    existing.totalWh      = 0;
    existing.requestCount = 0;
    existing.services     = {};
    for (const d of Object.values(existing.days)) {
      existing.totalWh      += d.totalWh || 0;
      existing.requestCount += d.requestCount || 0;
      for (const [svc, sd] of Object.entries(d.services || {})) {
        if (!existing.services[svc]) existing.services[svc] = { count: 0, wh: 0 };
        existing.services[svc].count += sd.count || 0;
        existing.services[svc].wh   += sd.wh   || 0;
      }
    }
    await _writeJSON(path, existing);
  }

  // ── Tageswechsel-Aggregate auslösen ───────────────────────────────────────
  // Wird aus background.js aufgerufen wenn ein neuer Tag beginnt.

  async function onDayRollover(yesterday) {
    if (!_connected) return;
    const dayData = await getDayData(yesterday);
    if (dayData.totalWh > 0) {
      await _recomputeAggregates(yesterday, dayData);
    }
  }

  // ── Settings Backup ───────────────────────────────────────────────────────

  async function backupSettings(settings) {
    if (!_connected) return;
    try {
      await _writeJSON(`${SETTINGS_ROOT}/config.json`, {
        ...settings,
        _backedUpAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('[EnergiStorage] Settings-Backup fehlgeschlagen:', e);
    }
  }

  // ── Alle Tage lesen (für Dashboard) ──────────────────────────────────────

  async function getAllDays(sinceDays = 30) {
    const result = [];
    for (let i = sinceDays; i >= 0; i--) {
      const d    = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const data = await getDayData(date);
      result.push(data);
    }
    return result;
  }

  // ── Migration: chrome.storage.local day_* → Filesystem ──────────────────
  // Läuft einmalig nach Ordner-Verbindung. Überspringt Tage die bereits als
  // Datei vorliegen.

  async function migrateLocalStorage() {
    if (!_connected) return 0;
    const all     = await chrome.storage.local.get(null);
    const dayKeys = Object.keys(all).filter(k => /^day_\d{4}-\d{2}-\d{2}$/.test(k));
    let migrated  = 0;
    for (const key of dayKeys) {
      const date     = key.slice(4); // 'day_2024-01-10' → '2024-01-10'
      const existing = await _readPersonalDataJSON(`daily/${date}.json`);
      if (!existing) {
        const dayData = all[key];
        await _writeJSON(_personalDataPath(`daily/${date}.json`), dayData);
        await _recomputeAggregates(date, dayData);
        migrated++;
      }
    }
    return migrated;
  }

  // ── Datendateien löschen (personal_dashboard/data/ leeren, Struktur neu anlegen) ────────────

  async function clearDataFolder() {
    if (!_connected) return;
    try {
      const personal = await _root.getDirectoryHandle(PERSONAL_ROOT, { create: true });
      await personal.removeEntry('data', { recursive: true });
    } catch { /* Ordner existiert nicht – egal */ }
    const personal = await _root.getDirectoryHandle(PERSONAL_ROOT, { create: true });
    const data = await personal.getDirectoryHandle('data', { create: true });
    await data.getDirectoryHandle('daily',   { create: true });
    await data.getDirectoryHandle('weekly',  { create: true });
    await data.getDirectoryHandle('monthly', { create: true });
    await data.getDirectoryHandle('yearly',  { create: true });
  }

  // ── Company Dashboard Config ─────────────────────────────────────────────

  const COMPANY_DASHBOARD_INDEX_KEY  = 'companyDashboardIndex';
  const COMPANY_DASHBOARD_CONFIGS_KEY = 'companyDashboardConfigs';
  const COMPANY_DASHBOARD_ACTIVE_KEY = 'activeCompanyDashboardId';

  function _normalizeDashboardConfig(config) {
    const now = new Date().toISOString();
    const safe = config || {};
    const departments = Array.isArray(safe.departments) ? safe.departments : [];
    return {
      id: safe.id,
      name: safe.name || safe.companyName || 'Neues Unternehmensdashboard',
      companyName: safe.companyName || safe.name || 'Neues Unternehmensdashboard',
      companyTagline: safe.companyTagline || 'Unternehmens-Dashboard',
      logoDataUrl: safe.logoDataUrl || '',
      logoUrl: safe.logoUrl || '',
      createdAt: safe.createdAt || now,
      updatedAt: now,
      source: safe.source || 'local',
      myDepartmentId: safe.myDepartmentId || departments[0]?.id || null,
      departments: departments.map((dept, idx) => ({
        id: dept.id,
        name: dept.name || `Abteilung ${idx + 1}`,
        color: dept.color || '#5b8af0',
        members: Number(dept.members) > 0 ? Number(dept.members) : 1,
        scale: typeof dept.scale === 'number' ? dept.scale : (idx === 0 ? 1 : 0.7),
        profile: dept.profile && typeof dept.profile === 'object'
          ? dept.profile
          : { chatgpt: 0.4, copilot: 0.2, claude: 0.15, gemini: 0.15, perplexity: 0.1 }
      }))
    };
  }

  async function _getCompanyDashboardLocalStore() {
    const data = await chrome.storage.local.get([
      COMPANY_DASHBOARD_INDEX_KEY,
      COMPANY_DASHBOARD_CONFIGS_KEY,
      COMPANY_DASHBOARD_ACTIVE_KEY
    ]);
    const index = data[COMPANY_DASHBOARD_INDEX_KEY] || { dashboards: [], activeDashboardId: null };
    const configs = data[COMPANY_DASHBOARD_CONFIGS_KEY] || {};
    const activeDashboardId = data[COMPANY_DASHBOARD_ACTIVE_KEY] || index.activeDashboardId || null;
    return { index, configs, activeDashboardId };
  }

  async function _setCompanyDashboardLocalStore(index, configs, activeDashboardId) {
    const nextIndex = {
      dashboards: Array.isArray(index?.dashboards) ? index.dashboards : [],
      activeDashboardId: activeDashboardId || null,
      updatedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({
      [COMPANY_DASHBOARD_INDEX_KEY]: nextIndex,
      [COMPANY_DASHBOARD_CONFIGS_KEY]: configs || {},
      [COMPANY_DASHBOARD_ACTIVE_KEY]: activeDashboardId || null
    });
  }

  async function _readCompanyDashboardIndexFile() {
    return (await _readJSON(`${COMPANY_DASHBOARD_ROOT}/index.json`)) || { dashboards: [], activeDashboardId: null };
  }

  async function _writeCompanyDashboardIndexFile(index) {
    await _writeJSON(`${COMPANY_DASHBOARD_ROOT}/index.json`, {
      dashboards: Array.isArray(index?.dashboards) ? index.dashboards : [],
      activeDashboardId: index?.activeDashboardId || null,
      updatedAt: new Date().toISOString()
    });
  }

  async function _syncCompanyDashboardLocalFromFs() {
    if (!_connected) return _getCompanyDashboardLocalStore();
    const dashboards = [];
    const configs = {};

    try {
      const root = await _root.getDirectoryHandle(COMPANY_DASHBOARD_ROOT);
      for await (const entry of root.values()) {
        if (entry.kind !== 'directory') continue;
        const cfg = await _readJSON(`${COMPANY_DASHBOARD_ROOT}/${entry.name}/dashboard.json`);
        if (!cfg || !cfg.companyName) continue;
        const summary = {
          id: cfg.id || entry.name,
          folderName: entry.name,
          name: cfg.name || cfg.companyName,
          companyName: cfg.companyName,
          departmentCount: Array.isArray(cfg.departments) ? cfg.departments.length : 0,
          updatedAt: cfg.updatedAt || cfg.createdAt || null,
          source: cfg.source || 'local',
          logoDataUrl: cfg.logoDataUrl || '',
          logoUrl: cfg.logoUrl || ''
        };
        dashboards.push(summary);
        configs[summary.id] = { ...cfg, id: summary.id, folderName: entry.name };
      }
    } catch {
      // ignore missing root or unreadable entries
    }

    dashboards.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
    const activeDashboardId = dashboards.length === 1 ? dashboards[0].id : null;
    const index = { dashboards, activeDashboardId };
    await _setCompanyDashboardLocalStore(index, configs, activeDashboardId);
    return { index, configs, activeDashboardId };
  }

  async function listCompanyDashboards() {
    if (_connected) {
      return _syncCompanyDashboardLocalFromFs();
    }
    return _getCompanyDashboardLocalStore();
  }

  async function getCompanyDashboard(id) {
    const state = await listCompanyDashboards();
    const targetId = id || state.activeDashboardId;
    if (!targetId) return null;
    return state.configs[targetId] || null;
  }

  async function saveCompanyDashboard(config, options = {}) {
    const state = await listCompanyDashboards();
    const id = config?.id || `dashboard-${Date.now()}`;
    const normalized = _normalizeDashboardConfig({ ...config, id });
    const folderName = _sanitizeDashboardFolderName(config?.folderName || normalized.id || normalized.companyName);
    const summary = {
      id,
      folderName,
      name: normalized.name,
      companyName: normalized.companyName,
      updatedAt: normalized.updatedAt,
      source: normalized.source
    };

    const configs = { ...state.configs, [id]: normalized };
    const dashboards = (state.index.dashboards || []).filter(item => item.id !== id);
    dashboards.push(summary);
    dashboards.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));

    const activeDashboardId = options.setActive === false
      ? (state.activeDashboardId || null)
      : id;

    const nextIndex = { dashboards, activeDashboardId };
    await _setCompanyDashboardLocalStore(nextIndex, configs, activeDashboardId);

    if (_connected) {
      await _writeJSON(`${COMPANY_DASHBOARD_ROOT}/${folderName}/dashboard.json`, {
        ...normalized,
        folderName
      });
    }

    return normalized;
  }

  async function setActiveCompanyDashboard(id) {
    const state = await listCompanyDashboards();
    if (!id || !state.configs[id]) return false;
    const nextIndex = {
      dashboards: state.index.dashboards || [],
      activeDashboardId: id
    };
    await _setCompanyDashboardLocalStore(nextIndex, state.configs, id);
    return true;
  }

  async function importCompanyDashboardFromStorage() {
    if (!_connected) {
      return { ok: false, reason: 'not-connected' };
    }

    const synced = await _syncCompanyDashboardLocalFromFs();
    if (synced.index?.dashboards?.length === 1) {
      const activeId = synced.index.dashboards[0].id;
      return { ok: true, dashboard: synced.configs[activeId] || null, source: 'company_dashboard' };
    }

    const legacyCandidates = [
      'dashboard/company-dashboard.json',
      'dashboard/company.json',
      'dashboard/dashboard.json',
      'dashboard/config.json'
    ];

    const singleDashboardCandidates = [
      `${COMPANY_DASHBOARD_ROOT}/dashboard.json`,
      `${COMPANY_DASHBOARD_ROOT}/company-dashboard.json`,
      `${COMPANY_DASHBOARD_ROOT}/config.json`
    ];

    for (const path of singleDashboardCandidates) {
      const config = await _readJSON(path);
      if (!config) continue;
      const dashboard = await saveCompanyDashboard({
        ...(config.dashboard || config),
        source: 'single-file-import'
      });
      return { ok: true, dashboard, source: path };
    }

    try {
      const companyDashDir = await _root.getDirectoryHandle(COMPANY_DASHBOARD_ROOT);
      for await (const entry of companyDashDir.values()) {
        if (entry.kind !== 'directory') continue;
        const parsed = await _readJSON(`${COMPANY_DASHBOARD_ROOT}/${entry.name}/dashboard.json`);
        if (!parsed || !parsed.companyName) continue;
        const dashboard = await saveCompanyDashboard({
          ...(parsed.dashboard || parsed),
          folderName: entry.name,
          source: 'directory-scan-import'
        }, { setActive: false });
        return { ok: true, dashboard, source: `${COMPANY_DASHBOARD_ROOT}/${entry.name}/dashboard.json` };
      }
    } catch {
      // company_dashboard Ordner fehlt oder ist nicht lesbar
    }

    for (const path of legacyCandidates) {
      const legacyConfig = await _readJSON(path);
      if (!legacyConfig) continue;
      const dashboard = await saveCompanyDashboard({
        ...(legacyConfig.dashboard || legacyConfig),
        source: 'legacy-import'
      });
      return { ok: true, dashboard, source: path };
    }

    return { ok: false, reason: 'empty' };
  }

  async function validateExtensionFolderStructure() {
    if (!_connected) {
      return { ok: false, reason: 'not-connected', missing: [] };
    }

    const requiredDirs = [
      PERSONAL_ROOT,
      `${PERSONAL_ROOT}/widgets`,
      PERSONAL_DATA_ROOT,
      `${PERSONAL_DATA_ROOT}/daily`,
      `${PERSONAL_DATA_ROOT}/weekly`,
      `${PERSONAL_DATA_ROOT}/monthly`,
      `${PERSONAL_DATA_ROOT}/yearly`,
      COMPANY_DASHBOARD_ROOT,
      PERSONAL_EXPORTS_ROOT,
      `${PERSONAL_EXPORTS_ROOT}/reports`,
      `${PERSONAL_EXPORTS_ROOT}/csv`,
      SETTINGS_ROOT
    ];
    const requiredFiles = [
      'energiemonitor.json'
    ];

    const missing = [];

    for (const path of requiredDirs) {
      const parts = path.split('/');
      let dir = _root;
      let ok = true;
      for (const part of parts) {
        try {
          dir = await dir.getDirectoryHandle(part);
        } catch {
          ok = false;
          break;
        }
      }
      if (!ok) missing.push(path);
    }

    for (const path of requiredFiles) {
      const file = await _readJSON(path);
      if (!file) missing.push(path);
    }

    const meta = await _readJSON('energiemonitor.json');
    return {
      ok: missing.length === 0,
      reason: missing.length === 0 ? 'valid' : 'missing',
      missing,
      meta: meta || null
    };
  }

  async function repairExtensionFolderStructure() {
    if (!_connected) {
      return { ok: false, reason: 'not-connected' };
    }

    await _moveDirectoryIfExists(LEGACY_DATA_ROOT, PERSONAL_DATA_ROOT);
    await _moveDirectoryIfExists(LEGACY_EXPORTS_ROOT, PERSONAL_EXPORTS_ROOT);
    if (await _pathExists(`${PERSONAL_ROOT}/settings`, 'directory')) {
      await _moveDirectoryIfExists(`${PERSONAL_ROOT}/settings`, SETTINGS_ROOT);
    } else {
      await _moveDirectoryIfExists('settings', SETTINGS_ROOT);
    }
    await _moveDirectoryIfExists(`${LEGACY_DASHBOARD_ROOT}/widgets`, `${PERSONAL_ROOT}/widgets`);
    if (await _pathExists(`${COMPANY_DASHBOARD_ROOT}/dashboards`, 'directory')) {
      try {
        const oldDashRoot = await _root.getDirectoryHandle(`${COMPANY_DASHBOARD_ROOT}`.split('/')[0]);
        const nested = await oldDashRoot.getDirectoryHandle('dashboards');
        for await (const entry of nested.values()) {
          if (entry.kind !== 'directory') continue;
          const oldPath = `${COMPANY_DASHBOARD_ROOT}/dashboards/${entry.name}/dashboard.json`;
          const parsed = await _readJSON(oldPath);
          if (!parsed) continue;
          await _writeJSON(`${COMPANY_DASHBOARD_ROOT}/${entry.name}/dashboard.json`, {
            ...(parsed.dashboard || parsed),
            folderName: entry.name
          });
        }
      } catch {
        // ignore migration issues here; validation will still reveal remaining gaps
      }
    }
    await _removeEntry(LEGACY_DASHBOARD_ROOT, 'directory');
    await _removeEntry(`${COMPANY_DASHBOARD_ROOT}/dashboards`, 'directory');
    await _removeEntry(`${COMPANY_DASHBOARD_ROOT}/imports`, 'directory');
    await _removeEntry(`${COMPANY_DASHBOARD_ROOT}/templates`, 'directory');

    await _initFolderStructure();
    await _writeMetaFile();

    const validation = await validateExtensionFolderStructure();
    return {
      ok: !!validation.ok,
      reason: validation.ok ? 'repaired' : validation.reason,
      missing: validation.missing || [],
      meta: validation.meta || null
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    init,
    connect,
    isConnected:        () => _connected,
    getDayData,
    saveDayData,
    flushBuffer,
    backupSettings,
    getAllDays,
    onDayRollover,
    recomputeAggregates: _recomputeAggregates,
    clearDataFolder,
    migrateLocalStorage,
    listCompanyDashboards,
    getCompanyDashboard,
    saveCompanyDashboard,
    setActiveCompanyDashboard,
    importCompanyDashboardFromStorage,
    validateExtensionFolderStructure,
    repairExtensionFolderStructure
  };
})();
