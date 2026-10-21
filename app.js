/**
 * ===================================================================
 * كتالوج أسيل نت - التطبيق الرئيسي وقارئ غوغل شيتس التلقائي
 * Aseel Net Wi-Fi Cards Catalog & Automatic Google Sheets Sync
 * ===================================================================
 */

(function () {
  'use strict';

  // --- Configuration & State ---
  const DEFAULT_NET = 'أسيل نت';
  const STORAGE_KEY_CONFIG = 'aseel_catalog_config_v2';
  const STORAGE_KEY_CACHE = 'aseel_cards_cache_v2';
  const STORAGE_KEY_SOLD_LOCAL = 'aseel_sold_overrides_v2';
  const STORAGE_KEY_SOLD_DATES = 'aseel_sold_dates_v2';
  const STORAGE_KEY_THEME = 'aseel_theme_v2';
  const STORAGE_KEY_IMG_TEMPLATE = 'aseel_img_template_v2';

  // State object
  const state = {
    config: {
      networkName: (window.APP_CONFIG && window.APP_CONFIG.networkName) || DEFAULT_NET,
      sheetUrl: (window.APP_CONFIG && window.APP_CONFIG.defaultSheetUrl) || '',
      scriptUrl: (window.APP_CONFIG && window.APP_CONFIG.scriptUrl) || '',
      autoRefresh: true,
      refreshIntervalMinutes: 3,
      currency: 'ل.س'
    },
    cards: [],
    filteredCards: [],
    activeCategory: '',
    statusFilter: 'available', // 'available' | 'all' | 'sold'
    imageTemplate: 'ticket', // 'ticket' | 'modern' | 'royal' | 'neon' | 'emerald' | 'crimson'
    searchQuery: '',
    page: 1,
    pageSize: 20,
    isSyncing: false,
    lastSyncTime: null,
    syncTimer: null,
    soldOverrides: {}, // { [cardUser]: boolean }
    soldDates: {}, // { [cardUser]: string (formatted date) }
    currentPreviewCard: null
  };

  // --- DOM Elements ---
  const elements = {
    brandName: document.getElementById('brand-name'),
    searchQuery: document.getElementById('search-query'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    chipsContainer: document.getElementById('chips-container'),
    cardsList: document.getElementById('cards-list'),
    loadMoreBtn: document.getElementById('load-more-btn'),
    totalCardsCount: document.getElementById('total-cards-count'),
    availableCardsCount: document.getElementById('available-cards-count'),
    soldCardsCount: document.getElementById('sold-cards-count'),
    cardsCounterLabel: document.getElementById('cards-counter-label'),
    statusBadge: document.getElementById('status-badge'),
    statusText: document.getElementById('status-text'),
    statusSyncTime: document.getElementById('status-sync-time'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnSettings: document.getElementById('btn-settings'),
    btnTheme: document.getElementById('btn-theme'),
    // Modals
    settingsModal: document.getElementById('settings-modal'),
    previewModal: document.getElementById('preview-modal'),
    previewImg: document.getElementById('preview-img'),
    btnDownloadPreview: document.getElementById('btn-download-preview'),
    btnSharePreview: document.getElementById('btn-share-preview'),
    // Settings inputs
    inputSheetUrl: document.getElementById('input-sheet-url'),
    inputScriptUrl: document.getElementById('input-script-url'),
    inputNetworkName: document.getElementById('input-network-name'),
    selectAutoRefresh: document.getElementById('select-auto-refresh'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    btnTestSheet: document.getElementById('btn-test-sheet'),
    testSheetMsg: document.getElementById('test-sheet-msg'),
    renderCanvas: document.getElementById('render-canvas'),
    toastContainer: document.getElementById('toast-container')
  };

  // --- Initialize App ---
  function init() {
    loadSavedSettings();
    loadSoldOverrides();
    loadSoldDates();
    applyTheme(getPreferredTheme());
    setupEventListeners();
    setupUrlParamsOverride();

    // Check if we have cached cards to display immediately
    const hasCache = loadCachedCards();

    // Trigger automatic sync with Google Sheets
    if (state.config.sheetUrl) {
      syncGoogleSheets(false);
    } else if (!hasCache) {
      loadDemoCards();
    }

    setupAutoRefreshTimer();
  }

  // --- URL Parameters Override (?sheet=... or ?net=...) ---
  function setupUrlParamsOverride() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const sheetParam = urlParams.get('sheet');
      const scriptParam = urlParams.get('script') || urlParams.get('gas') || urlParams.get('scriptUrl');
      const netParam = urlParams.get('net');

      if (sheetParam) {
        state.config.sheetUrl = sheetParam.trim();
      }
      if (scriptParam) {
        state.config.scriptUrl = scriptParam.trim();
      }
      if (netParam) {
        state.config.networkName = netParam.trim();
      }
      if (sheetParam || scriptParam || netParam) {
        saveSettings();
      }
    } catch (e) {
      console.warn('URL params error', e);
    }
  }

  // --- Settings Persistence ---
  function loadSavedSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        const parsed = JSON.parse(saved);
        state.config = Object.assign({}, state.config, parsed);
      }
    } catch (e) {
      console.warn('Error reading config from localStorage', e);
    }

    if (elements.brandName) {
      elements.brandName.textContent = state.config.networkName || DEFAULT_NET;
    }

    try {
      const savedImgTpl = localStorage.getItem(STORAGE_KEY_IMG_TEMPLATE);
      const validTemplates = ['ticket', 'modern', 'royal', 'neon', 'emerald', 'crimson'];
      if (savedImgTpl && validTemplates.includes(savedImgTpl)) {
        state.imageTemplate = savedImgTpl;
      }
    } catch (e) { }

    // Synchronize image template switcher buttons active state
    document.querySelectorAll('.template-btn[data-img-template]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-img-template') === state.imageTemplate);
    });
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(state.config));
    } catch (e) {
      console.warn('Error saving config', e);
    }

    if (elements.brandName) {
      elements.brandName.textContent = state.config.networkName || DEFAULT_NET;
    }
  }

  function loadSoldOverrides() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SOLD_LOCAL);
      if (saved) {
        state.soldOverrides = JSON.parse(saved) || {};
      }
    } catch (e) {
      state.soldOverrides = {};
    }
  }

  function saveSoldOverrides() {
    try {
      localStorage.setItem(STORAGE_KEY_SOLD_LOCAL, JSON.stringify(state.soldOverrides));
    } catch (e) { }
  }

  function loadSoldDates() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SOLD_DATES);
      if (saved) {
        state.soldDates = JSON.parse(saved) || {};
      }
    } catch (e) {
      state.soldDates = {};
    }
  }

  function saveSoldDates() {
    try {
      localStorage.setItem(STORAGE_KEY_SOLD_DATES, JSON.stringify(state.soldDates));
    } catch (e) { }
  }

  // --- Cache Persistence ---
  function loadCachedCards() {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_CACHE);
      if (cached) {
        const data = JSON.parse(cached);
        if (data && Array.isArray(data.cards) && data.cards.length) {
          state.cards = data.cards;
          state.lastSyncTime = data.timestamp ? new Date(data.timestamp) : new Date();
          updateSyncStatus('offline', 'بيانات محفوظة محلياً');
          render();
          return true;
        }
      }
    } catch (e) { }
    return false;
  }

  function saveCachedCards(cards) {
    try {
      localStorage.setItem(
        STORAGE_KEY_CACHE,
        JSON.stringify({
          cards: cards,
          timestamp: new Date().toISOString()
        })
      );
    } catch (e) { }
  }

  // --- Google Sheets URL Helpers & Resolver ---
  function parseSheetUrl(inputUrl) {
    if (!inputUrl || !inputUrl.trim()) return null;
    const url = inputUrl.trim();

    // 1. Direct ID (25+ characters alphanum, dashes, underscores)
    if (/^[a-zA-Z0-9-_]{25,}$/.test(url)) {
      return {
        id: url,
        gid: '0',
        gvizUrl: `https://docs.google.com/spreadsheets/d/${url}/gviz/tq?tqx=out:csv`,
        exportUrl: `https://docs.google.com/spreadsheets/d/${url}/export?format=csv`
      };
    }

    // 2. Published web URL (/pub?output=csv or /pubhtml)
    if (url.includes('/pub')) {
      let csvUrl = url;
      if (csvUrl.includes('pubhtml')) {
        csvUrl = csvUrl.replace('pubhtml', 'pub?output=csv');
      } else if (!csvUrl.includes('output=csv')) {
        csvUrl += (csvUrl.includes('?') ? '&' : '?') + 'output=csv';
      }
      return {
        id: 'published',
        gid: '0',
        gvizUrl: csvUrl,
        exportUrl: csvUrl
      };
    }

    // 3. Standard Docs URL: https://docs.google.com/spreadsheets/d/{ID}/...
    const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (idMatch && idMatch[1]) {
      const id = idMatch[1];
      const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
      const gid = gidMatch ? gidMatch[1] : '0';
      const sheetNameMatch = url.match(/[#&?]sheet=([^&#]+)/);
      const sheetParam = sheetNameMatch ? `&sheet=${encodeURIComponent(decodeURIComponent(sheetNameMatch[1]))}` : `&gid=${gid}`;

      return {
        id: id,
        gid: gid,
        gvizUrl: `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${sheetParam}`,
        exportUrl: `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
      };
    }

    // Fallback URL as is
    return {
      id: 'custom',
      gid: '0',
      gvizUrl: url,
      exportUrl: url
    };
  }

  // --- RFC-Compliant CSV Parser ---
  function parseCSV(text) {
    if (!text || !text.trim()) return [];

    const lines = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    let i = 0;
    const len = text.length;

    // Detect delimiter: check first line for tabs vs commas
    let delimiter = ',';
    const firstLineEnd = text.indexOf('\n');
    const firstLine = firstLineEnd !== -1 ? text.substring(0, firstLineEnd) : text;
    if (firstLine.indexOf('\t') !== -1 && (firstLine.split('\t').length > firstLine.split(',').length)) {
      delimiter = '\t';
    }

    while (i < len) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
        i++;
        continue;
      }

      if (char === delimiter && !inQuotes) {
        row.push(cell.trim());
        cell = '';
        i++;
        continue;
      }

      if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(cell.trim());
        if (row.some(function (c) { return c !== ''; })) {
          lines.push(row);
        }
        row = [];
        cell = '';
        i++;
        continue;
      }

      cell += char;
      i++;
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      if (row.some(function (c) { return c !== ''; })) {
        lines.push(row);
      }
    }

    return lines;
  }

  // --- Smart Column Header Mapper ---
  function mapRowsToCards(rawRows) {
    if (!rawRows || !rawRows.length) return [];

    // Helper to normalize arabic headers
    function cleanHeader(h) {
      return String(h || '')
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\s_\-]+/g, '');
    }

    function isHeaderWord(word) {
      const c = cleanHeader(word);
      return /^(اسمالمستخدم|المستخدم|كودالكرت|كود|الحساب|اسم|كلمهالمرور|المرور|كلمهالسر|السر|رمزالمرور|الباسوورد|باسورد|رمز|الشبكه|اسمالشبكه|السعر|سعر|القيمه|الفئه|فئهالكرت|النوع|نوعالكرت|الباقه|الاشتراك|الصلاحيه|المده|صلاحيهالكرت|الوقت|الرصيد|الحجم|جيجا|ميجابايت|الحاله|حالهالكرت|الوضع|user|username|pass|password|pwd|pin|secret|price|cost|type|network|validity|balance|status)$/.test(c);
    }

    function isRowAHeader(row) {
      if (!row || !row.length) return false;
      let count = 0;
      row.forEach(function (cell) {
        if (isHeaderWord(cell)) count++;
      });
      return count >= 2;
    }

    // Separate header row(s) from data rows
    let headerRow = null;
    let dataRows = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (isRowAHeader(row)) {
        if (!headerRow) {
          headerRow = row; // First header row establishes column mapping
        }
        // Any header row (including duplicate headers from GViz) is skipped
      } else {
        dataRows.push(row);
      }
    }

    // If no row matched 2+ header words, but row 0 is text, assume row 0 is header
    if (!headerRow && rawRows.length > 1) {
      headerRow = rawRows[0];
      dataRows = rawRows.slice(1);
    }

    const colMap = {
      net: -1,
      user: -1,
      pass: -1,
      price: -1,
      type: -1,
      valid: -1,
      bal: -1,
      status: -1,
      soldDate: -1
    };

    if (headerRow) {
      headerRow.forEach(function (colName, idx) {
        const c = cleanHeader(colName);
        if (colMap.user === -1 && /مستخدم|يوزر|كود|حساب|رقم|كرت|بطاق|user|code|id|login|name/.test(c)) {
          colMap.user = idx;
        } else if (colMap.pass === -1 && /مرور|سر|باسوورد|باسورد|رمز|بين|pass|pwd|pin|secret/.test(c)) {
          colMap.pass = idx;
        } else if (colMap.net === -1 && /شبك|نت|واي|wifi|net|ssid/.test(c)) {
          colMap.net = idx;
        } else if (colMap.price === -1 && /سعر|قيمه|فئه|مبلغ|تكلف|price|cost|rate/.test(c)) {
          colMap.price = idx;
        } else if (colMap.type === -1 && /نوع|باق|باقه|اشتراك|خدم|type|plan|pkg/.test(c)) {
          colMap.type = idx;
        } else if (colMap.valid === -1 && /صلاحي|مد|وقت|valid|dur|time/.test(c)) {
          colMap.valid = idx;
        } else if (colMap.bal === -1 && /رصيد|حجم|بيان|سعه|جيجا|ميغا|ميقا|bal|quota|data|limit/.test(c)) {
          colMap.bal = idx;
        } else if (colMap.status === -1 && /حال|وضع|status|state|sold/.test(c)) {
          colMap.status = idx;
        } else if (colMap.soldDate === -1 && /تاريخ|وقت_بيع|تاريخ_البيع|تاريخ البيع|sold_date|soldat|date/.test(c)) {
          colMap.soldDate = idx;
        }
      });
    }

    // Fallback: If ANY individual column was not found by name, assign it to its default standard position
    if (colMap.net === -1) colMap.net = 0;
    if (colMap.user === -1) colMap.user = 1;
    if (colMap.pass === -1) colMap.pass = 2;
    if (colMap.price === -1) colMap.price = 3;

    if (colMap.type !== -1) {
      if (colMap.valid === -1) colMap.valid = 5;
      if (colMap.bal === -1) colMap.bal = 6;
      if (colMap.status === -1) colMap.status = 7;
    } else {
      if (colMap.valid === -1) colMap.valid = 4;
      if (colMap.bal === -1) colMap.bal = 5;
      if (colMap.status === -1) colMap.status = 6;
    }

    // If soldDate was not identified by name, it is the column right after status ("في العامود الذي يلي الحالة")
    if (colMap.soldDate === -1 && colMap.status !== -1) {
      colMap.soldDate = colMap.status + 1;
    }

    const defaultNet = state.config.networkName || DEFAULT_NET;

    const cards = dataRows.map(function (row, index) {
      const getVal = function (colIndex) {
        return colIndex !== -1 && row[colIndex] !== undefined ? String(row[colIndex]).trim() : '';
      };

      const userVal = getVal(colMap.user);
      const rawStatus = getVal(colMap.status).toLowerCase();
      const rawSoldDate = getVal(colMap.soldDate);

      // Normalize status
      let status = 'متاح';
      if (/مباع|sold|تم البيع|غير متاح|مستخدم|منتهي/.test(rawStatus)) {
        status = 'مباع';
      }

      // Format price: strip non-numeric and trailing dots
      let rawPrice = getVal(colMap.price);
      let numPrice = rawPrice.replace(/[^\d.]/g, '').replace(/\.+$/, '').trim();

      return {
        id: 'card_' + index + '_' + (userVal || Math.random().toString(36).substring(2, 7)),
        net: getVal(colMap.net) || defaultNet,
        user: userVal,
        pass: getVal(colMap.pass),
        price: numPrice || rawPrice,
        rawPrice: rawPrice,
        type: getVal(colMap.type) || 'اشتراك',
        valid: getVal(colMap.valid),
        bal: getVal(colMap.bal),
        status: status,
        soldDate: rawSoldDate || ''
      };
    }).filter(function (card) {
      // Must have at least a username or code
      if (!card.user || !card.user.length) return false;

      // Filter out any row that contains header words as the username or password
      if (isHeaderWord(card.user)) return false;
      if (card.pass && isHeaderWord(card.pass)) return false;

      return true;
    });

    return cards;
  }

  // --- JSONP Loader (Bypasses all CORS restrictions on file:/// and GitHub Pages) ---
  function fetchGVizJSONP(baseUrl, gid, timeoutMs = 12000) {
    return new Promise(function (resolve, reject) {
      const cbName = '__aseel_gviz_cb_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      const script = document.createElement('script');
      let timer = null;

      window[cbName] = function (data) {
        cleanup();
        if (data && data.status === 'error') {
          const errMsg = (data.errors && data.errors[0] && data.errors[0].detailed_message) || 'خطأ في استجابة غوغل شيتس';
          reject(new Error(errMsg));
          return;
        }
        resolve(data);
      };

      function cleanup() {
        if (timer) clearTimeout(timer);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      timer = setTimeout(function () {
        cleanup();
        reject(new Error('انتهت مهلة استجابة غوغل شيتس (Timeout)'));
      }, timeoutMs);

      script.onerror = function () {
        cleanup();
        reject(new Error('تعذر الوصول إلى الشيت (تحقق من أن خيار المشاركة: أي شخص لديه الرابط)'));
      };

      const sep = baseUrl.includes('?') ? '&' : '?';
      let fullUrl = `${baseUrl}${sep}tqx=responseHandler:${cbName}`;
      if (gid && gid !== '0' && !fullUrl.includes('gid=')) {
        fullUrl += `&gid=${gid}`;
      }

      script.src = fullUrl;
      document.head.appendChild(script);
    });
  }

  // --- Extract raw rows from Google Visualization JSON response ---
  function extractRowsFromGVizJSON(data) {
    if (!data || !data.table) return [];
    const cols = data.table.cols || [];
    const rows = data.table.rows || [];
    const rawRows = [];

    // Header row from column labels if provided by Google
    // Header row from column labels if provided by Google
    const colLabels = cols.map(function (c) {
      return c && c.label ? String(c.label).trim() : '';
    });
    const hasMeaningfulLabels = colLabels.some(function (l) {
      return /المستخدم|اسم|الشبكه|السعر|المرور|النوع|الصلاحيه|الرصيد|الحاله|user|pass|price/i.test(l);
    });

    // Process data rows
    const dataRowsFromCells = [];
    rows.forEach(function (r) {
      if (!r || !r.c) return;
      const rowCells = r.c.map(function (cell) {
        if (!cell) return '';
        if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
        if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
        return '';
      });
      if (rowCells.some(function (c) { return c !== ''; })) {
        dataRowsFromCells.push(rowCells);
      }
    });

    // Only prepend colLabels if dataRowsFromCells doesn't already start with a header row
    const firstRowHasHeaders = dataRowsFromCells.length > 0 && dataRowsFromCells[0].some(function (cell) {
      return /المستخدم|اسم|الشبكه|السعر|المرور|النوع|الصلاحيه|الرصيد|الحاله|user|pass|price/i.test(cell);
    });

    if (hasMeaningfulLabels && !firstRowHasHeaders) {
      rawRows.push(colLabels);
    }

    dataRowsFromCells.forEach(function (r) {
      rawRows.push(r);
    });

    return rawRows;
  }

  // --- Fetch Google Sheets Automatically (Multi-Strategy) ---
  async function syncGoogleSheets(showToastOnSuccess = true) {
    if (state.isSyncing) return;

    const sheetInfo = parseSheetUrl(state.config.sheetUrl);
    if (!sheetInfo) {
      updateSyncStatus('offline', 'لم يتم تحديد رابط غوغل شيتس');
      return;
    }

    state.isSyncing = true;
    updateSyncStatus('syncing', 'جارٍ مزامنة الكروت...');
    if (elements.btnRefresh) elements.btnRefresh.classList.add('spinning');

    // Show skeletons if list is empty
    if (!state.cards.length) {
      renderSkeletons();
    }

    let parsedCards = [];
    let fetchError = null;

    // STRATEGY 1: JSONP via Google Visualization (Works on file:///, localhost, and GitHub Pages without CORS blocks)
    if (sheetInfo.id && sheetInfo.id !== 'published' && sheetInfo.id !== 'custom') {
      try {
        const gvizBase = `https://docs.google.com/spreadsheets/d/${sheetInfo.id}/gviz/tq`;
        const gvizData = await fetchGVizJSONP(gvizBase, sheetInfo.gid);
        const rawRows = extractRowsFromGVizJSON(gvizData);
        if (rawRows.length) {
          parsedCards = mapRowsToCards(rawRows);
        }
      } catch (err) {
        console.warn('JSONP Strategy failed, attempting direct fetch...', err);
        fetchError = err.message;
      }
    }

    // STRATEGY 2: Direct Fetch (For published CSV URLs or standard endpoints)
    if (!parsedCards.length) {
      try {
        let fetchUrl = sheetInfo.gvizUrl;
        if (sheetInfo.isPublished || (state.config.sheetUrl && state.config.sheetUrl.includes('/pub'))) {
          fetchUrl = sheetInfo.exportUrl;
        }

        const res = await fetch(fetchUrl, {
          method: 'GET',
          cache: 'no-cache'
        });

        if (res.ok) {
          const text = await res.text();
          if (text.includes('<!DOCTYPE html>') || text.includes('accounts.google.com')) {
            throw new Error('الملف خاص! اضغط مشاركة واجعله "أي شخص لديه الرابط"');
          }
          const rawRows = parseCSV(text);
          parsedCards = mapRowsToCards(rawRows);
          fetchError = null;
        } else {
          throw new Error(`خطأ في استجابة الخادم (${res.status})`);
        }
      } catch (err) {
        console.warn('Direct fetch strategy error:', err);
        if (!fetchError) fetchError = err.message;
      }
    }

    // STRATEGY 3: Export CSV fallback
    if (!parsedCards.length && sheetInfo.exportUrl && sheetInfo.exportUrl !== sheetInfo.gvizUrl) {
      try {
        const res = await fetch(sheetInfo.exportUrl, { method: 'GET', cache: 'no-cache' });
        if (res.ok) {
          const text = await res.text();
          const rawRows = parseCSV(text);
          parsedCards = mapRowsToCards(rawRows);
          fetchError = null;
        }
      } catch (e) { }
    }

    state.isSyncing = false;
    if (elements.btnRefresh) elements.btnRefresh.classList.remove('spinning');

    if (!parsedCards.length) {
      let friendlyMsg = 'تعذر الاتصال بالشيت. تأكد أن خيار المشاركة: "أي شخص لديه الرابط"';
      if (fetchError && fetchError.includes('خاص')) {
        friendlyMsg = 'الملف خاص: تأكد من ضبط الإذن لـ "أي شخص لديه الرابط"';
      }
      updateSyncStatus('error', friendlyMsg);
      if (!state.cards.length) {
        loadCachedCards();
      }
      showToast(friendlyMsg, 'error');
      return;
    }

    state.cards = parsedCards;
    state.lastSyncTime = new Date();
    saveCachedCards(parsedCards);

    updateSyncStatus('connected', `متصل بالشيت (${parsedCards.length} كرت)`);
    if (showToastOnSuccess) {
      showToast(`تم تحديث ${parsedCards.length} كرت بنجاح من غوغل شيتس ✅`, 'success');
    }

    render();
  }

  // --- Demo Cards ---
  function loadDemoCards() {
    const net = state.config.networkName || DEFAULT_NET;
    state.cards = [
      { id: 'c1', net: net, user: 'w7531', pass: '4179', price: '100', rawPrice: '100', valid: '7 أيام', bal: '15 جيجا', status: 'متاح', soldDate: '' },
      { id: 'c2', net: net, user: 'w7532', pass: '8821', price: '100', rawPrice: '100', valid: '7 أيام', bal: '15 جيجا', status: 'متاح', soldDate: '' },
      { id: 'c3', net: net, user: 'k2041', pass: '8890', price: '50', rawPrice: '50', valid: '24 ساعة', bal: '5 جيجا', status: 'متاح', soldDate: '' },
      { id: 'c4', net: net, user: 'k2042', pass: '3312', price: '50', rawPrice: '50', valid: '24 ساعة', bal: '5 جيجا', status: 'متاح', soldDate: '' },
      { id: 'c5', net: net, user: 'm9011', pass: '7741', price: '200', rawPrice: '200', valid: '30 يوم', bal: '50 جيجا', status: 'متاح', soldDate: '' },
      { id: 'c6', net: net, user: 'm9012', pass: '6523', price: '200', rawPrice: '200', valid: '30 يوم', bal: '50 جيجا', status: 'مباع', soldDate: '2026-10-21 14:30' }
    ];
    updateSyncStatus('offline', 'بيانات تجريبية (قم بربط ملف غوغل شيتس)');
    render();
  }

  // --- Auto-Refresh Timer ---
  function setupAutoRefreshTimer() {
    if (state.syncTimer) {
      clearInterval(state.syncTimer);
      state.syncTimer = null;
    }

    if (state.config.autoRefresh && state.config.sheetUrl) {
      const intervalMs = Math.max(1, state.config.refreshIntervalMinutes || 3) * 60 * 1000;
      state.syncTimer = setInterval(function () {
        syncGoogleSheets(false);
      }, intervalMs);
    }
  }

  // Re-sync on page visibility change (when user returns to the tab)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.config.sheetUrl) {
      const now = Date.now();
      const last = state.lastSyncTime ? state.lastSyncTime.getTime() : 0;
      // If last sync was more than 60 seconds ago, sync
      if (now - last > 60000) {
        syncGoogleSheets(false);
      }
    }
  });

  // --- Status & Time Presentation ---
  function updateSyncStatus(type, label) {
    if (!elements.statusBadge || !elements.statusText) return;

    elements.statusBadge.className = 'status-badge status-' + type;
    elements.statusText.textContent = label;

    if (elements.statusSyncTime) {
      if (state.lastSyncTime) {
        const timeStr = state.lastSyncTime.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        elements.statusSyncTime.textContent = `آخر تحديث: ${timeStr}`;
      } else {
        elements.statusSyncTime.textContent = '';
      }
    }
  }

  // --- Filtering & Computed Data ---
  function getEffectiveStatus(card) {
    // If local override exists, respect it, otherwise card status
    if (state.soldOverrides[card.user] !== undefined) {
      return state.soldOverrides[card.user] ? 'مباع' : 'متاح';
    }
    return card.status || 'متاح';
  }

  function getEffectiveSoldDate(card) {
    if (getEffectiveStatus(card) !== 'مباع') return '';
    if (state.soldDates[card.user] !== undefined) {
      return state.soldDates[card.user];
    }
    return card.soldDate || '';
  }

  function getFilteredCards() {
    const q = state.searchQuery.toLowerCase().trim();
    const cat = state.activeCategory;
    const filter = state.statusFilter;

    return state.cards.filter(function (card) {
      const effStatus = getEffectiveStatus(card);

      // Status filter
      if (filter === 'available' && effStatus === 'مباع') return false;
      if (filter === 'sold' && effStatus !== 'مباع') return false;

      // Category filter (Price)
      if (cat) {
        const cardP = (card.price && String(card.price).trim()) ? String(card.price).trim() : '';
        if (cat === 'أخرى') {
          if (cardP && cardP !== 'أخرى') return false;
        } else {
          if (cardP !== cat) return false;
        }
      }

      // Search query
      if (q) {
        const match =
          (card.user && card.user.toLowerCase().includes(q)) ||
          (card.pass && card.pass.toLowerCase().includes(q)) ||
          (card.price && String(card.price).toLowerCase().includes(q)) ||
          (card.valid && card.valid.toLowerCase().includes(q)) ||
          (card.bal && card.bal.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }

  // --- Rendering UI ---
  function render() {
    renderStatistics();
    renderChips();
    renderCards();
  }

  function renderStatistics() {
    const total = state.cards.length;
    let available = 0;
    let sold = 0;

    state.cards.forEach(function (c) {
      if (getEffectiveStatus(c) === 'مباع') {
        sold++;
      } else {
        available++;
      }
    });

    if (elements.totalCardsCount) elements.totalCardsCount.textContent = total;
    if (elements.availableCardsCount) elements.availableCardsCount.textContent = available;
    if (elements.soldCardsCount) elements.soldCardsCount.textContent = sold;
  }

  function renderChips() {
    if (!elements.chipsContainer) return;

    // Extract unique prices and count available cards for each
    const priceCounts = {};
    let totalAvailable = 0;

    state.cards.forEach(function (c) {
      const effStatus = getEffectiveStatus(c);
      if (state.statusFilter === 'sold') {
        if (effStatus !== 'مباع') return;
      } else if (state.statusFilter === 'available') {
        if (effStatus === 'مباع') return;
      }

      totalAvailable++;
      const p = (c.price && String(c.price).trim()) ? String(c.price).trim() : 'أخرى';
      priceCounts[p] = (priceCounts[p] || 0) + 1;
    });

    const prices = Object.keys(priceCounts).sort(function (a, b) {
      if (a === 'أخرى') return 1;
      if (b === 'أخرى') return -1;
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    const savedScrollLeft = elements.chipsContainer.scrollLeft;
    elements.chipsContainer.innerHTML = '';

    // "الكل" Chip
    const allChip = document.createElement('button');
    allChip.className = 'chip-btn' + (state.activeCategory === '' ? ' active' : '');
    allChip.innerHTML = `<span>الكل</span> <span class="chip-count">${totalAvailable}</span>`;
    allChip.onclick = function () {
      state.activeCategory = '';
      state.page = 1;
      render();
    };
    elements.chipsContainer.appendChild(allChip);

    // Dynamic price chips
    prices.forEach(function (p) {
      const chip = document.createElement('button');
      chip.className = 'chip-btn' + (state.activeCategory === p ? ' active' : '');
      const count = priceCounts[p] || 0;
      let label = p;
      if (p !== 'أخرى') {
        label = isNaN(parseFloat(p)) ? p : `${p} ${state.config.currency || 'ل.س'}`;
      }
      chip.innerHTML = `<span>${label}</span> <span class="chip-count">${count}</span>`;
      chip.onclick = function () {
        state.activeCategory = (state.activeCategory === p) ? '' : p;
        state.page = 1;
        render();
      };
      elements.chipsContainer.appendChild(chip);
    });

    // Restore horizontal scroll position
    elements.chipsContainer.scrollLeft = savedScrollLeft;
  }

  function renderCards() {
    if (!elements.cardsList) return;

    const filtered = getFilteredCards();
    state.filteredCards = filtered;

    if (elements.cardsCounterLabel) {
      elements.cardsCounterLabel.textContent = `عرض ${Math.min(filtered.length, state.page * state.pageSize)} من أصل ${filtered.length} بطاقة`;
    }

    if (!filtered.length) {
      elements.cardsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <h3>لم يتم العثور على بطاقات</h3>
          <p>${state.searchQuery ? 'لا توجد نتائج تطابق بحثك. جرّب كلمات بحث أخرى أو تفقد الفئات.' : 'لا توجد بطاقات متاحة في هذا التصنيف حالياً.'}</p>
          ${state.searchQuery ? '<button class="btn btn-secondary" id="btn-reset-search">مسح البحث</button>' : ''}
        </div>
      `;
      const btnReset = document.getElementById('btn-reset-search');
      if (btnReset) {
        btnReset.onclick = function () {
          state.searchQuery = '';
          if (elements.searchQuery) elements.searchQuery.value = '';
          if (elements.searchClearBtn) elements.searchClearBtn.classList.remove('active');
          render();
        };
      }
      if (elements.loadMoreBtn) elements.loadMoreBtn.style.display = 'none';
      return;
    }

    const visibleCards = filtered.slice(0, state.page * state.pageSize);
    elements.cardsList.innerHTML = '';

    const currency = state.config.currency || 'ل.س';

    visibleCards.forEach(function (card) {
      const isSold = getEffectiveStatus(card) === 'مباع';
      const effectiveSoldDate = getEffectiveSoldDate(card);
      const cardEl = document.createElement('div');
      cardEl.className = 'card-item' + (isSold ? ' is-sold' : '');

      const displayPrice = isNaN(parseFloat(card.price)) ? card.price : `${card.price} ${currency}`;

      cardEl.innerHTML = `
        <div class="card-top-bar">
          <div class="card-network-tag">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
            <span>${escapeHTML(card.net || state.config.networkName || DEFAULT_NET)}</span>
          </div>
          <div class="card-price-badge">
            <span>${escapeHTML(displayPrice)}</span>
          </div>
        </div>

        <div class="credentials-box">
          <div class="credential-field">
            <span class="credential-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              اسم المستخدم (الكود)
            </span>
            <div class="credential-value-row">
              <span class="credential-value mono-text">${escapeHTML(card.user)}</span>
              <button class="btn-copy" data-copy="${escapeHTML(card.user)}" title="نسخ اسم المستخدم">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>نسخ</span>
              </button>
            </div>
          </div>

          <div class="credential-field">
            <span class="credential-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              كلمة المرور
            </span>
            <div class="credential-value-row">
              <span class="credential-value mono-text">${escapeHTML(card.pass || 'بدون')}</span>
              ${card.pass ? `
                <button class="btn-copy" data-copy="${escapeHTML(card.pass)}" title="نسخ كلمة المرور">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span>نسخ</span>
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        <div class="card-meta-tags">
          <span class="meta-tag ${isSold ? 'status-sold' : 'status-available'}">
            ${isSold ? '🔴 تم البيع' : '🟢 متاح للبيع'}
          </span>
          ${isSold && effectiveSoldDate ? `
            <span class="meta-tag meta-tag-sold-date" title="تاريخ ووقت تسجيل البيع">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span>بيع: ${escapeHTML(effectiveSoldDate)}</span>
            </span>
          ` : ''}
          ${card.valid ? `<span class="meta-tag">⏳ ${escapeHTML(card.valid)}</span>` : ''}
          ${card.bal ? `<span class="meta-tag">📊 ${escapeHTML(card.bal)}</span>` : ''}
        </div>

        <div class="card-actions">
          <button class="btn btn-primary btn-share" data-card-id="${card.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <span>مشاركة 📤</span>
          </button>

          <button class="btn btn-secondary btn-preview-img" data-card-id="${card.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <span>بطاقة كرت 🖼️</span>
          </button>

          <button class="btn btn-toggle-sold" data-card-user="${escapeHTML(card.user)}">
            ${isSold ? '↩️ إرجاع للمتاح' : '✔️ تم البيع'}
          </button>
        </div>
      `;

      // Copy buttons inside this card
      cardEl.querySelectorAll('.btn-copy').forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          const text = btn.getAttribute('data-copy');
          copyToClipboard(text, btn);
        };
      });

      // Share button
      const shareBtn = cardEl.querySelector('.btn-share');
      if (shareBtn) {
        shareBtn.onclick = function () {
          handleShareCard(card);
        };
      }

      // Preview Image button
      const previewBtn = cardEl.querySelector('.btn-preview-img');
      if (previewBtn) {
        previewBtn.onclick = function () {
          openCardImagePreview(card);
        };
      }

      // Toggle Sold button
      const toggleSoldBtn = cardEl.querySelector('.btn-toggle-sold');
      if (toggleSoldBtn) {
        toggleSoldBtn.onclick = function () {
          toggleCardSoldStatus(card);
        };
      }

      elements.cardsList.appendChild(cardEl);
    });

    // Load more button visibility
    if (elements.loadMoreBtn) {
      if (filtered.length > state.page * state.pageSize) {
        elements.loadMoreBtn.style.display = 'block';
        elements.loadMoreBtn.textContent = `عرض المزيد (${filtered.length - state.page * state.pageSize} متبقية)`;
      } else {
        elements.loadMoreBtn.style.display = 'none';
      }
    }
  }

  function renderSkeletons() {
    if (!elements.cardsList) return;
    let html = '';
    for (let i = 0; i < 3; i++) {
      html += `
        <div class="skeleton-card">
          <div class="skeleton-line" style="width: 40%; height: 24px;"></div>
          <div class="skeleton-line" style="width: 100%; height: 60px; margin: 14px 0;"></div>
          <div class="skeleton-line" style="width: 70%; height: 20px;"></div>
        </div>
      `;
    }
    elements.cardsList.innerHTML = html;
  }

  // Helper: Format Current Date & Time (YYYY-MM-DD HH:mm)
  function getCurrentSaleDateTime() {
    const now = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }

  // --- Sync Card Status & Sale Date Directly to Google Sheets ---
  async function syncCardStatusToSheet(user, status, soldDate) {
    const scriptUrl = state.config.scriptUrl || (window.APP_CONFIG && window.APP_CONFIG.scriptUrl);
    if (!scriptUrl || !scriptUrl.trim()) {
      return;
    }

    try {
      const url = new URL(scriptUrl.trim());
      url.searchParams.set('action', 'updateStatus');
      url.searchParams.set('user', user);
      url.searchParams.set('status', status);
      url.searchParams.set('soldDate', soldDate || '');
      url.searchParams.set('_t', Date.now());

      await fetch(url.toString(), {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      console.log(`[Google Sheets] Updated card ${user}: ${status} (date: ${soldDate})`);
    } catch (err) {
      console.warn('Failed to sync status to Google Sheet:', err);
    }
  }

  // --- Mark Card As Sold (with date in column following status) ---
  async function markCardAsSold(card, triggerSource) {
    const saleDate = getCurrentSaleDateTime();
    state.soldOverrides[card.user] = true;
    state.soldDates[card.user] = saleDate;
    card.status = 'مباع';
    card.soldDate = saleDate;
    saveSoldOverrides();
    saveSoldDates();

    syncCardStatusToSheet(card.user, 'مباع', saleDate);

    const msg = triggerSource === 'share'
      ? `تمت المشاركة واعتبار الكرت ${card.user} "مباع" وتدوين تاريخ البيع (${saleDate}) 📅`
      : `تم تحديد الكرت ${card.user} كـ "مباع" وتدوين تاريخ البيع (${saleDate}) ✔️`;
    showToast(msg, 'success');
    render();
  }

  // --- Mark Card As Available (Delete sale date from sheet and site) ---
  async function markCardAsAvailable(card) {
    state.soldOverrides[card.user] = false;
    delete state.soldDates[card.user];
    card.status = 'متاح';
    card.soldDate = '';
    saveSoldOverrides();
    saveSoldDates();

    syncCardStatusToSheet(card.user, 'متاح', '');

    showToast(`تم إرجاع الكرت ${card.user} إلى "متاح" وحذف تاريخ البيع ↩️`, 'info');
    render();
  }

  // --- Toggle Sold Status ---
  function toggleCardSoldStatus(card) {
    const current = getEffectiveStatus(card);
    if (current === 'مباع') {
      markCardAsAvailable(card);
    } else {
      markCardAsSold(card, 'toggle');
    }
  }

  // --- High-Resolution Canvas Card Drawing Engine ---
  function drawCardCanvas(card, canvas, template) {
    const scale = 2; // Retina 2x scale for ultra crisp text and print
    const W = 800 * scale;
    const H = 500 * scale;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    ctx.save();

    const currentTemplate = template || state.imageTemplate || 'ticket';

    if (currentTemplate === 'ticket') {
      drawTicketCardCanvas(ctx, card, W, H, scale);
    } else if (currentTemplate === 'royal') {
      drawRoyalCardCanvas(ctx, card, W, H, scale);
    } else if (currentTemplate === 'neon') {
      drawNeonCyberCardCanvas(ctx, card, W, H, scale);
    } else if (currentTemplate === 'emerald') {
      drawEmeraldCardCanvas(ctx, card, W, H, scale);
    } else if (currentTemplate === 'crimson') {
      drawCrimsonCardCanvas(ctx, card, W, H, scale);
    } else {
      drawModernCardCanvas(ctx, card, W, H, scale);
    }

    ctx.restore();
  }

  // Template 1: Modern Dark Glass Card (بطاقة عصرية فاخرة)
  function drawModernCardCanvas(ctx, card, W, H, scale) {
    const netTitle = card.net || state.config.networkName || DEFAULT_NET;
    const currency = state.config.currency || 'ل.س';
    const priceText = isNaN(parseFloat(card.price)) ? card.price : `${card.price} ${currency}`;

    // 1. Deep Luxury Gradient Background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0a1329');
    bgGrad.addColorStop(0.5, '#0f1d3d');
    bgGrad.addColorStop(1, '#070c1a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Subtle Security Watermark / Wave Micro-Pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1 * scale;
    for (let x = 0; x < W; x += 30 * scale) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 100 * scale, H);
      ctx.stroke();
    }

    // Radial gold aura in top corner
    const auraGrad = ctx.createRadialGradient(W * 0.85, H * 0.15, 10, W * 0.85, H * 0.15, 250 * scale);
    auraGrad.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
    auraGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(0, 0, W, H);

    // 3. Top Decorative Brand Bar (Gold)
    const barGrad = ctx.createLinearGradient(0, 0, W, 0);
    barGrad.addColorStop(0, '#f59e0b');
    barGrad.addColorStop(0.5, '#fbbf24');
    barGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, 0, W, 12 * scale);

    // 4. Header Section: Network Name + Subtitle
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${44 * scale}px Cairo, Tahoma, Arial`;
    ctx.fillText(netTitle, W - (60 * scale), 80 * scale);

    ctx.fillStyle = '#94a3b8';
    ctx.font = `${20 * scale}px Cairo, Tahoma, Arial`;
    ctx.fillText('بطاقة إنترنت لا سلكي فائقة السرعة', W - (60 * scale), 118 * scale);

    // Price Seal Badge on Top Left
    const badgeW = 200 * scale;
    const badgeH = 65 * scale;
    const badgeX = 50 * scale;
    const badgeY = 55 * scale;

    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2 * scale;
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 14 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#fbbf24';
    ctx.font = `bold ${32 * scale}px Outfit, Cairo, sans-serif`;
    ctx.fillText(priceText, badgeX + badgeW / 2, badgeY + (43 * scale));

    // Separator line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(50 * scale, 150 * scale);
    ctx.lineTo(W - (50 * scale), 150 * scale);
    ctx.stroke();

    // 5. Credentials Container (Monospace Security Card Box)
    const boxX = 50 * scale;
    const boxY = 175 * scale;
    const boxW = W - (100 * scale);
    const boxH = 220 * scale;

    ctx.fillStyle = 'rgba(15, 29, 61, 0.8)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, boxX, boxY, boxW, boxH, 16 * scale);
    ctx.fill();
    ctx.stroke();

    // Dotted inner frame
    ctx.save();
    ctx.setLineDash([8 * scale, 6 * scale]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    roundRect(ctx, boxX + (8 * scale), boxY + (8 * scale), boxW - (16 * scale), boxH - (16 * scale), 10 * scale);
    ctx.stroke();
    ctx.restore();

    // Field Rows
    const rows = [
      { label: 'اسم المستخدم (الكود)', val: card.user, color: '#ffffff' },
      { label: 'كلمة المرور', val: card.pass || 'بدون', color: '#fbbf24' }
    ];

    let rowY = boxY + (60 * scale);
    rows.forEach(function (r) {
      ctx.textAlign = 'right';
      ctx.direction = 'rtl';
      ctx.fillStyle = '#94a3b8';
      ctx.font = `600 ${24 * scale}px Cairo, sans-serif`;
      ctx.fillText(r.label + ' :', boxX + boxW - (35 * scale), rowY);

      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      ctx.fillStyle = r.color;
      ctx.font = `bold ${36 * scale}px JetBrains Mono, Outfit, monospace`;
      ctx.fillText(r.val, boxX + (35 * scale), rowY);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1 * scale;
      ctx.beginPath();
      ctx.moveTo(boxX + (25 * scale), rowY + (30 * scale));
      ctx.lineTo(boxX + boxW - (25 * scale), rowY + (30 * scale));
      ctx.stroke();

      rowY += 80 * scale;
    });

    // 6. Meta Pills inside card (Validity / Quota - NO Type)
    const metaY = boxY + boxH - (25 * scale);
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.font = `500 ${18 * scale}px Cairo, sans-serif`;
    ctx.fillStyle = '#cbd5e1';

    let metaParts = [];
    if (card.valid) metaParts.push('الصلاحية: ' + card.valid);
    if (card.bal) metaParts.push('الرصيد: ' + card.bal);
    const metaString = metaParts.join('  •  ');
    if (metaString) {
      ctx.fillText(metaString, boxX + boxW - (35 * scale), metaY);
    }

    // 7. Footer: Security Notice & Network Slogan
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = `${16 * scale}px Cairo, sans-serif`;
    ctx.fillText(`يرجى الاحتفاظ بالكود لضمان استمرار الخدمة • شكراً لاختياركم ${netTitle}`, W / 2, H - (35 * scale));
  }

  // Template 2: Luxury Wi-Fi Ticket Voucher (قسيمة شحن وتذكرة فاخرة)
  function drawTicketCardCanvas(ctx, card, W, H, scale) {
    const netTitle = card.net || state.config.networkName || DEFAULT_NET;
    const currency = state.config.currency || 'ل.س';
    const priceText = isNaN(parseFloat(card.price)) ? card.price : `${card.price} ${currency}`;

    // 1. Dark Backdrop Outside Ticket
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, W, H);

    // Ticket boundaries
    const pad = 24 * scale;
    const tX = pad;
    const tY = pad;
    const tW = W - (pad * 2);
    const tH = H - (pad * 2);
    const radius = 18 * scale;

    // 2. Ticket Body Gradient
    const tGrad = ctx.createLinearGradient(tX, tY, tX + tW, tY + tH);
    tGrad.addColorStop(0, '#101b33');
    tGrad.addColorStop(0.5, '#0b1426');
    tGrad.addColorStop(1, '#070d1a');
    ctx.fillStyle = tGrad;

    // Outer Ticket Border
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 2 * scale;
    roundRect(ctx, tX, tY, tW, tH, radius);
    ctx.fill();
    ctx.stroke();

    // 3. Security micro-pattern inside ticket
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1 * scale;
    for (let i = tX; i < tX + tW; i += 22 * scale) {
      ctx.beginPath();
      ctx.moveTo(i, tY);
      ctx.lineTo(i + 80 * scale, tY + tH);
      ctx.stroke();
    }

    // 4. Ticket Cutout Notches (Left and Right circular perforations)
    const notchY = tY + (130 * scale);
    const notchRadius = 22 * scale;

    // Left notch cutout
    ctx.save();
    ctx.fillStyle = '#060a14';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
    ctx.lineWidth = 2 * scale;

    ctx.beginPath();
    ctx.arc(tX, notchY, notchRadius, -Math.PI / 2, Math.PI / 2, false);
    ctx.fill();
    ctx.stroke();

    // Right notch cutout
    ctx.beginPath();
    ctx.arc(tX + tW, notchY, notchRadius, Math.PI / 2, -Math.PI / 2, false);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 5. Perforation Tear Line (Dashed across ticket between notches)
    ctx.save();
    ctx.setLineDash([12 * scale, 8 * scale]);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 1.8 * scale;
    ctx.beginPath();
    ctx.moveTo(tX + notchRadius + (6 * scale), notchY);
    ctx.lineTo(tX + tW - notchRadius - (6 * scale), notchY);
    ctx.stroke();
    ctx.restore();

    // ================= HEADER SECTION (Y: tY to notchY) =================
    // Top Gold Trim Ribbon
    const goldGrad = ctx.createLinearGradient(tX, tY, tX + tW, tY);
    goldGrad.addColorStop(0, '#f59e0b');
    goldGrad.addColorStop(0.5, '#fbbf24');
    goldGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(tX + radius, tY, tW - (radius * 2), 6 * scale);

    // Wi-Fi Icon + Network Brand (Right side)
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${40 * scale}px Cairo, Tahoma, Arial`;
    ctx.fillText(`📶 ${netTitle}`, tX + tW - (40 * scale), tY + (60 * scale));

    // Official Voucher Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${17 * scale}px Cairo, Tahoma, Arial`;
    ctx.fillText('قسيمة شحن شبكات رسمية • WI-FI VOUCHER', tX + tW - (40 * scale), tY + (95 * scale));

    // Luxury Price Badge (Left side)
    const pBadgeW = 210 * scale;
    const pBadgeH = 68 * scale;
    const pBadgeX = tX + (40 * scale);
    const pBadgeY = tY + (38 * scale);

    ctx.save();
    ctx.shadowColor = 'rgba(245, 158, 11, 0.35)';
    ctx.shadowBlur = 16 * scale;
    ctx.fillStyle = goldGrad;
    roundRect(ctx, pBadgeX, pBadgeY, pBadgeW, pBadgeH, 12 * scale);
    ctx.fill();
    ctx.restore();

    // Price Text inside Badge
    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#070d19';
    ctx.font = `900 ${34 * scale}px Outfit, Cairo, sans-serif`;
    ctx.fillText(priceText, pBadgeX + pBadgeW / 2, pBadgeY + (46 * scale));

    // ================= MIDDLE VOUCHER BODY =================
    const bodyStartY = notchY + (20 * scale);

    // VOUCHER STAMP BADGE
    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 1 * scale;
    const stampW = 180 * scale;
    const stampH = 26 * scale;
    roundRect(ctx, (W - stampW) / 2, bodyStartY, stampW, stampH, 6 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = `bold ${13 * scale}px JetBrains Mono, sans-serif`;
    ctx.fillText('ACCESS CREDENTIALS', W / 2, bodyStartY + (18 * scale));

    // Two Elegant Credentials Security Boxes
    const boxW = tW - (80 * scale);
    const boxH = 82 * scale;
    const b1X = tX + (40 * scale);
    const b1Y = bodyStartY + (38 * scale);
    const b2Y = b1Y + (95 * scale);

    // Box 1: Username
    ctx.fillStyle = 'rgba(7, 14, 28, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, b1X, b1Y, boxW, boxH, 12 * scale);
    ctx.fill();
    ctx.stroke();

    // Box 1 Label
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${22 * scale}px Cairo, sans-serif`;
    ctx.fillText('👤 كود المستخدم :', b1X + boxW - (25 * scale), b1Y + (50 * scale));

    // Box 1 Value (Monospace Code)
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${38 * scale}px JetBrains Mono, Outfit, monospace`;
    ctx.fillText(card.user, b1X + (25 * scale), b1Y + (53 * scale));

    // Box 2: Password
    ctx.fillStyle = 'rgba(7, 14, 28, 0.9)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, b1X, b2Y, boxW, boxH, 12 * scale);
    ctx.fill();
    ctx.stroke();

    // Box 2 Label
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${22 * scale}px Cairo, sans-serif`;
    ctx.fillText('🔑 كلمة السر :', b1X + boxW - (25 * scale), b2Y + (50 * scale));

    // Box 2 Value (Monospace Code)
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#fbbf24';
    ctx.font = `bold ${38 * scale}px JetBrains Mono, Outfit, monospace`;
    ctx.fillText(card.pass || 'بدون', b1X + (25 * scale), b2Y + (53 * scale));

    // ================= FOOTER / BARCODE SECTION =================
    const footerY = b2Y + boxH + (18 * scale);

    // Realistic Barcode Generator on Left Side
    const bcX = b1X + (10 * scale);
    const bcY = footerY;
    const bcW = 280 * scale;
    const bcH = 40 * scale;

    ctx.fillStyle = '#cbd5e1';
    let curX = bcX;
    const seed = (card.user || 'ASEEL').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 100);
    for (let b = 0; b < 45; b++) {
      const barW = (((seed * (b + 1) * 31) % 4) + 1.2) * scale;
      const spaceW = (((seed * (b + 2) * 17) % 3) + 1.5) * scale;
      if (curX + barW > bcX + bcW) break;
      ctx.fillRect(curX, bcY, barW, bcH);
      curX += barW + spaceW;
    }

    // Barcode Serial Text
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#64748b';
    ctx.font = `bold ${13 * scale}px JetBrains Mono, monospace`;
    ctx.fillText(`SN: ASL-${card.user.toUpperCase()}-OK`, bcX, bcY + bcH + (16 * scale));

    // Metadata Badges (Validity & Quota on Right Side)
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    let metaTags = [];
    if (card.valid) metaTags.push('⏳ ' + card.valid);
    if (card.bal) metaTags.push('📊 ' + card.bal);
    const metaStr = metaTags.join('   •   ');

    if (metaStr) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = `600 ${20 * scale}px Cairo, sans-serif`;
      ctx.fillText(metaStr, b1X + boxW - (10 * scale), footerY + (24 * scale));
    }

    // Network Guarantee / Slogan
    ctx.fillStyle = '#64748b';
    ctx.font = `${14 * scale}px Cairo, sans-serif`;
    ctx.fillText(`صالحة للاستخدام على شبكة ${netTitle} • احتفظ بالقسيمة للضمان`, b1X + boxW - (10 * scale), footerY + (52 * scale));
  }

  // Template 3: Royal VIP Gold Card (البطاقة الملكية الذهبية VIP)
  function drawRoyalCardCanvas(ctx, card, W, H, scale) {
    const netTitle = card.net || state.config.networkName || DEFAULT_NET;
    const currency = state.config.currency || 'ل.س';
    const priceText = isNaN(parseFloat(card.price)) ? card.price : `${card.price} ${currency}`;

    // 1. Carbon-Black Luxury Textured Background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#06070a');
    bgGrad.addColorStop(0.5, '#0f121a');
    bgGrad.addColorStop(1, '#080a0f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle diamond / carbon weave texture
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.035)';
    ctx.lineWidth = 1 * scale;
    for (let x = -H; x < W + H; x += 28 * scale) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + H, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // Radial gold shimmer
    const shimmer = ctx.createRadialGradient(W * 0.5, H * 0.45, 20 * scale, W * 0.5, H * 0.45, 380 * scale);
    shimmer.addColorStop(0, 'rgba(212, 175, 55, 0.12)');
    shimmer.addColorStop(1, 'transparent');
    ctx.fillStyle = shimmer;
    ctx.fillRect(0, 0, W, H);

    // 2. Double Ornate Gold Card Frames
    const pad = 24 * scale;
    const cW = W - (pad * 2);
    const cH = H - (pad * 2);

    // Outer Gold Border
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.7)';
    ctx.lineWidth = 2.5 * scale;
    roundRect(ctx, pad, pad, cW, cH, 20 * scale);
    ctx.stroke();

    // Inner Delicate Gold Border
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.28)';
    ctx.lineWidth = 1 * scale;
    roundRect(ctx, pad + (8 * scale), pad + (8 * scale), cW - (16 * scale), cH - (16 * scale), 14 * scale);
    ctx.stroke();

    // Four Ornate Gold Corner Marks
    const corners = [
      { x: pad + (18 * scale), y: pad + (18 * scale), dx: 1, dy: 1 },
      { x: pad + cW - (18 * scale), y: pad + (18 * scale), dx: -1, dy: 1 },
      { x: pad + (18 * scale), y: pad + cH - (18 * scale), dx: 1, dy: -1 },
      { x: pad + cW - (18 * scale), y: pad + cH - (18 * scale), dx: -1, dy: -1 }
    ];
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2 * scale;
    corners.forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(c.x, c.y + (c.dy * 18 * scale));
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(c.x + (c.dx * 18 * scale), c.y);
      ctx.stroke();
    });

    // 3. Header: Royal Crown + Brand
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${40 * scale}px Cairo, serif`;
    ctx.fillText(`👑 ${netTitle}`, pad + cW - (35 * scale), pad + (55 * scale));

    // Royal Subtitle
    ctx.fillStyle = '#d4af37';
    ctx.font = `600 ${16 * scale}px Cairo, sans-serif`;
    ctx.fillText('عضوية إنترنت مميزة • ROYAL VIP NETWORK PASS', pad + cW - (35 * scale), pad + (88 * scale));

    // Royal Gold Price Ribbon on Left
    const pW = 210 * scale;
    const pH = 62 * scale;
    const pX = pad + (35 * scale);
    const pY = pad + (35 * scale);

    const goldRibbon = ctx.createLinearGradient(pX, pY, pX + pW, pY + pH);
    goldRibbon.addColorStop(0, '#fef08a');
    goldRibbon.addColorStop(0.3, '#f59e0b');
    goldRibbon.addColorStop(0.8, '#b45309');
    goldRibbon.addColorStop(1, '#78350f');

    ctx.save();
    ctx.shadowColor = 'rgba(212, 175, 55, 0.4)';
    ctx.shadowBlur = 14 * scale;
    ctx.fillStyle = goldRibbon;
    roundRect(ctx, pX, pY, pW, pH, 10 * scale);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#1c1303';
    ctx.font = `900 ${32 * scale}px Outfit, Cairo, sans-serif`;
    ctx.fillText(priceText, pX + (pW / 2), pY + (42 * scale));

    // Divider Line
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.moveTo(pad + (35 * scale), pad + (115 * scale));
    ctx.lineTo(pad + cW - (35 * scale), pad + (115 * scale));
    ctx.stroke();

    // 4. Smart Chip & Contactless Waves on Left
    const chipX = pad + (40 * scale);
    const chipY = pad + (145 * scale);
    const chipW = 75 * scale;
    const chipH = 56 * scale;

    const chipGrad = ctx.createLinearGradient(chipX, chipY, chipX + chipW, chipY + chipH);
    chipGrad.addColorStop(0, '#fef08a');
    chipGrad.addColorStop(0.4, '#eab308');
    chipGrad.addColorStop(1, '#a16207');
    ctx.fillStyle = chipGrad;
    roundRect(ctx, chipX, chipY, chipW, chipH, 8 * scale);
    ctx.fill();

    // Chip internal circuit etchings
    ctx.strokeStyle = 'rgba(120, 53, 15, 0.6)';
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    ctx.moveTo(chipX + (25 * scale), chipY);
    ctx.lineTo(chipX + (25 * scale), chipY + chipH);
    ctx.moveTo(chipX + (50 * scale), chipY);
    ctx.lineTo(chipX + (50 * scale), chipY + chipH);
    ctx.moveTo(chipX, chipY + (28 * scale));
    ctx.lineTo(chipX + chipW, chipY + (28 * scale));
    ctx.stroke();

    // Contactless Wi-Fi waves next to chip
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
    ctx.lineWidth = 2 * scale;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(chipX + chipW + (12 * scale), chipY + (28 * scale), r * 10 * scale, -Math.PI / 3, Math.PI / 3, false);
      ctx.stroke();
    }

    // VIP Star Badge
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#fef08a';
    ctx.font = `bold ${16 * scale}px Outfit, sans-serif`;
    ctx.fillText('★ VIP MEMBER', chipX, chipY + chipH + (24 * scale));

    // 5. Embossed Credentials Box on Right
    const credX = chipX + chipW + (65 * scale);
    const credY = pad + (130 * scale);
    const credW = pad + cW - credX - (35 * scale);
    const credH = 195 * scale;

    ctx.fillStyle = 'rgba(10, 14, 23, 0.75)';
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, credX, credY, credW, credH, 14 * scale);
    ctx.fill();
    ctx.stroke();

    // Row 1: VIP Username (كود الدخول)
    const r1Y = credY + (52 * scale);
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#d4af37';
    ctx.font = `600 ${22 * scale}px Cairo, sans-serif`;
    ctx.fillText('كود العضوية (User) :', credX + credW - (25 * scale), r1Y);

    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${38 * scale}px JetBrains Mono, Outfit, monospace`;
    ctx.fillText(card.user, credX + (25 * scale), r1Y + (3 * scale));

    // Inner divider
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.12)';
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.moveTo(credX + (20 * scale), credY + (90 * scale));
    ctx.lineTo(credX + credW - (20 * scale), credY + (90 * scale));
    ctx.stroke();

    // Row 2: VIP Password (الرمز السري)
    const r2Y = credY + (142 * scale);
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#d4af37';
    ctx.font = `600 ${22 * scale}px Cairo, sans-serif`;
    ctx.fillText('الرمز السري (PIN) :', credX + credW - (25 * scale), r2Y);

    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#fef08a';
    ctx.font = `bold ${38 * scale}px JetBrains Mono, Outfit, monospace`;
    ctx.fillText(card.pass || 'بدون', credX + (25 * scale), r2Y + (3 * scale));

    // 6. Footer: Validity & Quota and Royal Notice
    const fY = pad + cH - (42 * scale);

    // Right: Validity & Quota
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    let metaItems = [];
    if (card.valid) metaItems.push('⏳ ' + card.valid);
    if (card.bal) metaItems.push('📊 ' + card.bal);
    const metaStr = metaItems.join('   •   ');

    if (metaStr) {
      ctx.fillStyle = '#fef08a';
      ctx.font = `600 ${18 * scale}px Cairo, sans-serif`;
      ctx.fillText(metaStr, pad + cW - (35 * scale), fY);
    }

    // Left: Royal Notice
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${13 * scale}px Cairo, sans-serif`;
    ctx.fillText(`★ ROYAL PRE-PAID CARD • 24/7 SUPPORT`, pad + (40 * scale), fY);
  }

  // Template 4: Cyberpunk Neon / Ultra Speed (سايبر نيون المستقبلي)
  function drawNeonCyberCardCanvas(ctx, card, W, H, scale) {
    const netTitle = card.net || state.config.networkName || DEFAULT_NET;
    const currency = state.config.currency || 'ل.س';
    const priceText = isNaN(parseFloat(card.price)) ? card.price : `${card.price} ${currency}`;

    // 1. Deep Obsidian Cyber Background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#04060c');
    bgGrad.addColorStop(0.5, '#080c18');
    bgGrad.addColorStop(1, '#030509');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Cyberpunk Dual Glow Radiance (Cyan top-left, Magenta bottom-right)
    const cyanAura = ctx.createRadialGradient(W * 0.15, H * 0.2, 10, W * 0.15, H * 0.2, 350 * scale);
    cyanAura.addColorStop(0, 'rgba(6, 182, 212, 0.22)');
    cyanAura.addColorStop(1, 'transparent');
    ctx.fillStyle = cyanAura;
    ctx.fillRect(0, 0, W, H);

    const magAura = ctx.createRadialGradient(W * 0.85, H * 0.8, 10, W * 0.85, H * 0.8, 350 * scale);
    magAura.addColorStop(0, 'rgba(217, 70, 239, 0.18)');
    magAura.addColorStop(1, 'transparent');
    ctx.fillStyle = magAura;
    ctx.fillRect(0, 0, W, H);

    // Tech HUD horizontal grid lines
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.04)';
    ctx.lineWidth = 1 * scale;
    for (let y = 0; y < H; y += 20 * scale) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // 2. Chamfered Cyber Frame (Cut corners)
    const pad = 24 * scale;
    const cW = W - (pad * 2);
    const cH = H - (pad * 2);
    const cut = 22 * scale;

    ctx.save();
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 12 * scale;
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
    ctx.lineWidth = 2 * scale;

    ctx.beginPath();
    ctx.moveTo(pad + cut, pad);
    ctx.lineTo(pad + cW - cut, pad);
    ctx.lineTo(pad + cW, pad + cut);
    ctx.lineTo(pad + cW, pad + cH - cut);
    ctx.lineTo(pad + cW - cut, pad + cH);
    ctx.lineTo(pad + cut, pad + cH);
    ctx.lineTo(pad, pad + cH - cut);
    ctx.lineTo(pad, pad + cut);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Tech HUD Corner Brackets
    const bracketLen = 18 * scale;
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.5 * scale;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(pad + (10 * scale), pad + (10 * scale) + bracketLen);
    ctx.lineTo(pad + (10 * scale), pad + (10 * scale));
    ctx.lineTo(pad + (10 * scale) + bracketLen, pad + (10 * scale));
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(pad + cW - (10 * scale) - bracketLen, pad + (10 * scale));
    ctx.lineTo(pad + cW - (10 * scale), pad + (10 * scale));
    ctx.lineTo(pad + cW - (10 * scale), pad + (10 * scale) + bracketLen);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(pad + cW - (10 * scale), pad + cH - (10 * scale) - bracketLen);
    ctx.lineTo(pad + cW - (10 * scale), pad + cH - (10 * scale));
    ctx.lineTo(pad + cW - (10 * scale) - bracketLen, pad + cH - (10 * scale));
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(pad + (10 * scale) + bracketLen, pad + cH - (10 * scale));
    ctx.lineTo(pad + (10 * scale), pad + cH - (10 * scale));
    ctx.lineTo(pad + (10 * scale), pad + cH - (10 * scale) - bracketLen);
    ctx.stroke();

    // 3. Header: Cyber Neon Network Name
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${40 * scale}px Cairo, sans-serif`;
    ctx.fillText(`⚡ ${netTitle}`, pad + cW - (40 * scale), pad + (55 * scale));

    // Neon Subtitle
    ctx.fillStyle = '#38bdf8';
    ctx.font = `700 ${16 * scale}px Outfit, Cairo, sans-serif`;
    ctx.fillText('// TURBO 5G SPEED • HIGH PERFORMANCE LINK', pad + cW - (40 * scale), pad + (90 * scale));

    // Price HUD Holographic Box on Left
    const pHudW = 210 * scale;
    const pHudH = 65 * scale;
    const pHudX = pad + (40 * scale);
    const pHudY = pad + (35 * scale);

    ctx.save();
    ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.8 * scale;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 10 * scale;
    roundRect(ctx, pHudX, pHudY, pHudW, pHudH, 8 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#facc15';
    ctx.font = `900 ${32 * scale}px Outfit, JetBrains Mono, sans-serif`;
    ctx.fillText(priceText, pHudX + (pHudW / 2), pHudY + (44 * scale));

    // 4. Signal HUD & Speed Indicator
    const sigX = pad + (40 * scale);
    const sigY = pad + (135 * scale);
    for (let s = 1; s <= 5; s++) {
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(sigX + (s * 10 * scale), sigY + ((5 - s) * 5 * scale), 6 * scale, s * 5 * scale);
    }
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#4ade80';
    ctx.font = `bold ${14 * scale}px JetBrains Mono, monospace`;
    ctx.fillText('SIGNAL: 100% (ULTRA-SPEED)', sigX + (70 * scale), sigY + (20 * scale));

    // 5. Dual Terminal Credential Boxes
    const boxW = cW - (80 * scale);
    const b1X = pad + (40 * scale);
    const b1Y = pad + (175 * scale);
    const bH = 82 * scale;
    const b2Y = b1Y + (95 * scale);

    // Box 1: Cyber User
    ctx.save();
    ctx.fillStyle = 'rgba(8, 14, 26, 0.9)';
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, b1X, b1Y, boxW, bH, 10 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#38bdf8';
    ctx.font = `700 ${22 * scale}px Cairo, JetBrains Mono, monospace`;
    ctx.fillText('>_ كود الدخول (User) :', b1X + boxW - (25 * scale), b1Y + (50 * scale));

    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${38 * scale}px JetBrains Mono, monospace`;
    ctx.fillText(card.user, b1X + (25 * scale), b1Y + (53 * scale));

    // Box 2: Cyber Password
    ctx.save();
    ctx.fillStyle = 'rgba(8, 14, 26, 0.9)';
    ctx.strokeStyle = 'rgba(217, 70, 239, 0.5)';
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, b1X, b2Y, boxW, bH, 10 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#f472b6';
    ctx.font = `700 ${22 * scale}px Cairo, JetBrains Mono, monospace`;
    ctx.fillText('[#] رمز المرور (Pass) :', b1X + boxW - (25 * scale), b2Y + (50 * scale));

    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#facc15';
    ctx.font = `bold ${38 * scale}px JetBrains Mono, monospace`;
    ctx.fillText(card.pass || 'بدون', b1X + (25 * scale), b2Y + (53 * scale));

    // 6. Cyber Footer & Metadata Tags
    const footY = b2Y + bH + (20 * scale);

    // Left: Cyber Hash
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#64748b';
    ctx.font = `bold ${13 * scale}px JetBrains Mono, monospace`;
    ctx.fillText(`SYS.ID//ASL-${card.user.toUpperCase()}-ONLINE`, pad + (40 * scale), footY + (18 * scale));

    // Right: Validity & Quota in Cyan Neon Tags
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    let cyberMeta = [];
    if (card.valid) cyberMeta.push('⏳ ' + card.valid);
    if (card.bal) cyberMeta.push('📊 ' + card.bal);
    const cyberMetaStr = cyberMeta.join('   //   ');

    if (cyberMetaStr) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = `bold ${18 * scale}px JetBrains Mono, Cairo, sans-serif`;
      ctx.fillText(cyberMetaStr, pad + cW - (40 * scale), footY + (18 * scale));
    }
  }

  // Template 5: Emerald Crystal Glass (زمردي كريستال الألياف الضوئية)
  function drawEmeraldCardCanvas(ctx, card, W, H, scale) {
    const netTitle = card.net || state.config.networkName || DEFAULT_NET;
    const currency = state.config.currency || 'ل.س';
    const priceText = isNaN(parseFloat(card.price)) ? card.price : `${card.price} ${currency}`;

    // 1. Deep Jewel Emerald Background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#011c15');
    bgGrad.addColorStop(0.5, '#043427');
    bgGrad.addColorStop(1, '#011711');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Ambient Jewel Radiance
    const aura1 = ctx.createRadialGradient(W * 0.85, H * 0.15, 10, W * 0.85, H * 0.15, 320 * scale);
    aura1.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
    aura1.addColorStop(1, 'transparent');
    ctx.fillStyle = aura1;
    ctx.fillRect(0, 0, W, H);

    const aura2 = ctx.createRadialGradient(W * 0.15, H * 0.85, 10, W * 0.15, H * 0.85, 300 * scale);
    aura2.addColorStop(0, 'rgba(52, 211, 153, 0.18)');
    aura2.addColorStop(1, 'transparent');
    ctx.fillStyle = aura2;
    ctx.fillRect(0, 0, W, H);

    // Subtle Hexagonal / Diamond Weave Pattern
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.04)';
    ctx.lineWidth = 1 * scale;
    for (let x = -H; x < W + H; x += 32 * scale) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + H, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // 2. Double Crystal Border & Corner Diamond Facets
    const pad = 24 * scale;
    const cW = W - (pad * 2);
    const cH = H - (pad * 2);

    ctx.save();
    ctx.shadowColor = 'rgba(16, 185, 129, 0.35)';
    ctx.shadowBlur = 14 * scale;
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.7)';
    ctx.lineWidth = 2.5 * scale;
    roundRect(ctx, pad, pad, cW, cH, 20 * scale);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(167, 243, 208, 0.2)';
    ctx.lineWidth = 1 * scale;
    roundRect(ctx, pad + (8 * scale), pad + (8 * scale), cW - (16 * scale), cH - (16 * scale), 14 * scale);
    ctx.stroke();

    // Four Diamond Facet Corner Accents
    const diamondCorners = [
      { x: pad + (20 * scale), y: pad + (20 * scale) },
      { x: pad + cW - (20 * scale), y: pad + (20 * scale) },
      { x: pad + (20 * scale), y: pad + cH - (20 * scale) },
      { x: pad + cW - (20 * scale), y: pad + cH - (20 * scale) }
    ];
    ctx.fillStyle = '#34d399';
    diamondCorners.forEach(function (d) {
      const s = 5 * scale;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - s);
      ctx.lineTo(d.x + s, d.y);
      ctx.lineTo(d.x, d.y + s);
      ctx.lineTo(d.x - s, d.y);
      ctx.closePath();
      ctx.fill();
    });

    // 3. Header: Emerald Brand & Subtitle
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${40 * scale}px Cairo, sans-serif`;
    ctx.fillText(`💎 ${netTitle}`, pad + cW - (35 * scale), pad + (55 * scale));

    ctx.fillStyle = '#a7f3d0';
    ctx.font = `600 ${16 * scale}px Cairo, sans-serif`;
    ctx.fillText('شبكة ألياف ضوئية فائقة السرعة • ULTRA FIBER NETWORK', pad + cW - (35 * scale), pad + (88 * scale));

    // Price Badge on Left (Faceted Emerald Pill)
    const pW = 210 * scale;
    const pH = 62 * scale;
    const pX = pad + (35 * scale);
    const pY = pad + (35 * scale);

    const emGrad = ctx.createLinearGradient(pX, pY, pX + pW, pY + pH);
    emGrad.addColorStop(0, '#34d399');
    emGrad.addColorStop(0.5, '#10b981');
    emGrad.addColorStop(1, '#059669');

    ctx.save();
    ctx.shadowColor = 'rgba(52, 211, 153, 0.4)';
    ctx.shadowBlur = 14 * scale;
    ctx.fillStyle = emGrad;
    roundRect(ctx, pX, pY, pW, pH, 12 * scale);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#022c22';
    ctx.font = `900 ${32 * scale}px Outfit, Cairo, sans-serif`;
    ctx.fillText(priceText, pX + (pW / 2), pY + (42 * scale));

    // Divider Line
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.2)';
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.moveTo(pad + (35 * scale), pad + (115 * scale));
    ctx.lineTo(pad + cW - (35 * scale), pad + (115 * scale));
    ctx.stroke();

    // Speed Pill Badge
    const pillW = 240 * scale;
    const pillH = 26 * scale;
    const pillX = (W - pillW) / 2;
    const pillY = pad + (128 * scale);

    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.4)';
    ctx.lineWidth = 1 * scale;
    roundRect(ctx, pillX, pillY, pillW, pillH, 8 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#6ee7b7';
    ctx.font = `bold ${13 * scale}px JetBrains Mono, sans-serif`;
    ctx.fillText('⚡ 1000 Mbps • GIGABIT FIBER LINK', W / 2, pillY + (18 * scale));

    // 4. Two Frosted Crystal Credential Containers
    const boxW = cW - (70 * scale);
    const boxH = 82 * scale;
    const b1X = pad + (35 * scale);
    const b1Y = pad + (170 * scale);
    const b2Y = b1Y + (95 * scale);

    // Box 1: User Code
    ctx.fillStyle = 'rgba(2, 44, 34, 0.75)';
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, b1X, b1Y, boxW, boxH, 12 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#a7f3d0';
    ctx.font = `600 ${22 * scale}px Cairo, sans-serif`;
    ctx.fillText('👤 كود المستخدم (User) :', b1X + boxW - (25 * scale), b1Y + (50 * scale));

    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${38 * scale}px JetBrains Mono, Outfit, monospace`;
    ctx.fillText(card.user, b1X + (25 * scale), b1Y + (53 * scale));

    // Box 2: Password
    ctx.fillStyle = 'rgba(2, 44, 34, 0.75)';
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, b1X, b2Y, boxW, boxH, 12 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#a7f3d0';
    ctx.font = `600 ${22 * scale}px Cairo, sans-serif`;
    ctx.fillText('🔒 كلمة المرور (Pass) :', b1X + boxW - (25 * scale), b2Y + (50 * scale));

    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#6ee7b7';
    ctx.font = `bold ${38 * scale}px JetBrains Mono, Outfit, monospace`;
    ctx.fillText(card.pass || 'بدون', b1X + (25 * scale), b2Y + (53 * scale));

    // 5. Footer & Metadata Section
    const footY = b2Y + boxH + (20 * scale);

    // Left: Emerald Verification Hash
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#6ee7b7';
    ctx.font = `bold ${13 * scale}px JetBrains Mono, monospace`;
    ctx.fillText(`EMERALD-SECURE//ASL-${card.user.toUpperCase()}-VERIFIED`, pad + (35 * scale), footY + (18 * scale));

    // Right: Validity & Quota
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    let emMeta = [];
    if (card.valid) emMeta.push('⏳ ' + card.valid);
    if (card.bal) emMeta.push('📊 ' + card.bal);
    const emMetaStr = emMeta.join('   •   ');

    if (emMetaStr) {
      ctx.fillStyle = '#34d399';
      ctx.font = `bold ${18 * scale}px Cairo, sans-serif`;
      ctx.fillText(emMetaStr, pad + cW - (35 * scale), footY + (18 * scale));
    }

    // Slogan line
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4ade80';
    ctx.font = `${13 * scale}px Cairo, sans-serif`;
    ctx.fillText(`استخدام آمن ومشفر بأعلى سرعة نقل بيانات • شكراً لاختياركم ${netTitle}`, W / 2, H - (32 * scale));
  }

  // Template 6: Volcanic Crimson Flame (لهب بركاني فائق السرعة والألعاب)
  function drawCrimsonCardCanvas(ctx, card, W, H, scale) {
    const netTitle = card.net || state.config.networkName || DEFAULT_NET;
    const currency = state.config.currency || 'ل.س';
    const priceText = isNaN(parseFloat(card.price)) ? card.price : `${card.price} ${currency}`;

    // 1. Deep Obsidian Volcanic Background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#140406');
    bgGrad.addColorStop(0.5, '#24070a');
    bgGrad.addColorStop(1, '#0d0204');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Dynamic Fiery Radiance
    const aura1 = ctx.createRadialGradient(W * 0.85, H * 0.15, 10, W * 0.85, H * 0.15, 340 * scale);
    aura1.addColorStop(0, 'rgba(239, 68, 68, 0.26)');
    aura1.addColorStop(1, 'transparent');
    ctx.fillStyle = aura1;
    ctx.fillRect(0, 0, W, H);

    const aura2 = ctx.createRadialGradient(W * 0.15, H * 0.85, 10, W * 0.15, H * 0.85, 300 * scale);
    aura2.addColorStop(0, 'rgba(249, 115, 22, 0.22)');
    aura2.addColorStop(1, 'transparent');
    ctx.fillStyle = aura2;
    ctx.fillRect(0, 0, W, H);

    // Aerodynamic Racing Speed Streaks
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.05)';
    ctx.lineWidth = 2 * scale;
    for (let x = -H; x < W + H; x += 36 * scale) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (H * 0.7), H);
      ctx.stroke();
    }

    // 2. High-Octane Beveled Flame Border
    const pad = 24 * scale;
    const cW = W - (pad * 2);
    const cH = H - (pad * 2);

    const flameBorder = ctx.createLinearGradient(pad, pad, pad + cW, pad + cH);
    flameBorder.addColorStop(0, '#ef4444');
    flameBorder.addColorStop(0.5, '#f97316');
    flameBorder.addColorStop(1, '#dc2626');

    ctx.save();
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 14 * scale;
    ctx.strokeStyle = flameBorder;
    ctx.lineWidth = 2.5 * scale;
    roundRect(ctx, pad, pad, cW, cH, 18 * scale);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(249, 115, 22, 0.25)';
    ctx.lineWidth = 1 * scale;
    roundRect(ctx, pad + (8 * scale), pad + (8 * scale), cW - (16 * scale), cH - (16 * scale), 12 * scale);
    ctx.stroke();

    // 3. Header: Fire Brand & Subtitle
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${40 * scale}px Cairo, sans-serif`;
    ctx.fillText(`🔥 ${netTitle}`, pad + cW - (35 * scale), pad + (55 * scale));

    ctx.fillStyle = '#fdba74';
    ctx.font = `700 ${16 * scale}px Outfit, Cairo, sans-serif`;
    ctx.fillText('اتصال الألعاب والتيربو الفائق • TURBO GAMING LINK', pad + cW - (35 * scale), pad + (88 * scale));

    // Molten Lava Price Badge on Left
    const pW = 210 * scale;
    const pH = 62 * scale;
    const pX = pad + (35 * scale);
    const pY = pad + (35 * scale);

    const flameGrad = ctx.createLinearGradient(pX, pY, pX + pW, pY + pH);
    flameGrad.addColorStop(0, '#f87171');
    flameGrad.addColorStop(0.4, '#ef4444');
    flameGrad.addColorStop(0.8, '#ea580c');
    flameGrad.addColorStop(1, '#c2410c');

    ctx.save();
    ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
    ctx.shadowBlur = 14 * scale;
    ctx.fillStyle = flameGrad;
    roundRect(ctx, pX, pY, pW, pH, 12 * scale);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${32 * scale}px Outfit, Cairo, sans-serif`;
    ctx.fillText(priceText, pX + (pW / 2), pY + (42 * scale));

    // Divider Line
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.22)';
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.moveTo(pad + (35 * scale), pad + (115 * scale));
    ctx.lineTo(pad + cW - (35 * scale), pad + (115 * scale));
    ctx.stroke();

    // Latency Ping Indicator Pill
    const pillW = 260 * scale;
    const pillH = 26 * scale;
    const pillX = (W - pillW) / 2;
    const pillY = pad + (128 * scale);

    ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.45)';
    ctx.lineWidth = 1 * scale;
    roundRect(ctx, pillX, pillY, pillW, pillH, 8 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#fed7aa';
    ctx.font = `bold ${13 * scale}px JetBrains Mono, sans-serif`;
    ctx.fillText('⚡ PING: 12ms • ZERO LATENCY GAMING', W / 2, pillY + (18 * scale));

    // 4. Two Aggressive High-Tech Gaming Credential Boxes
    const boxW = cW - (70 * scale);
    const boxH = 82 * scale;
    const b1X = pad + (35 * scale);
    const b1Y = pad + (170 * scale);
    const b2Y = b1Y + (95 * scale);

    // Box 1: User Code
    ctx.save();
    ctx.fillStyle = 'rgba(20, 5, 8, 0.85)';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, b1X, b1Y, boxW, boxH, 12 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#fca5a5';
    ctx.font = `700 ${22 * scale}px Cairo, JetBrains Mono, monospace`;
    ctx.fillText('🎮 اسم المستخدم (User) :', b1X + boxW - (25 * scale), b1Y + (50 * scale));

    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${38 * scale}px JetBrains Mono, monospace`;
    ctx.fillText(card.user, b1X + (25 * scale), b1Y + (53 * scale));

    // Box 2: Password
    ctx.save();
    ctx.fillStyle = 'rgba(20, 5, 8, 0.85)';
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, b1X, b2Y, boxW, boxH, 12 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#fdba74';
    ctx.font = `700 ${22 * scale}px Cairo, JetBrains Mono, monospace`;
    ctx.fillText('🔑 رمز المرور (Pass) :', b1X + boxW - (25 * scale), b2Y + (50 * scale));

    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#fef08a';
    ctx.font = `bold ${38 * scale}px JetBrains Mono, monospace`;
    ctx.fillText(card.pass || 'بدون', b1X + (25 * scale), b2Y + (53 * scale));

    // 5. Footer & Metadata Section
    const footY = b2Y + boxH + (20 * scale);

    // Left: Turbo Hash
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = '#f87171';
    ctx.font = `bold ${13 * scale}px JetBrains Mono, monospace`;
    ctx.fillText(`TURBO-LINK//ASL-${card.user.toUpperCase()}-ONLINE`, pad + (35 * scale), footY + (18 * scale));

    // Right: Metadata Tags (Validity & Quota)
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    let crMeta = [];
    if (card.valid) crMeta.push('⏳ ' + card.valid);
    if (card.bal) crMeta.push('📊 ' + card.bal);
    const crMetaStr = crMeta.join('   •   ');

    if (crMetaStr) {
      ctx.fillStyle = '#fb923c';
      ctx.font = `bold ${18 * scale}px Cairo, sans-serif`;
      ctx.fillText(crMetaStr, pad + cW - (35 * scale), footY + (18 * scale));
    }

    // Slogan line
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fca5a5';
    ctx.font = `${13 * scale}px Cairo, sans-serif`;
    ctx.fillText(`أعلى أداء وثبات مخصص للتحميل والألعاب • شبكة ${netTitle}`, W / 2, H - (32 * scale));
  }

  // Rounded rectangle helper for Canvas
  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // --- Share & Image Actions ---
  async function handleShareCard(card) {
    if (!elements.renderCanvas) return;

    // Automatically mark card as SOLD and add sale date upon sharing (as requested)
    const isAlreadySold = getEffectiveStatus(card) === 'مباع';
    if (!isAlreadySold) {
      await markCardAsSold(card, 'share');
    }

    drawCardCanvas(card, elements.renderCanvas, state.imageTemplate || 'ticket');

    const netTitle = card.net || state.config.networkName || DEFAULT_NET;
    const priceText = isNaN(parseFloat(card.price)) ? card.price : `${card.price} ${state.config.currency || 'ل.س'}`;
    const shareText = `📶 كرت شبكة ${netTitle}\n👤 اسم المستخدم: ${card.user}\n🔑 كلمة المرور: ${card.pass || 'بدون'}\n💰 الفئة: ${priceText}${card.valid ? '\n⏳ الصلاحية: ' + card.valid : ''}`;

    // Try Web Share API with image file
    elements.renderCanvas.toBlob(async function (blob) {
      if (!blob) {
        openCardImagePreview(card);
        return;
      }

      const file = new File([blob], `card_${card.user}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: `كرت شبكة ${netTitle} - ${card.user}`,
            text: shareText,
            files: [file]
          });
          return;
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.warn('Share file failed, trying text fallback', err);
          } else {
            return; // User canceled share
          }
        }
      }

      // Try text share if file share not supported
      if (navigator.share) {
        try {
          await navigator.share({
            title: `كرت شبكة ${netTitle} - ${card.user}`,
            text: shareText
          });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }

      // Fallback: Open preview modal
      openCardImagePreview(card);
    }, 'image/png');
  }

  function openCardImagePreview(card) {
    if (!elements.renderCanvas || !elements.previewImg || !elements.previewModal) return;
    state.currentPreviewCard = card;

    // Synchronize image template switcher buttons active state
    document.querySelectorAll('.template-btn[data-img-template]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-img-template') === state.imageTemplate);
    });

    drawCardCanvas(card, elements.renderCanvas, state.imageTemplate || 'ticket');
    const dataUrl = elements.renderCanvas.toDataURL('image/png');
    elements.previewImg.src = dataUrl;

    elements.previewModal.classList.add('open');
  }

  function downloadCurrentImage() {
    if (!elements.renderCanvas || !state.currentPreviewCard) return;
    const link = document.createElement('a');
    link.download = `card_${state.currentPreviewCard.user}_${state.currentPreviewCard.price}.png`;
    link.href = elements.renderCanvas.toDataURL('image/png');
    link.click();
    showToast('تم بدء تحميل صورة الكرت بنجاح 📥', 'success');
  }

  // --- Copy to Clipboard with Visual Feedback ---
  async function copyToClipboard(text, buttonElement) {
    if (!text) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      if (buttonElement) {
        buttonElement.classList.add('copied');
        const origHtml = buttonElement.innerHTML;
        buttonElement.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>تم النسخ!</span>
        `;
        setTimeout(function () {
          buttonElement.classList.remove('copied');
          buttonElement.innerHTML = origHtml;
        }, 1600);
      }

      showToast(`تم نسخ "${text}" إلى الحافظة 📋`, 'success');
    } catch (err) {
      console.warn('Copy failed', err);
      showToast('تعذر النسخ تلقائياً، يرجى التحديد والنسخ يدوياً', 'warning');
    }
  }

  // --- Toast Notifications ---
  function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;
    if (type === 'success') {
      icon = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
    } else if (type === 'error') {
      icon = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      `;
    }

    toast.innerHTML = `${icon}<span>${escapeHTML(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3200);
  }

  // --- Theme Toggle ---
  function getPreferredTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_THEME);
      if (saved) return saved;
    } catch (e) { }
    return 'dark'; // Dark luxury is default
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, theme);
    } catch (e) { }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    showToast(`تم تفعيل ${next === 'dark' ? 'الوضع الليلي 🌙' : 'الوضع النهاري ☀️'}`, 'info');
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Search input
    if (elements.searchQuery) {
      elements.searchQuery.addEventListener('input', function (e) {
        state.searchQuery = e.target.value;
        state.page = 1;
        if (elements.searchClearBtn) {
          if (state.searchQuery) {
            elements.searchClearBtn.classList.add('active');
          } else {
            elements.searchClearBtn.classList.remove('active');
          }
        }
        render();
      });
    }

    // Search clear button
    if (elements.searchClearBtn) {
      elements.searchClearBtn.addEventListener('click', function () {
        state.searchQuery = '';
        if (elements.searchQuery) {
          elements.searchQuery.value = '';
          elements.searchQuery.focus();
        }
        elements.searchClearBtn.classList.remove('active');
        state.page = 1;
        render();
      });
    }

    // Status filter tabs (Available, All, Sold)
    document.querySelectorAll('.tab-btn[data-status]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn[data-status]').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        state.statusFilter = btn.getAttribute('data-status');
        state.page = 1;
        render();
      });
    });

    // Image Template Switcher inside Preview Modal
    document.querySelectorAll('.template-btn[data-img-template]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tpl = btn.getAttribute('data-img-template');
        if (!tpl || tpl === state.imageTemplate) return;
        state.imageTemplate = tpl;
        try {
          localStorage.setItem(STORAGE_KEY_IMG_TEMPLATE, tpl);
        } catch (e) { }
        document.querySelectorAll('.template-btn[data-img-template]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-img-template') === tpl);
        });
        if (state.currentPreviewCard && elements.renderCanvas && elements.previewImg) {
          drawCardCanvas(state.currentPreviewCard, elements.renderCanvas, state.imageTemplate);
          elements.previewImg.src = elements.renderCanvas.toDataURL('image/png');
        }
      });
    });

    // Load More button
    if (elements.loadMoreBtn) {
      elements.loadMoreBtn.addEventListener('click', function () {
        state.page++;
        render();
      });
    }

    // Dynamic Cursor Spotlight on Cards (Linear / Vercel style)
    if (elements.cardsList) {
      elements.cardsList.addEventListener('mousemove', function (e) {
        const card = e.target.closest('.card-item');
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
      }, { passive: true });
    }

    // Header buttons
    if (elements.btnRefresh) {
      elements.btnRefresh.addEventListener('click', function () {
        syncGoogleSheets(true);
      });
    }

    if (elements.btnTheme) {
      elements.btnTheme.addEventListener('click', toggleTheme);
    }

    if (elements.statusBadge) {
      elements.statusBadge.addEventListener('click', function () {
        openSettingsModal();
      });
    }

    if (elements.btnSettings) {
      elements.btnSettings.addEventListener('click', openSettingsModal);
    }

    // Modals Close buttons
    document.querySelectorAll('.modal-close-btn, .modal-close-trigger').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeAllModals();
      });
    });

    // Close modal on click outside content
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          closeAllModals();
        }
      });
    });

    // Preview Image Actions
    if (elements.btnDownloadPreview) {
      elements.btnDownloadPreview.addEventListener('click', downloadCurrentImage);
    }
    if (elements.btnSharePreview) {
      elements.btnSharePreview.addEventListener('click', function () {
        if (state.currentPreviewCard) {
          handleShareCard(state.currentPreviewCard);
        }
      });
    }

    // Settings Modal Save & Test
    if (elements.btnSaveSettings) {
      elements.btnSaveSettings.addEventListener('click', saveSettingsFromModal);
    }

    if (elements.btnTestSheet) {
      elements.btnTestSheet.addEventListener('click', testSheetConnection);
    }

    // Copy template sheet button
    const btnCopyTemplate = document.getElementById('btn-copy-template');
    if (btnCopyTemplate) {
      btnCopyTemplate.addEventListener('click', function () {
        // Link to make a copy of ready-to-use template
        const templateCopyUrl = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/copy';
        window.open(templateCopyUrl, '_blank');
      });
    }

    // Demo sheet button
    const btnUseDemo = document.getElementById('btn-use-demo');
    if (btnUseDemo) {
      btnUseDemo.addEventListener('click', function () {
        loadDemoCards();
        closeAllModals();
        showToast('تم تحميل بيانات تجريبية بنجاح', 'info');
      });
    }
  }

  // --- Modals Management ---
  function openSettingsModal() {
    if (!elements.settingsModal) return;
    if (elements.inputSheetUrl) elements.inputSheetUrl.value = state.config.sheetUrl || '';
    if (elements.inputScriptUrl) elements.inputScriptUrl.value = state.config.scriptUrl || '';
    if (elements.inputNetworkName) elements.inputNetworkName.value = state.config.networkName || DEFAULT_NET;
    if (elements.selectAutoRefresh) elements.selectAutoRefresh.value = state.config.refreshIntervalMinutes || '3';
    if (elements.testSheetMsg) elements.testSheetMsg.textContent = '';

    elements.settingsModal.classList.add('open');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(function (m) {
      m.classList.remove('open');
    });
  }

  async function testSheetConnection() {
    if (!elements.inputSheetUrl || !elements.testSheetMsg) return;
    const url = elements.inputSheetUrl.value.trim();
    if (!url) {
      elements.testSheetMsg.textContent = '❌ يرجى إدخال رابط الشيت أولاً';
      elements.testSheetMsg.style.color = '#ef4444';
      return;
    }

    elements.testSheetMsg.textContent = '⏳ جاري فحص الرابط والتأكد من الصلاحيات عبر تقنية JSONP الآمنة...';
    elements.testSheetMsg.style.color = '#f59e0b';

    const info = parseSheetUrl(url);
    if (!info) {
      elements.testSheetMsg.textContent = '❌ تعذر التعرف على الرابط. تأكد من نسخ رابط صحيح من غوغل شيتس.';
      elements.testSheetMsg.style.color = '#ef4444';
      return;
    }

    try {
      let cards = [];
      let usedMethod = 'JSONP';

      // 1. Try JSONP (bypasses CORS restrictions on all environments)
      if (info.id && info.id !== 'published' && info.id !== 'custom') {
        try {
          const gvizBase = `https://docs.google.com/spreadsheets/d/${info.id}/gviz/tq`;
          const gvizData = await fetchGVizJSONP(gvizBase, info.gid);
          const rawRows = extractRowsFromGVizJSON(gvizData);
          cards = mapRowsToCards(rawRows);
        } catch (jsonpErr) {
          console.warn('JSONP test failed, trying direct fetch...', jsonpErr);
        }
      }

      // 2. Try fetch fallback
      if (!cards.length) {
        usedMethod = 'Direct Fetch';
        const res = await fetch(info.gvizUrl, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.includes('<!DOCTYPE html>') || text.includes('accounts.google.com')) {
          throw new Error('الملف خاص! اضغط مشاركة واجعله "أي شخص لديه الرابط"');
        }
        const rows = parseCSV(text);
        cards = mapRowsToCards(rows);
      }

      if (cards.length) {
        elements.testSheetMsg.textContent = `✅ ممتاز! تم الاتصال بنجاح وقراءة ${cards.length} بطاقة (${usedMethod}).`;
        elements.testSheetMsg.style.color = '#10b981';
      } else {
        elements.testSheetMsg.textContent = `⚠️ تم الاتصال بالشيت ولكن لم نجد بيانات كروت متطابقة. تأكد من وجود عمود "اسم المستخدم" أو "الكود".`;
        elements.testSheetMsg.style.color = '#f59e0b';
      }
    } catch (err) {
      elements.testSheetMsg.innerHTML = `❌ فشل الاتصال: ${escapeHTML(err.message)}<br><small style="color:var(--text-secondary)">تأكد أن إذن المشاركة مضبوط على "أي شخص لديه الرابط" بصلاحية "عارض".</small>`;
      elements.testSheetMsg.style.color = '#ef4444';
    }
  }

  function saveSettingsFromModal() {
    if (elements.inputSheetUrl) state.config.sheetUrl = elements.inputSheetUrl.value.trim();
    if (elements.inputScriptUrl) state.config.scriptUrl = elements.inputScriptUrl.value.trim();
    if (elements.inputNetworkName) state.config.networkName = elements.inputNetworkName.value.trim() || DEFAULT_NET;
    if (elements.selectAutoRefresh) {
      const val = parseInt(elements.selectAutoRefresh.value, 10);
      state.config.refreshIntervalMinutes = val;
      state.config.autoRefresh = val > 0;
    }

    saveSettings();
    setupAutoRefreshTimer();
    closeAllModals();

    if (state.config.sheetUrl) {
      syncGoogleSheets(true);
    } else {
      render();
    }
  }

  // --- Utilities ---
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Kickstart on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
