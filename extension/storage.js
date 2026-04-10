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

    // data/
    const data = await r.getDirectoryHandle('data', { create: true });
    await data.getDirectoryHandle('daily',   { create: true });
    await data.getDirectoryHandle('weekly',  { create: true });
    await data.getDirectoryHandle('monthly', { create: true });
    await data.getDirectoryHandle('yearly',  { create: true });

    // dashboard/
    const dash = await r.getDirectoryHandle('dashboard', { create: true });
    await dash.getDirectoryHandle('widgets', { create: true });

    // exports/
    const exp = await r.getDirectoryHandle('exports', { create: true });
    await exp.getDirectoryHandle('reports', { create: true });
    await exp.getDirectoryHandle('csv',     { create: true });

    // settings/
    await r.getDirectoryHandle('settings', { create: true });
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
      await _writeJSON(`data/daily/${date}.json`, buf[date]);
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
      const fromFile = await _readJSON(`data/daily/${date}.json`);
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
      await _writeJSON(`data/daily/${date}.json`, data);
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
    const path     = `data/weekly/${weekKey}.json`;
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
    const path     = `data/monthly/${monthKey}.json`;
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
    const path     = `data/yearly/${yearKey}.json`;
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
      await _writeJSON('settings/config.json', {
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
      const existing = await _readJSON(`data/daily/${date}.json`);
      if (!existing) {
        const dayData = all[key];
        await _writeJSON(`data/daily/${date}.json`, dayData);
        await _recomputeAggregates(date, dayData);
        migrated++;
      }
    }
    return migrated;
  }

  // ── Datendateien löschen (data/ leeren, Struktur neu anlegen) ────────────

  async function clearDataFolder() {
    if (!_connected) return;
    try {
      await _root.removeEntry('data', { recursive: true });
    } catch { /* Ordner existiert nicht – egal */ }
    const data = await _root.getDirectoryHandle('data', { create: true });
    await data.getDirectoryHandle('daily',   { create: true });
    await data.getDirectoryHandle('weekly',  { create: true });
    await data.getDirectoryHandle('monthly', { create: true });
    await data.getDirectoryHandle('yearly',  { create: true });
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
    migrateLocalStorage
  };
})();
