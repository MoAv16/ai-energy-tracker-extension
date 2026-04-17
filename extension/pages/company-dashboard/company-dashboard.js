(function() {
  'use strict';

  const DEFAULT_PROFILE = {
    chatgpt: 0.4,
    copilot: 0.2,
    claude: 0.15,
    gemini: 0.15,
    perplexity: 0.1
  };

  const departmentList = document.getElementById('departmentList');
  const createForm = document.getElementById('createForm');
  const existingList = document.getElementById('existingList');
  const existingEmpty = document.getElementById('existingEmpty');
  const statusEl = document.getElementById('status');
  const createPanel = document.getElementById('createPanel');
  const logoFileInput = document.getElementById('logoFile');
  const existingLogoFileInput = document.getElementById('existingLogoFile');
  const createLogoPreview = document.getElementById('createLogoPreview');

  let createLogoDataUrl = '';
  let existingLogoTargetId = null;

  function _obOpenDB() {
    return new Promise(function(resolve, reject) {
      const req = indexedDB.open('energiescout', 1);
      req.onupgradeneeded = function(e) { e.target.result.createObjectStore('fs'); };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  }

  function _obGetHandle() {
    return _obOpenDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        const req = db.transaction('fs', 'readonly').objectStore('fs').get('rootHandle');
        req.onsuccess = function(e) { resolve(e.target.result || null); };
        req.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function isManageMode() {
    const params = new URLSearchParams(window.location.search);
    return params.get('manage') === '1';
  }

  function setStatus(message, type) {
    statusEl.textContent = message || '';
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  function makeId(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 10);
  }

  function redirectToLegacy(dashboardId) {
    window.location.href = chrome.runtime.getURL('pages/company-dashboard/company-dashboard-legacy.html?dashboardId=' + encodeURIComponent(dashboardId));
  }

  function renderLogoPreview(container, dataUrl) {
    if (!container) return;
    if (dataUrl) {
      container.innerHTML = '<img alt="Logo Vorschau">';
      container.querySelector('img').src = dataUrl;
      return;
    }
    container.innerHTML = '<div class="logo-placeholder">Noch kein Logo ausgewählt</div>';
  }

  function readImageAsDataUrl(file) {
    return new Promise(function(resolve, reject) {
      if (!file) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = function() {
        resolve(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = function() {
        reject(new Error('Datei konnte nicht gelesen werden.'));
      };
      reader.readAsDataURL(file);
    });
  }

  async function pickLogoFileForDashboardFolder(folderName) {
    if (typeof window.showOpenFilePicker !== 'function') {
      throw new Error('File picker API nicht verfügbar.');
    }

    let startHandle = 'documents';
    const rootHandle = await _obGetHandle();

    if (rootHandle && folderName) {
      try {
        const companyHandle = await rootHandle.getDirectoryHandle('company_dashboard');
        startHandle = await companyHandle.getDirectoryHandle(folderName);
      } catch {
        startHandle = rootHandle;
      }
    } else if (rootHandle) {
      startHandle = rootHandle;
    }

    const [fileHandle] = await window.showOpenFilePicker({
      id: 'company-dashboard-logo',
      mode: 'read',
      multiple: false,
      startIn: startHandle,
      types: [{
        description: 'Bilddateien',
        accept: {
          'image/*': ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif']
        }
      }]
    });
    return fileHandle ? fileHandle.getFile() : null;
  }

  function sendDashboardSave(payload, pendingText, successText) {
    return new Promise(function(resolve, reject) {
      setStatus(pendingText || 'Speichere Dashboard ...');
      chrome.runtime.sendMessage({ type: 'company-dashboard-save', dashboard: payload }, function(resp) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!resp || !resp.ok || !resp.dashboard?.id) {
          reject(new Error(resp?.error || 'Dashboard konnte nicht gespeichert werden.'));
          return;
        }
        setStatus(successText || 'Dashboard gespeichert.', 'success');
        resolve(resp.dashboard);
      });
    });
  }

  function saveDashboard(messageType, payload, pendingText, successText) {
    setStatus(pendingText || 'Speichere Dashboard ...');
    chrome.runtime.sendMessage({ type: messageType, dashboard: payload }, function(resp) {
      if (chrome.runtime.lastError) {
        setStatus('Aktion fehlgeschlagen: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      if (!resp || !resp.ok || !resp.dashboard?.id) {
        setStatus('Dashboard konnte nicht gespeichert werden.', 'error');
        return;
      }
      setStatus(successText || 'Dashboard gespeichert. Weiterleitung ...', 'success');
      redirectToLegacy(resp.dashboard.id);
    });
  }

  function addDepartmentRow(initial) {
    const row = document.createElement('div');
    row.className = 'dept-row';
    row.innerHTML =
      '<div><label>Name</label><input class="dept-name" type="text" placeholder="Abteilungsname" required></div>' +
      '<div><label>Mitglieder</label><input class="dept-members" type="number" min="1" step="1" value="5" required></div>' +
      '<div><label>Farbe</label><input class="dept-color" type="color" value="#5b8af0"></div>' +
      '<div class="row-actions"><button class="ghost-btn remove-dept" type="button">Entfernen</button></div>';

    row.querySelector('.dept-name').value = initial?.name || '';
    row.querySelector('.dept-members').value = initial?.members || 5;
    row.querySelector('.dept-color').value = initial?.color || '#5b8af0';

    row.querySelector('.remove-dept').addEventListener('click', function() {
      if (departmentList.children.length <= 1) {
        setStatus('Mindestens eine Abteilung ist erforderlich.', 'error');
        return;
      }
      row.remove();
    });

    departmentList.appendChild(row);
  }

  function collectDepartments() {
    return Array.from(departmentList.children).map(function(row, idx) {
      return {
        id: makeId('dept'),
        name: row.querySelector('.dept-name').value.trim() || ('Abteilung ' + (idx + 1)),
        members: Math.max(1, Number(row.querySelector('.dept-members').value) || 1),
        color: row.querySelector('.dept-color').value || '#5b8af0',
        scale: idx === 0 ? 1 : 0.7,
        profile: { ...DEFAULT_PROFILE }
      };
    });
  }

  function renderExistingDashboards(dashboards) {
    existingList.innerHTML = '';

    if (!dashboards.length) {
      existingList.classList.add('hidden');
      existingEmpty.classList.remove('hidden');
      return;
    }

    existingEmpty.classList.add('hidden');
    existingList.classList.remove('hidden');

    dashboards.forEach(function(item) {
      const departmentCount = Number(item.departmentCount) > 0 ? Number(item.departmentCount) : 0;
      const logoMarkup = (item.logoDataUrl || item.logoUrl)
        ? '<img alt="Dashboard-Logo" src="' + (item.logoDataUrl || item.logoUrl) + '">'
        : '<div class="dashboard-logo-empty">Noch kein Logo gesetzt</div>';

      const row = document.createElement('div');
      row.className = 'existing-item';
      row.innerHTML =
        '<div class="existing-main">' +
          '<div class="existing-header">' +
            '<div class="existing-name"></div>' +
            '<div class="existing-meta"></div>' +
          '</div>' +
          '<div class="dashboard-stats">' +
            '<div class="dashboard-logo-card">' +
              logoMarkup +
            '</div>' +
            '<div class="dashboard-stat">' +
              '<div class="dashboard-stat-label">Abteilungen</div>' +
              '<div class="dashboard-stat-value">' + departmentCount + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cta-row">' +
          '<button class="ghost-btn update-logo" type="button">Logo ändern</button>' +
          '<button class="ghost-btn remove-logo" type="button">Logo entfernen</button>' +
          '<button class="secondary-btn open-existing" type="button">Öffnen</button>' +
        '</div>';

      row.querySelector('.existing-name').textContent = item.companyName || item.name || item.id;
      row.querySelector('.existing-meta').textContent = item.name || 'Dashboard';

      row.querySelector('.open-existing').addEventListener('click', function() {
        setStatus('Oeffne Dashboard ...');
        redirectToLegacy(item.id);
      });

      row.querySelector('.update-logo').addEventListener('click', async function() {
        existingLogoTargetId = item.id;
        try {
          const file = await pickLogoFileForDashboardFolder(item.folderName || item.id);
          if (!file) return;
          existingLogoFileInput.value = '';
          const logoDataUrl = await readImageAsDataUrl(file);
          if (!logoDataUrl) return;

          setStatus('Aktualisiere Logo ...');
          const resp = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ type: 'company-dashboard-get', id: existingLogoTargetId }, resolve);
          });
          if (!resp?.dashboard) {
            setStatus('Dashboard konnte nicht geladen werden.', 'error');
            return;
          }
          await sendDashboardSave({
            ...resp.dashboard,
            id: existingLogoTargetId,
            folderName: resp.dashboard.folderName || item.folderName || existingLogoTargetId,
            logoDataUrl: logoDataUrl,
            logoUrl: ''
          }, 'Aktualisiere Logo ...', 'Logo gespeichert.');
          existingLogoTargetId = null;
          await bootstrap();
        } catch (error) {
          if (error && error.name === 'AbortError') return;
          existingLogoFileInput.value = '';
          existingLogoFileInput.click();
        }
      });

      row.querySelector('.remove-logo').addEventListener('click', async function() {
        try {
          setStatus('Entferne Logo ...');
          const resp = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ type: 'company-dashboard-get', id: item.id }, resolve);
          });
          if (!resp?.dashboard) {
            setStatus('Dashboard konnte nicht geladen werden.', 'error');
            return;
          }
          await sendDashboardSave({
            ...resp.dashboard,
            id: item.id,
            folderName: item.folderName || resp.dashboard.folderName || item.id,
            logoDataUrl: '',
            logoUrl: ''
          }, 'Entferne Logo ...', 'Logo entfernt.');
          await bootstrap();
        } catch (error) {
          setStatus('Logo konnte nicht entfernt werden: ' + error.message, 'error');
        }
      });

      existingList.appendChild(row);
    });
  }

  async function bootstrap() {
    if (!departmentList.children.length) {
      addDepartmentRow({ name: 'Meine Abteilung', members: 8, color: '#5b8af0' });
      addDepartmentRow({ name: 'Marketing', members: 6, color: '#f59e0b' });
    }

    setStatus('Prüfe vorhandene Dashboard-Konfiguration ...');

    chrome.runtime.sendMessage({ type: 'company-dashboard-state' }, function(resp) {
      const dashboards = resp?.dashboards || [];

      renderExistingDashboards(dashboards);

      if (dashboards.length === 1 && !isManageMode()) {
        setStatus('Genau ein Unternehmens-Dashboard gefunden. Weiterleitung ...', 'success');
        redirectToLegacy(dashboards[0].id);
        return;
      }

      setStatus(dashboards.length === 1 && isManageMode()
        ? 'Verwaltungsmodus aktiv. Das vorhandene Dashboard kann hier bearbeitet werden.'
        : dashboards.length > 1
        ? 'Mehrere Unternehmens-Dashboards gefunden. Bitte wähle eines aus.'
        : 'Noch kein Unternehmens-Dashboard vorhanden.');
    });
  }

  document.getElementById('jumpCreate').addEventListener('click', function() {
    createPanel.classList.remove('hidden');
    document.getElementById('createPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(function() {
      document.getElementById('companyName').focus();
    }, 180);
    setStatus('Formular für neues Dashboard geöffnet.');
  });

  document.getElementById('addDepartment').addEventListener('click', function() {
    addDepartmentRow();
  });

  logoFileInput.addEventListener('change', async function() {
    try {
      createLogoDataUrl = await readImageAsDataUrl(logoFileInput.files?.[0]);
      renderLogoPreview(createLogoPreview, createLogoDataUrl);
      setStatus(createLogoDataUrl ? 'Logo für neues Dashboard geladen.' : '');
    } catch (error) {
      setStatus('Logo konnte nicht gelesen werden: ' + error.message, 'error');
    }
  });

  document.getElementById('clearCreateLogo').addEventListener('click', function() {
    createLogoDataUrl = '';
    logoFileInput.value = '';
    renderLogoPreview(createLogoPreview, '');
    setStatus('Logo für neues Dashboard entfernt.');
  });

  existingLogoFileInput.addEventListener('change', async function() {
    if (!existingLogoTargetId) return;
    try {
      const logoDataUrl = await readImageAsDataUrl(existingLogoFileInput.files?.[0]);
      if (!logoDataUrl) return;
      setStatus('Aktualisiere Logo ...');
      const resp = await new Promise(function(resolve) {
        chrome.runtime.sendMessage({ type: 'company-dashboard-get', id: existingLogoTargetId }, resolve);
      });
      if (!resp?.dashboard) {
        setStatus('Dashboard konnte nicht geladen werden.', 'error');
        return;
      }
      await sendDashboardSave({
        ...resp.dashboard,
        id: existingLogoTargetId,
        folderName: resp.dashboard.folderName || existingLogoTargetId,
        logoDataUrl: logoDataUrl,
        logoUrl: ''
      }, 'Aktualisiere Logo ...', 'Logo gespeichert.');
      existingLogoTargetId = null;
      await bootstrap();
    } catch (error) {
      setStatus('Logo konnte nicht gespeichert werden: ' + error.message, 'error');
    }
  });

  createForm.addEventListener('submit', function(event) {
    event.preventDefault();
    setStatus('Dashboard wird erstellt ...');

    const companyName = document.getElementById('companyName').value.trim();
    if (!companyName) {
      setStatus('Bitte einen Firmennamen angeben.', 'error');
      return;
    }

    const departments = collectDepartments();
    const payload = {
      name: document.getElementById('dashboardName').value.trim() || companyName,
      companyName: companyName,
      companyTagline: document.getElementById('companyTagline').value.trim() || 'Unternehmens-Dashboard',
      logoDataUrl: createLogoDataUrl,
      myDepartmentId: departments[0].id,
      departments: departments
    };

    saveDashboard('company-dashboard-create', payload, 'Dashboard wird erstellt ...', 'Dashboard erstellt. Weiterleitung ...');
  });

  renderLogoPreview(createLogoPreview, '');
  bootstrap();
})();
