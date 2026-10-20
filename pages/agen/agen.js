// pages/agen/agen.js — Controller Terpadu Agen & Reseller ASTAGA
// Tiga Sub-Tab: Ringkasan Agen, Toko Induk (Agen), Reseller Downline

const agenUnifiedState = {
  currentTab: 'ringkasan', // 'ringkasan' | 'induk' | 'reseller' | 'tren'
  currentBrand: 'ASTAGA',  // 'ASTAGA' | 'OKIPAY'
  selectedMonth: null,
  
  // Data Caches
  agenRaw: null,      // cache /api/agen
  resellerRaw: null,  // cache /api/reseller
  trenRaw: null,      // cache /api/agen/tren
  
  // Tab 1: Ringkasan Agen State
  ringkasan: {
    mode: 'bottom', // 'bottom' or 'top'
    cabang: 'ALL',
    search: '',
    filteredRows: []
  },

  // Tab 2: Toko Induk State
  induk: {
    activeStatus: 'semua_aktif',
    cabang: 'ALL',
    search: '',
    page: 1,
    pageSize: 50,
    filteredRows: []
  },

  // Tab 3: Reseller Downline State
  reseller: {
    activeStatus: 'semua_aktif',
    sort: 'daily_desc',
    cabang: 'ALL',
    search: '',
    page: 1,
    pageSize: 50,
    filteredRows: []
  },

  // Tab 4: Tren Trx Agen State
  tren: {
    sco: 'ALL',
    cabang: 'ALL',
    sort: 'diff_asc',
    search: '',
    trendFilter: 'ALL',
    pageLimit: 100,
    filteredRows: []
  }
};
window.agenUnifiedState = agenUnifiedState;

// ── UTILITY FORMATTERS ──
function formatIDR(val) {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return Number(val).toLocaleString('id-ID');
}

function formatDailyRate(val) {
  if (val === undefined || val === null || isNaN(val)) return '0,0';
  return Number(val).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatPct(val) {
  if (val === undefined || val === null || isNaN(val)) return '0%';
  return Number(val).toFixed(1).replace('.', ',') + '%';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── TAB LOADER HELPER ──
function showTabLoader(tabName) {
  if (tabName === 'ringkasan') {
    const tb = document.getElementById('ringkasan-tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 40px; color: var(--text-muted);"><div class="loader">Memuat data ringkasan agen...</div></td></tr>`;
  } else if (tabName === 'induk') {
    const tb = document.getElementById('induk-tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 40px; color: var(--text-muted);"><div class="loader">Memuat data Toko Induk Agen...</div></td></tr>`;
  } else if (tabName === 'reseller') {
    const tb = document.getElementById('reseller-tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 40px; color: var(--text-muted);"><div class="loader">Memuat data Reseller Downline...</div></td></tr>`;
  } else if (tabName === 'tren') {
    const tb = document.getElementById('tren-table-tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="16" class="text-center" style="padding: 40px; color: var(--text-muted);"><div class="loader">Memuat data Tren Trx Agen (1 Tahun)...</div></td></tr>`;
  }
}

// ── BRAND SWITCHER CONTROLLER (ASTAGA / OKIPAY) ──
async function switchAgenBrand(brand) {
  if (!brand) brand = 'ASTAGA';
  if (brand === agenUnifiedState.currentBrand && agenUnifiedState.agenRaw) return;

  agenUnifiedState.currentBrand = brand;

  // Update Brand Switcher Buttons
  const btnAstaga = document.getElementById('brand-btn-astaga');
  const btnOkipay = document.getElementById('brand-btn-okipay');
    const activeBtn = brand === 'ASTAGA' ? btnAstaga : btnOkipay;
    if (brand === 'ASTAGA') {
      btnAstaga.classList.add('active');
      btnOkipay.classList.remove('active');
    } else {
      btnOkipay.classList.add('active');
      btnAstaga.classList.remove('active');
    }
    if (window.triggerBrandSwitchVisual) {
      window.triggerBrandSwitchVisual(brand, activeBtn, "agen-tab-content-wrapper");
    }

  // Update Brand Badge in Header Strip
  const brandBadge = document.getElementById('agen-brand-badge');
  if (brandBadge) {
    brandBadge.textContent = brand;
    if (brand === 'OKIPAY') {
      brandBadge.style.background = '#fef3c7';
      brandBadge.style.color = '#b45309';
      brandBadge.style.borderColor = '#fde68a';
    } else {
      brandBadge.style.background = '#eff6ff';
      brandBadge.style.color = '#2563eb';
      brandBadge.style.borderColor = '#bfdbfe';
    }
  }

  // Sync URL hash
  try {
    const brandParam = brand === 'OKIPAY' ? '&brand=OKIPAY' : '';
    history.replaceState(null, null, '#agen?tab=' + agenUnifiedState.currentTab + brandParam);
  } catch (e) {}

  // Invalidate cache for new brand
  agenUnifiedState.agenRaw = null;
  agenUnifiedState.resellerRaw = null;
  agenUnifiedState.trenRaw = null;
  agenUnifiedState.selectedMonth = null;

  // Reset pagination & filters
  agenUnifiedState.ringkasan.cabang = 'ALL';
  agenUnifiedState.ringkasan.search = '';
  agenUnifiedState.induk.cabang = 'ALL';
  agenUnifiedState.induk.search = '';
  agenUnifiedState.induk.activeStatus = 'semua_aktif';
  agenUnifiedState.induk.page = 1;
  agenUnifiedState.reseller.cabang = 'ALL';
  agenUnifiedState.reseller.search = '';
  agenUnifiedState.reseller.activeStatus = 'semua_aktif';
  agenUnifiedState.reseller.page = 1;
  agenUnifiedState.tren.sco = 'ALL';
  agenUnifiedState.tren.cabang = 'ALL';
  agenUnifiedState.tren.search = '';
  agenUnifiedState.tren.trendFilter = 'ALL';
  agenUnifiedState.tren.pageLimit = 100;

  // Reset search input values
  const rSearch = document.getElementById('ringkasan-search-input');
  if (rSearch) rSearch.value = '';
  const iSearch = document.getElementById('induk-search-input');
  if (iSearch) iSearch.value = '';
  const resSearch = document.getElementById('reseller-search-input');
  if (resSearch) resSearch.value = '';
  const tSearch = document.getElementById('tren-search-input');
  if (tSearch) tSearch.value = '';
  const tClear = document.getElementById('tren-search-clear-btn');
  if (tClear) tClear.style.display = 'none';

  // Show table loaders
  const currentTab = agenUnifiedState.currentTab || 'ringkasan';
  showTabLoader(currentTab);

  // Load and render
  await ensureTabDataLoaded(currentTab);

  if (currentTab === 'ringkasan') {
    applyRingkasanFilters();
  } else if (currentTab === 'induk') {
    renderIndukKPI();
    renderIndukControls();
    applyIndukFilters();
  } else if (currentTab === 'reseller') {
    renderResellerKPI();
    renderResellerControls();
    applyResellerFilters();
  } else if (currentTab === 'tren') {
    renderTrenControls();
    applyTrenFilters();
  }
}
window.switchAgenBrand = switchAgenBrand;

// ── SUB-TAB SWITCHER CONTROLLER ──
async function switchAgenTab(tabName) {
  if (!tabName) tabName = 'ringkasan';
  // Normalisasi alias tab
  if (tabName === 'agen') tabName = 'induk';

  agenUnifiedState.currentTab = tabName;

  // Sinkronisasi URL query string tanpa reload halaman
  try {
    const brandParam = agenUnifiedState.currentBrand === 'OKIPAY' ? '&brand=OKIPAY' : '';
    history.replaceState(null, null, '#agen?tab=' + tabName + brandParam);
  } catch (e) {}

  // Update visual sub-tab buttons
  ['ringkasan', 'induk', 'reseller', 'tren'].forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const sec = document.getElementById(`section-agen-${t}`);
    if (btn) {
      if (t === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    }
    if (sec) {
      sec.style.display = (t === tabName) ? 'flex' : 'none';
    }
  });

  // Update Header Subtitle & Toolbar Visibility
  const subEl = document.getElementById('agen-header-subtitle');
  const periodGroup = document.getElementById('agen-period-control-group');
  const cutoffEl = document.getElementById('agen-cutoff-info');

  if (subEl) {
    if (tabName === 'ringkasan') {
      subEl.textContent = 'Evaluasi run-rate Daily Trx MoM (rata-rata trx/hari) Top & Bottom 10 Toko Induk Agen.';
    } else if (tabName === 'induk') {
      subEl.textContent = 'Agregasi performa toko induk agen, utilisasi reseller downline, dan rasio EWALLET.';
    } else if (tabName === 'reseller') {
      subEl.textContent = 'Tracking keaktifan seluruh customer reseller downline individual berbasis Daily Trx.';
    } else if (tabName === 'tren') {
      subEl.textContent = 'Profil histori & tren Daily Trx 1 tahun terakhir (12 bulan) serta evaluasi pertumbuhan YoY (Year-over-Year).';
    }
  }

  if (tabName === 'tren') {
    if (periodGroup) periodGroup.style.display = 'none';
    if (cutoffEl) cutoffEl.textContent = 'Periode Analisis: 1 Tahun Terakhir (Nov 2025 – Okt 2026 vs Base Okt 2025)';
  } else {
    if (periodGroup) periodGroup.style.display = 'inline-flex';
    if (agenUnifiedState.agenRaw) {
      updateCommonToolbar(agenUnifiedState.agenRaw);
    }
  }

  // Pastikan data yang dibutuhkan oleh tab sudah ter-load
  await ensureTabDataLoaded(tabName);

  // Render konten spesifik tab aktif
  if (tabName === 'ringkasan') {
    applyRingkasanFilters();
  } else if (tabName === 'induk') {
    renderIndukKPI();
    renderIndukControls();
    applyIndukFilters();
  } else if (tabName === 'reseller') {
    renderResellerKPI();
    renderResellerControls();
    applyResellerFilters();
  } else if (tabName === 'tren') {
    renderTrenControls();
    applyTrenFilters();
  }
}
window.switchAgenTab = switchAgenTab;

// ── ENSURE TAB DATA LOADED ON-DEMAND ──
async function ensureTabDataLoaded(tabName) {
  const currentMonth = agenUnifiedState.selectedMonth;

  if (tabName === 'ringkasan' || tabName === 'induk') {
    if (!agenUnifiedState.agenRaw) {
      await fetchAgenData(currentMonth);
    }
  } else if (tabName === 'reseller') {
    if (!agenUnifiedState.resellerRaw) {
      await fetchResellerData(currentMonth);
    }
  } else if (tabName === 'tren') {
    if (!agenUnifiedState.trenRaw) {
      await fetchTrenData();
    }
  }
}

// ── FETCH /API/AGEN ──
async function fetchAgenData(monthCode = null) {
  const brand = agenUnifiedState.currentBrand || 'ASTAGA';
  let url = `/api/agen?brand=${encodeURIComponent(brand)}&year=2026`;
  if (monthCode) {
    url += `&month=${encodeURIComponent(monthCode)}`;
  }

  try {
    const res = await fetch(url + '&t=' + Date.now());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Gagal mengambil data agen');

    agenUnifiedState.agenRaw = json.data;
    if (!agenUnifiedState.selectedMonth) {
      agenUnifiedState.selectedMonth = json.data.selected_month;
    }
    updateCommonToolbar(json.data);
  } catch (err) {
    console.error('Error fetchAgenData:', err);
    const tbodyR = document.getElementById('ringkasan-tbody');
    const tbodyI = document.getElementById('induk-tbody');
    const errMsgR = `<tr><td colspan="9" class="text-center" style="padding: 30px; color: var(--negative);">Terjadi kesalahan: ${err.message}</td></tr>`;
    const errMsgI = `<tr><td colspan="11" class="text-center" style="padding: 30px; color: var(--negative);">Terjadi kesalahan: ${err.message}</td></tr>`;
    if (tbodyR) tbodyR.innerHTML = errMsgR;
    if (tbodyI) tbodyI.innerHTML = errMsgI;
  }
}

// ── FETCH /API/RESELLER ──
async function fetchResellerData(monthCode = null) {
  const brand = agenUnifiedState.currentBrand || 'ASTAGA';
  let url = `/api/reseller?brand=${encodeURIComponent(brand)}&year=2026`;
  if (monthCode) {
    url += `&month=${encodeURIComponent(monthCode)}`;
  }

  try {
    const res = await fetch(url + '&t=' + Date.now());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Gagal mengambil data reseller');

    agenUnifiedState.resellerRaw = json.data;
    if (!agenUnifiedState.selectedMonth) {
      agenUnifiedState.selectedMonth = json.data.selected_month;
    }
    updateCommonToolbar(json.data);
  } catch (err) {
    console.error('Error fetchResellerData:', err);
    const tbodyRes = document.getElementById('reseller-tbody');
    if (tbodyRes) {
      tbodyRes.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 30px; color: var(--negative);">Terjadi kesalahan: ${err.message}</td></tr>`;
    }
  }
}

// ── UPDATE COMMON TOOLBAR (MONTH SELECTOR & CUTOFF BADGE) ──
function updateCommonToolbar(data) {
  if (!data) return;

  // Month selector
  const mSelect = document.getElementById('agen-month-select');
  if (mSelect && data.available_months) {
    mSelect.innerHTML = data.available_months.map(m => {
      const isSel = m === data.selected_month ? 'selected' : '';
      return `<option value="${m}" ${isSel}>${m}</option>`;
    }).join('');
  }

  // Cut-off Info Badge
  const cutoffInfo = document.getElementById('agen-cutoff-info');
  if (cutoffInfo && data.days_curr && data.days_prev) {
    cutoffInfo.innerHTML = `Cut-off: <strong>${data.days_curr} hari</strong> bln ini vs <strong>${data.days_prev} hari</strong> bln lalu`;
  }
}

// ── HANDLER CHANGE PERIODE / BULAN ──
async function onAgenMonthChange(monthCode) {
  if (!monthCode) return;
  agenUnifiedState.selectedMonth = monthCode;
  
  // Reset cache agar data terupdate
  agenUnifiedState.agenRaw = null;
  agenUnifiedState.resellerRaw = null;

  // Reset pagination ke page 1
  agenUnifiedState.induk.page = 1;
  agenUnifiedState.reseller.page = 1;

  // Tampilkan loader pada tabel aktif
  const tab = agenUnifiedState.currentTab;
  showTabLoader(tab);

  await ensureTabDataLoaded(tab);

  if (tab === 'ringkasan') {
    applyRingkasanFilters();
  } else if (tab === 'induk') {
    renderIndukKPI();
    renderIndukControls();
    applyIndukFilters();
  } else if (tab === 'reseller') {
    renderResellerKPI();
    renderResellerControls();
    applyResellerFilters();
  }
}
window.onAgenMonthChange = onAgenMonthChange;

// ── MAIN ENTRY POINT DARI ROUTER APP.JS (LOADAGEN) ──
async function loadAgen() {
  let initialTab = 'ringkasan';
  let initialBrand = 'ASTAGA';
  const hash = window.location.hash || '';
  if (hash.includes('?')) {
    const searchPart = hash.split('?')[1];
    const params = new URLSearchParams(searchPart);
    const tabParam = params.get('tab');
    if (tabParam === 'reseller') {
      initialTab = 'reseller';
    } else if (tabParam === 'induk' || tabParam === 'agen') {
      initialTab = 'induk';
    } else if (tabParam === 'ringkasan') {
      initialTab = 'ringkasan';
    } else if (tabParam === 'tren') {
      initialTab = 'tren';
    }

    const brandParam = (params.get('brand') || '').toUpperCase();
    if (brandParam === 'OKIPAY' || brandParam === 'ASTAGA') {
      initialBrand = brandParam;
    }
  }

  if (initialBrand !== agenUnifiedState.currentBrand) {
    agenUnifiedState.currentBrand = initialBrand;
    const btnAstaga = document.getElementById('brand-btn-astaga');
    const btnOkipay = document.getElementById('brand-btn-okipay');
    if (btnAstaga && btnOkipay) {
      if (initialBrand === 'OKIPAY') {
        btnOkipay.classList.add('active');
        btnAstaga.classList.remove('active');
      } else {
        btnAstaga.classList.add('active');
        btnOkipay.classList.remove('active');
      }
    }
    const brandBadge = document.getElementById('agen-brand-badge');
    if (brandBadge) {
      brandBadge.textContent = initialBrand;
      if (initialBrand === 'OKIPAY') {
        brandBadge.style.background = '#fef3c7';
        brandBadge.style.color = '#b45309';
        brandBadge.style.borderColor = '#fde68a';
      }
    }
  }

  await switchAgenTab(initialTab);
}
window.loadAgen = loadAgen;


// =============================================================================
// TAB 1: RINGKASAN AGEN (TOP / BOTTOM 10 DAILY TRX MoM)
// =============================================================================

function setRingkasanMode(mode) {
  agenUnifiedState.ringkasan.mode = mode;

  const btnBottom = document.getElementById('btn-mode-bottom');
  const btnTop = document.getElementById('btn-mode-top');
  if (mode === 'top') {
    if (btnTop) btnTop.className = 'ringkasan-mode-btn active-top';
    if (btnBottom) btnBottom.className = 'ringkasan-mode-btn';
  } else {
    if (btnBottom) btnBottom.className = 'ringkasan-mode-btn active-bottom';
    if (btnTop) btnTop.className = 'ringkasan-mode-btn';
  }

  applyRingkasanFilters();
}
window.setRingkasanMode = setRingkasanMode;

function applyRingkasanFilters() {
  const data = agenUnifiedState.agenRaw;
  if (!data) return;

  // Update Days Info in Banner
  const daysInfoEl = document.getElementById('ringkasan-agen-days-info');
  if (daysInfoEl && data.days_curr && data.days_prev) {
    daysInfoEl.textContent = `${data.days_curr} hari bln ini vs ${data.days_prev} hari bln lalu (perbandingan adil)`;
  }

  // Populate Cabang Selector (repopulate on brand change)
  const cSelect = document.getElementById('ringkasan-cabang-select');
  if (cSelect && data.all_cabangs) {
    if (cSelect.dataset.brand !== (agenUnifiedState.currentBrand || 'ASTAGA')) {
      if (agenUnifiedState.ringkasan.cabang !== 'ALL' && !data.all_cabangs.includes(agenUnifiedState.ringkasan.cabang)) {
        agenUnifiedState.ringkasan.cabang = 'ALL';
      }
      const cur = agenUnifiedState.ringkasan.cabang;
      let opts = '<option value="ALL">Semua Cabang</option>';
      data.all_cabangs.forEach(c => {
        opts += `<option value="${c}" ${c === cur ? 'selected' : ''}>${c}</option>`;
      });
      cSelect.innerHTML = opts;
      cSelect.dataset.brand = agenUnifiedState.currentBrand || 'ASTAGA';
    }
  }

  if (cSelect && cSelect.value) {
    agenUnifiedState.ringkasan.cabang = cSelect.value;
  }

  const sInput = document.getElementById('ringkasan-search-input');
  if (sInput) {
    agenUnifiedState.ringkasan.search = String(sInput.value).trim().toLowerCase();
  }

  const mode = agenUnifiedState.ringkasan.mode;
  const selCabang = agenUnifiedState.ringkasan.cabang;
  const query = agenUnifiedState.ringkasan.search;

  let candidates = [];
  if (selCabang === 'ALL' && !query) {
    // Gunakan pre-calculated Top/Bottom 10 dari metrics_engine
    candidates = mode === 'top' ? (data.top_growth_10 || []) : (data.bottom_growth_10 || []);
  } else {
    // Filter manual jika cabang / search dipilih
    const pool = [...(data.rows || []), ...(data.churn_rows || [])].filter(r => (r.daily_prev || 0) > 0);
    let filtered = pool;
    if (selCabang !== 'ALL') {
      filtered = filtered.filter(r => (r.cabang || '').toUpperCase() === selCabang.toUpperCase());
    }
    if (query) {
      filtered = filtered.filter(r => {
        const id = (r.agen_id || '').toLowerCase();
        const nm = (r.agen_name || '').toLowerCase();
        const sc = (r.sco || '').toLowerCase();
        return id.includes(query) || nm.includes(query) || sc.includes(query);
      });
    }

    // Sort berdasarkan selisih run-rate harian (Growth Daily)
    filtered.sort((a, b) => {
      const gA = a.growth_daily !== undefined ? a.growth_daily : 0;
      const gB = b.growth_daily !== undefined ? b.growth_daily : 0;
      if (mode === 'top') {
        if (gA !== gB) return gB - gA;
        return (b.growth_daily_pct || 0) - (a.growth_daily_pct || 0);
      } else {
        if (gA !== gB) return gA - gB;
        return (a.growth_daily_pct || 0) - (b.growth_daily_pct || 0);
      }
    });

    candidates = filtered.slice(0, 10);
  }

  agenUnifiedState.ringkasan.filteredRows = candidates;
  renderRingkasanTable();
}
window.applyRingkasanFilters = applyRingkasanFilters;

function clearRingkasanSearch() {
  const sInput = document.getElementById('ringkasan-search-input');
  if (sInput) {
    sInput.value = '';
    sInput.focus();
  }
  applyRingkasanFilters();
}
window.clearRingkasanSearch = clearRingkasanSearch;

function renderRingkasanTable() {
  const tbody = document.getElementById('ringkasan-tbody');
  if (!tbody) return;

  const data = agenUnifiedState.agenRaw;
  const rows = agenUnifiedState.ringkasan.filteredRows || [];
  const mode = agenUnifiedState.ringkasan.mode;

  // Update Table Card Header
  const titleEl = document.getElementById('ringkasan-table-title');
  const iconEl = document.getElementById('ringkasan-title-icon');
  const countBadge = document.getElementById('ringkasan-table-row-count');
  if (titleEl) {
    titleEl.textContent = mode === 'top'
      ? 'Top 10 Toko Induk (Growth Tertinggi Daily Trx)'
      : 'Bottom 10 Toko Induk (Drop Terbesar Daily Trx)';
  }
  if (iconEl) {
    iconEl.innerHTML = mode === 'top'
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #16a34a;"><polyline points="18 15 12 9 6 15"></polyline></svg>'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #dc2626;"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  }
  if (countBadge) {
    countBadge.textContent = `${rows.length} Toko`;
  }

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 30px; color: var(--text-muted);">Tidak ada agen yang cocok dengan filter ringkasan.</td></tr>`;
    return;
  }

  let html = '';
  rows.forEach((r, idx) => {
    const growthPositive = (r.growth_daily || 0) >= 0;
    const isChurn = (r.daily_curr || 0) === 0;

    let statusBadge = '';
    if (mode === 'top') {
      statusBadge = `<span class="pill positive" style="font-weight: 700; background: #dcfce7; color: #15803d; border: 1px solid #86efac; display: inline-flex; align-items: center; gap: 4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg> Top Growth</span>`;
    } else if (isChurn) {
      statusBadge = `<span class="pill negative" style="font-weight: 700;">Drop 100% (Pasif)</span>`;
    } else {
      statusBadge = `<span class="pill" style="background: #fff1f2; color: #be123c; border: 1px solid #fecdd3; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg> Growth Terendah</span>`;
    }

    const growthPill = `
      <span class="pill ${growthPositive ? 'positive' : 'negative'}" style="font-weight: 700; font-size: 11.5px; padding: 3px 8px; ${growthPositive ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;' : 'background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;'}">
        ${growthPositive ? '+' : ''}${formatDailyRate(r.growth_daily)} / hr
      </span>
    `;

    const totalAnak = r.total_reseller || 1;
    const aktifAnak = r.active_reseller || 0;
    const pctAnak = r.pct_active_reseller || 0;
    const barColor = pctAnak >= 50 ? '#10b981' : (pctAnak >= 20 ? '#0284c7' : '#f59e0b');

    const utilizasiHtml = `
      <div style="font-size: 12px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; justify-content: center; gap: 4px;">
        <span>${aktifAnak} / ${totalAnak}</span>
        <span style="font-size: 11px; color: var(--text-muted); font-weight: 500;">(${formatPct(pctAnak)})</span>
      </div>
      <div style="height: 4px; background: #e2e8f0; border-radius: 99px; margin-top: 3px; overflow: hidden; width: 75px; margin-left: auto; margin-right: auto;">
        <div style="height: 100%; width: ${Math.min(pctAnak, 100)}%; background: ${barColor};"></div>
      </div>
    `;

    html += `
      <tr style="cursor: pointer; transition: background 0.15s ease;" onclick="openAgenModal('${escapeHtml(r.agen_id)}')">
        <td class="text-center" style="color: var(--text-muted); font-size: 12px;">${idx + 1}</td>
        <td>
          <strong style="color: var(--text-main); font-size: 13.5px; display: block;">${escapeHtml(r.agen_name || r.agen_id)}</strong>
          <span style="font-size: 11.5px; color: var(--text-muted); font-family: monospace;">${escapeHtml(r.agen_id)}</span>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main); font-size: 13px;">${escapeHtml(r.cabang)}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">SCO: ${escapeHtml(r.sco || '-')}</div>
        </td>
        <td>
          <div style="font-size: 12px; color: var(--text-main); font-weight: 500;">${escapeHtml(r.jadwal || '-')}</div>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px; display: flex; align-items: center; gap: 4px;">
            <span class="badge" style="font-size: 10px; padding: 1px 5px; ${r.type === 'Limit' ? 'background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe;' : (r.type === 'Prima' ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;' : 'background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;')}">${escapeHtml(r.type || 'Non Limit')}</span>
            <span>Rp ${formatIDR(r.limit)}</span>
          </div>
        </td>
        <td class="text-center">
          ${utilizasiHtml}
        </td>
        <td class="text-right">
          <div style="font-size: 14px; font-weight: 800; color: var(--text-main);">${formatDailyRate(r.daily_curr)} / hr</div>
        </td>
        <td class="text-right">
          <div style="font-size: 13.5px; font-weight: 600; color: var(--text-muted);">${formatDailyRate(r.daily_prev)} / hr</div>
        </td>
        <td class="text-center">
          ${growthPill}
        </td>
        <td class="text-right">
          <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">${formatIDR(r.total_trx || 0)} trx</div>
          <div style="font-size: 11px; color: var(--text-muted);">Lalu: ${formatIDR(r.prev_trx || 0)} trx</div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}


// =============================================================================
// TAB 2: TOKO INDUK AGEN (ROLLUP RESELLER)
// =============================================================================

function renderIndukKPI() {
  const data = agenUnifiedState.agenRaw;
  if (!data || !data.kpi) return;

  const k = data.kpi;
  const elReg = document.getElementById('kpi-induk-registered');
  const elAct = document.getElementById('kpi-induk-active');
  const elRate = document.getElementById('kpi-induk-active-rate');
  const elRet = document.getElementById('kpi-induk-retained');
  const elNewAct = document.getElementById('kpi-induk-new-active');
  const elNewRate = document.getElementById('kpi-induk-new-rate');
  const elReac = document.getElementById('kpi-induk-reactivated');
  const elChu = document.getElementById('kpi-induk-churn');
  const elTrx = document.getElementById('kpi-induk-trx');
  const elPew = document.getElementById('kpi-induk-pct-ew');

  if (elReg) elReg.textContent = formatIDR(k.total_registered);
  const regSub = document.getElementById('kpi-induk-registered-sub');
  if (regSub) regSub.textContent = `Master Toko Induk ${agenUnifiedState.currentBrand || 'ASTAGA'}`;
  if (elAct) elAct.textContent = formatIDR(k.active_current);
  if (elRate && k.total_registered > 0) {
    const actRate = ((k.active_current / k.total_registered) * 100).toFixed(1).replace('.', ',');
    elRate.textContent = `${actRate}% dari master`;
  }
  if (elRet) elRet.textContent = formatIDR(k.retained);

  const newActiveVal = k.new_active !== undefined ? k.new_active : 0;
  const newRegVal = k.new_registered !== undefined ? k.new_registered : 0;
  if (elNewAct) elNewAct.textContent = formatIDR(newActiveVal);
  if (elNewRate) {
    const convPct = newRegVal > 0 ? ((newActiveVal / newRegVal) * 100).toFixed(1).replace('.', ',') : '0';
    elNewRate.textContent = `${formatIDR(newActiveVal)} dr ${formatIDR(newRegVal)} reg (${convPct}%)`;
  }

  if (elReac) elReac.textContent = formatIDR(k.reactivated !== undefined ? k.reactivated : (k.new_reactivated || 0));
  if (elChu) elChu.textContent = formatIDR(k.churned);
  if (elTrx) elTrx.textContent = formatIDR(k.total_trx) + ' trx';
  if (elPew) elPew.textContent = `${formatPct(k.avg_pct_ewallet)} EWALLET (${formatIDR(k.total_ewallet)} trx)`;

  // Tab counts
  const countSemua = data.rows ? data.rows.length : 0;
  const countBaru = data.rows ? data.rows.filter(r => r.activity_status === 'Member Baru').length : 0;
  const countReaktivasi = data.rows ? data.rows.filter(r => r.activity_status === 'Reaktivasi').length : 0;
  const countRutin = data.rows ? data.rows.filter(r => r.activity_status === 'Aktif Rutin').length : 0;
  const countChurn = data.churn_rows ? data.churn_rows.length : 0;
  const countEwallet = data.rows ? data.rows.filter(r => (r.pct_ewallet || 0) >= 50).length : 0;

  const elCS = document.getElementById('count-induk-semua-aktif');
  const elCB = document.getElementById('count-induk-baru');
  const elCReac = document.getElementById('count-induk-reaktivasi');
  const elCR = document.getElementById('count-induk-rutin');
  const elCC = document.getElementById('count-induk-churn');
  const elCE = document.getElementById('count-induk-ewallet');

  if (elCS) elCS.textContent = formatIDR(countSemua);
  if (elCB) elCB.textContent = formatIDR(countBaru);
  if (elCReac) elCReac.textContent = formatIDR(countReaktivasi);
  if (elCR) elCR.textContent = formatIDR(countRutin);
  if (elCC) elCC.textContent = formatIDR(countChurn);
  if (elCE) elCE.textContent = formatIDR(countEwallet);
}

function renderIndukControls() {
  const data = agenUnifiedState.agenRaw;
  if (!data) return;

  const cSelect = document.getElementById('induk-cabang-select');
  if (cSelect && data.all_cabangs) {
    if (agenUnifiedState.induk.cabang !== 'ALL' && !data.all_cabangs.includes(agenUnifiedState.induk.cabang)) {
      agenUnifiedState.induk.cabang = 'ALL';
    }
    const currentVal = agenUnifiedState.induk.cabang;
    let opts = '<option value="ALL">Semua Cabang</option>';
    data.all_cabangs.forEach(c => {
      const isSel = c === currentVal ? 'selected' : '';
      opts += `<option value="${c}" ${isSel}>${c}</option>`;
    });
    cSelect.innerHTML = opts;
  }
}

function setIndukStatusTab(statusName, btnElem) {
  agenUnifiedState.induk.activeStatus = statusName;
  agenUnifiedState.induk.page = 1;

  document.querySelectorAll('#induk-status-filter-pills .reseller-tab').forEach(b => {
    b.classList.remove('active');
  });
  if (btnElem) {
    btnElem.classList.add('active');
  }

  applyIndukFilters();
}
window.setIndukStatusTab = setIndukStatusTab;

function applyIndukFilters() {
  const data = agenUnifiedState.agenRaw;
  if (!data) return;

  const cSelect = document.getElementById('induk-cabang-select');
  if (cSelect && cSelect.value) {
    agenUnifiedState.induk.cabang = cSelect.value;
  }

  const sInput = document.getElementById('induk-search-input');
  if (sInput) {
    agenUnifiedState.induk.search = String(sInput.value).trim().toLowerCase();
  }

  let source = [];
  const status = agenUnifiedState.induk.activeStatus;
  if (status === 'churn') {
    source = data.churn_rows || [];
  } else if (status === 'baru') {
    source = (data.rows || []).filter(r => r.activity_status === 'Member Baru');
  } else if (status === 'reaktivasi') {
    source = (data.rows || []).filter(r => r.activity_status === 'Reaktivasi');
  } else if (status === 'rutin') {
    source = (data.rows || []).filter(r => r.activity_status === 'Aktif Rutin');
  } else if (status === 'ewallet_high') {
    source = (data.rows || []).filter(r => (r.pct_ewallet || 0) >= 50);
  } else {
    source = data.rows || [];
  }

  // Filter Cabang
  if (agenUnifiedState.induk.cabang !== 'ALL') {
    const selC = agenUnifiedState.induk.cabang.toUpperCase();
    source = source.filter(r => (r.cabang || '').toUpperCase() === selC);
  }

  // Filter Search
  if (agenUnifiedState.induk.search) {
    const q = agenUnifiedState.induk.search;
    source = source.filter(r => {
      const k = (r.agen_id || '').toLowerCase();
      const n = (r.agen_name || '').toLowerCase();
      const s = (r.sco || '').toLowerCase();
      const c = (r.cabang || '').toLowerCase();
      return k.includes(q) || n.includes(q) || s.includes(q) || c.includes(q);
    });
  }

  agenUnifiedState.induk.filteredRows = source;
  agenUnifiedState.induk.page = 1;

  // Toggle & update label Tombol Batch Survey AI
  const batchBtn = document.getElementById('btn-batch-survey');
  const batchText = document.getElementById('btn-batch-survey-text');
  if (batchBtn) {
    if (status === 'churn') {
      batchBtn.style.display = 'inline-flex';
      if (batchText) {
        batchText.textContent = `Lakukan Survey AI (${source.length})`;
      }
    } else {
      batchBtn.style.display = 'none';
    }
  }

  renderIndukTable();
}
window.applyIndukFilters = applyIndukFilters;

function clearIndukSearch() {
  const sInput = document.getElementById('induk-search-input');
  if (sInput) {
    sInput.value = '';
    sInput.focus();
  }
  applyIndukFilters();
}
window.clearIndukSearch = clearIndukSearch;

function renderIndukTable() {
  const tbody = document.getElementById('induk-tbody');
  const countEl = document.getElementById('induk-table-row-count');
  const pageInfo = document.getElementById('induk-table-page-info');
  const pageNum = document.getElementById('induk-page-current-num');
  const btnPrev = document.getElementById('btn-induk-page-prev');
  const btnNext = document.getElementById('btn-induk-page-next');

  if (!tbody) return;

  const total = agenUnifiedState.induk.filteredRows.length;
  if (countEl) countEl.textContent = `${formatIDR(total)} agen`;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 30px; color: var(--text-muted);">Tidak ada data toko induk agen yang cocok dengan filter.</td></tr>`;
    if (pageInfo) pageInfo.textContent = 'Menampilkan 0 dari 0 data';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const page = agenUnifiedState.induk.page;
  const pageSize = agenUnifiedState.induk.pageSize;
  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageRows = agenUnifiedState.induk.filteredRows.slice(startIdx, endIdx);

  if (pageInfo) {
    pageInfo.textContent = `Menampilkan ${startIdx + 1} - ${endIdx} dari ${formatIDR(total)} data`;
  }
  if (pageNum) pageNum.textContent = page;
  if (btnPrev) btnPrev.disabled = page <= 1;
  if (btnNext) btnNext.disabled = endIdx >= total;

  let html = '';
  pageRows.forEach((r, idx) => {
    const rowNum = startIdx + idx + 1;
    const isChurn = r.activity_status === 'Pasif / Churn';

    // Status Badge
    let statusBadge = '';
    if (isChurn) {
      statusBadge = `<span class="pill negative">Pasif / Churn</span>`;
    } else if (r.activity_status === 'Member Baru') {
      statusBadge = `<span class="pill" style="background: #e0f2fe; color: #0284c7; font-weight: 700; border: 1px solid #bae6fd;">Baru (Trx)</span>`;
    } else if (r.activity_status === 'Reaktivasi') {
      statusBadge = `<span class="pill" style="background: #fef3c7; color: #b45309; font-weight: 600; border: 1px solid #fde68a;">Reaktivasi</span>`;
    } else {
      statusBadge = `<span class="pill positive">Aktif Rutin</span>`;
    }

    // % EWALLET
    const pctEw = r.pct_ewallet || 0;
    let ewBadge = '';
    if (isChurn) {
      ewBadge = `<span style="color: var(--text-muted);">-</span>`;
    } else if (pctEw >= 50) {
      ewBadge = `<span class="pill" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-weight: 700;">${formatPct(pctEw)}</span>`;
    } else {
      ewBadge = `<span class="pill" style="background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; font-weight: 600;">${formatPct(pctEw)}</span>`;
    }

    // Downline utilization
    const totalAnak = r.total_reseller || 1;
    const aktifAnak = r.active_reseller || 0;
    const pctAnak = r.pct_active_reseller || 0;
    const barColor = pctAnak >= 50 ? '#10b981' : (pctAnak >= 20 ? '#0284c7' : '#f59e0b');

    const utilizasiHtml = isChurn ? `<span style="color: var(--text-muted); font-size: 11.5px;">0 / ${totalAnak} (0%)</span>` : `
      <div style="font-size: 12px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; justify-content: center; gap: 4px;">
        <span>${aktifAnak} / ${totalAnak}</span>
        <span style="font-size: 11px; color: var(--text-muted); font-weight: 500;">(${formatPct(pctAnak)})</span>
      </div>
      <div style="height: 4px; background: #e2e8f0; border-radius: 99px; margin-top: 3px; overflow: hidden; width: 75px; margin-left: auto; margin-right: auto;">
        <div style="height: 100%; width: ${Math.min(pctAnak, 100)}%; background: ${barColor};"></div>
      </div>
    `;

    // Mini Product Composition Bars
    const tot = r.total_trx || 0;
    let compBars = '<span style="color: var(--text-muted);">-</span>';
    if (!isChurn && tot > 0) {
      const pEw = ((r.ewallet_trx || 0) / tot) * 100;
      const pTe = ((r.telco_trx || 0) / tot) * 100;
      const pPp = ((r.ppob_trx || 0) / tot) * 100;
      const pPl = ((r.token_trx || 0) / tot) * 100;

      compBars = `
        <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: #e2e8f0; width: 90px;" title="EW: ${formatPct(pEw)} | Telco: ${formatPct(pTe)} | PPOB: ${formatPct(pPp)} | PLN: ${formatPct(pPl)}">
          <div style="width: ${pEw}%; background: #2563eb;"></div>
          <div style="width: ${pTe}%; background: #16a34a;"></div>
          <div style="width: ${pPp}%; background: #ca8a04;"></div>
          <div style="width: ${pPl}%; background: #9333ea;"></div>
        </div>
        <div style="display: flex; gap: 6px; font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">
          <span>EW: ${formatPct(pEw)}</span>
          <span>TL: ${formatPct(pTe)}</span>
        </div>
      `;
    }

    html += `
      <tr style="cursor: pointer; transition: background 0.15s ease;" onclick="openAgenModal('${escapeHtml(r.agen_id)}')">
        <td class="text-center" style="color: var(--text-muted); font-size: 12px;">${rowNum}</td>
        <td>
          <strong style="color: var(--text-main); font-size: 13.5px; display: block;">${escapeHtml(r.agen_name || r.agen_id)}</strong>
          <span style="font-size: 11.5px; color: var(--text-muted); font-family: monospace;">${escapeHtml(r.agen_id)}</span>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main); font-size: 13px;">${escapeHtml(r.cabang)}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">SCO: ${escapeHtml(r.sco)} ${r.tgl_daftar && r.tgl_daftar !== '-' ? `• <span style="font-size: 10.5px;">Reg: ${escapeHtml(r.tgl_daftar.split(' ')[0])}</span>` : ''}</div>
        </td>
        <td>
          <div style="font-size: 12px; color: var(--text-main); font-weight: 500;">${escapeHtml(r.jadwal || '-')}</div>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px; display: flex; align-items: center; gap: 4px;">
            <span class="badge" style="font-size: 10px; padding: 1px 5px; ${r.type === 'Limit' ? 'background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe;' : (r.type === 'Prima' ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;' : 'background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;')}">${escapeHtml(r.type || 'Non Limit')}</span>
            <span>Rp ${formatIDR(r.limit)}</span>
          </div>
        </td>
        <td class="text-center">
          ${utilizasiHtml}
        </td>
        <td class="text-right font-semibold" style="font-size: 14px; color: var(--text-main);">
          ${isChurn ? `<span style="color: var(--text-muted);">0</span> <span style="font-size: 11px; color: var(--text-muted); display: block;">(Bln lalu: ${formatIDR(r.prev_trx)})</span>` : formatIDR(r.total_trx)}
        </td>
        <td class="text-right" style="color: #1e40af; font-weight: 600;">
          ${isChurn ? '-' : formatIDR(r.ewallet_trx)}
        </td>
        <td class="text-right">
          ${ewBadge}
        </td>
        <td>
          ${compBars}
        </td>
        <td class="text-center">
          ${statusBadge}
        </td>
        <td class="text-center" onclick="event.stopPropagation();">
          <button type="button" onclick="openAgenModal('${escapeHtml(r.agen_id)}')" style="background: none; border: 1px solid var(--surface-border); border-radius: 6px; padding: 4px 8px; font-size: 11.5px; font-weight: 600; color: var(--primary); cursor: pointer;">
            Detail
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function prevIndukPage() {
  if (agenUnifiedState.induk.page > 1) {
    agenUnifiedState.induk.page--;
    renderIndukTable();
    const scroller = document.querySelector('#section-agen-induk .table-container');
    if (scroller) scroller.scrollTop = 0;
  }
}
window.prevIndukPage = prevIndukPage;

function nextIndukPage() {
  const total = agenUnifiedState.induk.filteredRows.length;
  if (agenUnifiedState.induk.page * agenUnifiedState.induk.pageSize < total) {
    agenUnifiedState.induk.page++;
    renderIndukTable();
    const scroller = document.querySelector('#section-agen-induk .table-container');
    if (scroller) scroller.scrollTop = 0;
  }
}
window.nextIndukPage = nextIndukPage;


// =============================================================================
// TAB 3: RESELLER DOWNLINE (CUSTOMER LEVEL)
// =============================================================================

function renderResellerKPI() {
  const data = agenUnifiedState.resellerRaw;
  if (!data || !data.kpi) return;

  const k = data.kpi;
  const elReg = document.getElementById('kpi-reseller-registered');
  const elAct = document.getElementById('kpi-reseller-active');
  const elRate = document.getElementById('kpi-reseller-active-rate');
  const elRet = document.getElementById('kpi-reseller-retained');
  const elNewAct = document.getElementById('kpi-reseller-new-active');
  const elNewRate = document.getElementById('kpi-reseller-new-rate');
  const elReac = document.getElementById('kpi-reseller-reactivated');
  const elChu = document.getElementById('kpi-reseller-churn');
  const elTrx = document.getElementById('kpi-reseller-trx');
  const elPew = document.getElementById('kpi-reseller-pct-ew');

  if (elReg) elReg.textContent = formatIDR(k.total_registered);
  const resRegSub = document.getElementById('kpi-reseller-registered-sub');
  if (resRegSub) resRegSub.textContent = `Master Customer ${agenUnifiedState.currentBrand || 'ASTAGA'}`;
  if (elAct) elAct.textContent = formatIDR(k.active_current);
  if (elRate && k.total_registered > 0) {
    const actRate = ((k.active_current / k.total_registered) * 100).toFixed(1).replace('.', ',');
    elRate.textContent = `${actRate}% dari master`;
  }
  if (elRet) elRet.textContent = formatIDR(k.retained);

  const newActiveVal = k.new_active !== undefined ? k.new_active : 0;
  const newRegVal = k.new_registered !== undefined ? k.new_registered : 0;
  if (elNewAct) elNewAct.textContent = formatIDR(newActiveVal);
  if (elNewRate) {
    const convPct = newRegVal > 0 ? ((newActiveVal / newRegVal) * 100).toFixed(1).replace('.', ',') : '0';
    elNewRate.textContent = `${formatIDR(newActiveVal)} dr ${formatIDR(newRegVal)} reg (${convPct}%)`;
  }

  if (elReac) elReac.textContent = formatIDR(k.reactivated !== undefined ? k.reactivated : (k.new_reactivated || 0));
  if (elChu) elChu.textContent = formatIDR(k.churned);
  if (elTrx) {
    const dailyRate = k.daily_rate_total ? formatDailyRate(k.daily_rate_total) : '0,0';
    elTrx.textContent = `${dailyRate} / hr`;
  }
  if (elPew) elPew.textContent = `${formatPct(k.avg_pct_ewallet)} EWALLET (Tot: ${formatIDR(k.total_trx)} trx)`;

  // Tab counts
  const countSemua = data.rows ? data.rows.length : 0;
  const countBaru = data.rows ? data.rows.filter(r => r.activity_status === 'Member Baru').length : 0;
  const countReaktivasi = data.rows ? data.rows.filter(r => r.activity_status === 'Reaktivasi').length : 0;
  const countRutin = data.rows ? data.rows.filter(r => r.activity_status === 'Aktif Rutin').length : 0;
  const countChurn = data.churn_rows ? data.churn_rows.length : 0;
  const countEwallet = data.rows ? data.rows.filter(r => (r.pct_ewallet || 0) >= 50).length : 0;

  const elCS = document.getElementById('count-reseller-semua-aktif');
  const elCB = document.getElementById('count-reseller-baru');
  const elCReac = document.getElementById('count-reseller-reaktivasi');
  const elCR = document.getElementById('count-reseller-rutin');
  const elCC = document.getElementById('count-reseller-churn');
  const elCE = document.getElementById('count-reseller-ewallet');

  if (elCS) elCS.textContent = formatIDR(countSemua);
  if (elCB) elCB.textContent = formatIDR(countBaru);
  if (elCReac) elCReac.textContent = formatIDR(countReaktivasi);
  if (elCR) elCR.textContent = formatIDR(countRutin);
  if (elCC) elCC.textContent = formatIDR(countChurn);
  if (elCE) elCE.textContent = formatIDR(countEwallet);
}

function renderResellerControls() {
  const data = agenUnifiedState.resellerRaw;
  if (!data) return;

  const cSelect = document.getElementById('reseller-cabang-select');
  if (cSelect && data.all_cabangs) {
    if (agenUnifiedState.reseller.cabang !== 'ALL' && !data.all_cabangs.includes(agenUnifiedState.reseller.cabang)) {
      agenUnifiedState.reseller.cabang = 'ALL';
    }
    const currentVal = agenUnifiedState.reseller.cabang;
    let opts = '<option value="ALL">Semua Cabang</option>';
    data.all_cabangs.forEach(c => {
      const isSel = c === currentVal ? 'selected' : '';
      opts += `<option value="${c}" ${isSel}>${c}</option>`;
    });
    cSelect.innerHTML = opts;
  }
}

function setResellerStatusTab(statusName, btnElem) {
  agenUnifiedState.reseller.activeStatus = statusName;
  agenUnifiedState.reseller.page = 1;

  document.querySelectorAll('#reseller-status-filter-pills .reseller-tab').forEach(b => {
    b.classList.remove('active');
  });
  if (btnElem) {
    btnElem.classList.add('active');
  }

  applyResellerFilters();
}
window.setResellerStatusTab = setResellerStatusTab;

function applyResellerFilters() {
  const data = agenUnifiedState.resellerRaw;
  if (!data) return;

  const sSelect = document.getElementById('reseller-sort-select');
  if (sSelect && sSelect.value) {
    agenUnifiedState.reseller.sort = sSelect.value;
  }

  const cSelect = document.getElementById('reseller-cabang-select');
  if (cSelect && cSelect.value) {
    agenUnifiedState.reseller.cabang = cSelect.value;
  }

  const sInput = document.getElementById('reseller-search-input');
  if (sInput) {
    agenUnifiedState.reseller.search = String(sInput.value).trim().toLowerCase();
  }

  let source = [];
  const status = agenUnifiedState.reseller.activeStatus;
  if (status === 'churn') {
    source = data.churn_rows || [];
  } else if (status === 'baru') {
    source = (data.rows || []).filter(r => r.activity_status === 'Member Baru');
  } else if (status === 'reaktivasi') {
    source = (data.rows || []).filter(r => r.activity_status === 'Reaktivasi');
  } else if (status === 'rutin') {
    source = (data.rows || []).filter(r => r.activity_status === 'Aktif Rutin');
  } else if (status === 'ewallet_high') {
    source = (data.rows || []).filter(r => (r.pct_ewallet || 0) >= 50);
  } else {
    source = data.rows || [];
  }

  // Filter Cabang
  if (agenUnifiedState.reseller.cabang !== 'ALL') {
    const selC = agenUnifiedState.reseller.cabang.toUpperCase();
    source = source.filter(r => (r.cabang || '').toUpperCase() === selC);
  }

  // Filter Search
  if (agenUnifiedState.reseller.search) {
    const q = agenUnifiedState.reseller.search;
    source = source.filter(r => {
      const k = (r.kode || '').toLowerCase();
      const n = (r.name || '').toLowerCase();
      const a = (r.agen_name || '').toLowerCase();
      const aid = (r.agen_id || '').toLowerCase();
      const s = (r.sco || '').toLowerCase();
      return k.includes(q) || n.includes(q) || a.includes(q) || aid.includes(q) || s.includes(q);
    });
  }

  // Sorting
  const sortMode = agenUnifiedState.reseller.sort;
  source.sort((a, b) => {
    if (sortMode === 'daily_desc') {
      return (b.daily_curr || 0) - (a.daily_curr || 0);
    } else if (sortMode === 'growth_desc') {
      return (b.growth_daily || 0) - (a.growth_daily || 0);
    } else if (sortMode === 'growth_asc') {
      return (a.growth_daily || 0) - (b.growth_daily || 0);
    } else if (sortMode === 'ewallet_desc') {
      return (b.pct_ewallet || 0) - (a.pct_ewallet || 0);
    } else if (sortMode === 'total_desc') {
      return (b.total_trx || 0) - (a.total_trx || 0);
    }
    return 0;
  });

  agenUnifiedState.reseller.filteredRows = source;
  agenUnifiedState.reseller.page = 1;

  // Toggle & update label Tombol Batch Survey AI Reseller
  const batchBtn = document.getElementById('btn-batch-reseller-survey');
  const batchText = document.getElementById('btn-batch-reseller-survey-text');
  if (batchBtn) {
    if (status === 'churn') {
      batchBtn.style.display = 'inline-flex';
      if (batchText) {
        batchText.textContent = `Lakukan Survey AI (${source.length})`;
      }
    } else {
      batchBtn.style.display = 'none';
    }
  }

  renderResellerTable();
}
window.applyResellerFilters = applyResellerFilters;

function clearResellerSearch() {
  const sInput = document.getElementById('reseller-search-input');
  if (sInput) {
    sInput.value = '';
    sInput.focus();
  }
  applyResellerFilters();
}
window.clearResellerSearch = clearResellerSearch;

function renderResellerTable() {
  const tbody = document.getElementById('reseller-tbody');
  const countEl = document.getElementById('reseller-table-row-count');
  const pageInfo = document.getElementById('reseller-table-page-info');
  const pageNum = document.getElementById('reseller-page-current-num');
  const btnPrev = document.getElementById('btn-reseller-page-prev');
  const btnNext = document.getElementById('btn-reseller-page-next');

  if (!tbody) return;

  const total = agenUnifiedState.reseller.filteredRows.length;
  if (countEl) countEl.textContent = `${formatIDR(total)} reseller`;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 30px; color: var(--text-muted);">Tidak ada data reseller downline yang cocok dengan filter.</td></tr>`;
    if (pageInfo) pageInfo.textContent = 'Menampilkan 0 dari 0 data';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const page = agenUnifiedState.reseller.page;
  const pageSize = agenUnifiedState.reseller.pageSize;
  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageRows = agenUnifiedState.reseller.filteredRows.slice(startIdx, endIdx);

  if (pageInfo) {
    pageInfo.textContent = `Menampilkan ${startIdx + 1} - ${endIdx} dari ${formatIDR(total)} data`;
  }
  if (pageNum) pageNum.textContent = page;
  if (btnPrev) btnPrev.disabled = page <= 1;
  if (btnNext) btnNext.disabled = endIdx >= total;

  let html = '';
  pageRows.forEach((r, idx) => {
    const rowNum = startIdx + idx + 1;
    const isChurn = r.activity_status === 'Pasif / Churn';

    // Status Badge
    let statusBadge = '';
    if (isChurn) {
      statusBadge = `<span class="pill negative">Pasif / Churn</span>`;
    } else if (r.activity_status === 'Member Baru') {
      statusBadge = `<span class="pill" style="background: #e0f2fe; color: #0284c7; font-weight: 700; border: 1px solid #bae6fd;">Member Baru</span>`;
    } else if (r.activity_status === 'Reaktivasi') {
      statusBadge = `<span class="pill" style="background: #fef3c7; color: #b45309; font-weight: 600; border: 1px solid #fde68a;">Reaktivasi</span>`;
    } else {
      statusBadge = `<span class="pill positive">Aktif Rutin</span>`;
    }

    // % EWALLET
    const pctEw = r.pct_ewallet || 0;
    let ewBadge = '';
    if (isChurn) {
      ewBadge = `<span style="color: var(--text-muted);">-</span>`;
    } else if (pctEw >= 50) {
      ewBadge = `<span class="pill" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-weight: 700;">${formatPct(pctEw)}</span>`;
    } else {
      ewBadge = `<span class="pill" style="background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; font-weight: 600;">${formatPct(pctEw)}</span>`;
    }

    // Mini Product Composition Bars
    const tot = r.total_trx || 0;
    let compBars = '<span style="color: var(--text-muted);">-</span>';
    if (!isChurn && tot > 0) {
      const pEw = ((r.ewallet_trx || 0) / tot) * 100;
      const pTe = ((r.telco_trx || 0) / tot) * 100;
      const pPp = ((r.ppob_trx || 0) / tot) * 100;
      const pPl = ((r.token_trx || 0) / tot) * 100;

      compBars = `
        <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: #e2e8f0; width: 90px;" title="EW: ${formatPct(pEw)} | Telco: ${formatPct(pTe)} | PPOB: ${formatPct(pPp)} | PLN: ${formatPct(pPl)}">
          <div style="width: ${pEw}%; background: #2563eb;"></div>
          <div style="width: ${pTe}%; background: #16a34a;"></div>
          <div style="width: ${pPp}%; background: #ca8a04;"></div>
          <div style="width: ${pPl}%; background: #9333ea;"></div>
        </div>
        <div style="display: flex; gap: 6px; font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">
          <span>EW: ${formatPct(pEw)}</span>
          <span>TL: ${formatPct(pTe)}</span>
        </div>
      `;
    }

    html += `
      <tr style="cursor: pointer; transition: background 0.15s ease;" onclick="openResellerModal('${escapeHtml(r.kode)}')">
        <td class="text-center" style="color: var(--text-muted); font-size: 12px;">${rowNum}</td>
        <td>
          <strong style="color: var(--text-main); font-size: 13.5px; display: block;">${escapeHtml(r.name || r.kode)}</strong>
          <span style="font-size: 11.5px; color: var(--text-muted); font-family: monospace;">${escapeHtml(r.kode)}</span>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main); font-size: 13px;">${escapeHtml(r.agen_name || r.agen_id || '-')}</div>
          <span style="font-size: 11.5px; color: var(--text-muted); font-family: monospace;">${escapeHtml(r.agen_id || '-')}</span>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main); font-size: 13px;">${escapeHtml(r.cabang)}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">SCO: ${escapeHtml(r.sco)}</div>
        </td>
        <td class="text-right font-semibold" style="font-size: 14px; color: var(--text-main);">
          ${isChurn ? `<span style="color: var(--text-muted);">0</span> <span style="font-size: 11px; color: var(--text-muted); display: block;">(Bln lalu: ${formatIDR(r.prev_trx)})</span>` : `
            <div>${formatIDR(r.total_trx)}</div>
            <div style="font-size: 11px; color: #2563eb; font-weight: 600;">${formatDailyRate(r.daily_curr)} / hr</div>
          `}
        </td>
        <td class="text-right" style="color: #1e40af; font-weight: 600;">
          ${isChurn ? '-' : formatIDR(r.ewallet_trx)}
        </td>
        <td class="text-right">
          ${ewBadge}
        </td>
        <td>
          ${compBars}
        </td>
        <td class="text-center">
          ${statusBadge}
        </td>
        <td class="text-center" onclick="event.stopPropagation();">
          <div style="display: flex; gap: 4px; justify-content: center; align-items: center;">
            ${(isChurn || r.activity_status === 'Pasif / Churn' || agenUnifiedState.reseller.activeStatus === 'churn') ? `
              <button type="button" onclick="openSurveyModal('${escapeHtml(r.kode)}', '${escapeHtml(r.name || r.kode)}', '${escapeHtml(r.cabang || '-')}', '${escapeHtml(r.sco || '-')}', ${r.prev_trx || 0})"
                style="background: #eef2ff; border: 1px solid #c7d2fe; color: #4338ca; border-radius: 6px; padding: 4px 8px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"
                title="Kirim Survey Interaktif AI via WhatsApp ke Reseller ini">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Survey
              </button>
            ` : ''}
            <button type="button" onclick="openResellerModal('${escapeHtml(r.kode)}')" style="background: none; border: 1px solid var(--surface-border); border-radius: 6px; padding: 4px 8px; font-size: 11.5px; font-weight: 600; color: var(--primary); cursor: pointer;">
              Detail
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function prevResellerPage() {
  if (agenUnifiedState.reseller.page > 1) {
    agenUnifiedState.reseller.page--;
    renderResellerTable();
    const scroller = document.querySelector('#section-agen-reseller .table-container');
    if (scroller) scroller.scrollTop = 0;
  }
}
window.prevResellerPage = prevResellerPage;

function nextResellerPage() {
  const total = agenUnifiedState.reseller.filteredRows.length;
  if (agenUnifiedState.reseller.page * agenUnifiedState.reseller.pageSize < total) {
    agenUnifiedState.reseller.page++;
    renderResellerTable();
    const scroller = document.querySelector('#section-agen-reseller .table-container');
    if (scroller) scroller.scrollTop = 0;
  }
}
window.nextResellerPage = nextResellerPage;


// =============================================================================
// MODALS (TOKO INDUK AGEN & RESELLER DOWNLINE)
// =============================================================================

function openAgenModal(agenId) {
  const data = agenUnifiedState.agenRaw;
  if (!data) return;

  const item = [...(data.rows || []), ...(data.churn_rows || [])].find(x => x.agen_id === agenId);
  if (!item) return;

  const modal = document.getElementById('agen-modal');
  if (!modal) return;

  // Header info
  document.getElementById('modal-agen-name').textContent = item.agen_name || item.agen_id;
  document.getElementById('modal-agen-id').textContent = item.agen_id;
  document.getElementById('modal-agen-cabang').textContent = item.cabang || '-';
  document.getElementById('modal-agen-sco').textContent = `SCO: ${item.sco || '-'}`;
  document.getElementById('modal-agen-tipe').textContent = item.type || 'Non Limit';
  document.getElementById('modal-agen-limit').textContent = `Limit: Rp ${formatIDR(item.limit)}`;
  document.getElementById('modal-agen-jadwal').textContent = `Jadwal: ${item.jadwal || '-'}`;
  document.getElementById('modal-agen-tgl-daftar').textContent = item.tgl_daftar && item.tgl_daftar !== '-' ? `Reg: ${item.tgl_daftar.split(' ')[0]}` : '';

  // Rollup KPI Cards
  const tot = item.total_trx || 0;
  const ew = item.ewallet_trx || 0;
  const pctEw = item.pct_ewallet || 0;

  document.getElementById('modal-agen-tot-trx').textContent = `${formatIDR(tot)} trx`;
  document.getElementById('modal-agen-ew-trx').textContent = formatIDR(ew);
  document.getElementById('modal-agen-ew-pct').textContent = formatPct(pctEw);

  const actCh = item.active_reseller || 0;
  const totCh = item.total_reseller || 1;
  const pctCh = item.pct_active_reseller || 0;
  document.getElementById('modal-agen-downlines-aktif').textContent = `${actCh} / ${totCh}`;
  document.getElementById('modal-agen-downlines-pct').textContent = `${formatPct(pctCh)} Aktif`;

  // Komposisi Produk
  document.getElementById('modal-agen-card-ew').textContent = formatIDR(ew);
  document.getElementById('modal-agen-pct-ew').textContent = formatPct(pctEw);
  document.getElementById('modal-agen-card-telco').textContent = formatIDR(item.telco_trx || 0);
  document.getElementById('modal-agen-card-ppob').textContent = formatIDR(item.ppob_trx || 0);
  document.getElementById('modal-agen-card-token').textContent = formatIDR(item.token_trx || 0);

  document.getElementById('modal-agen-bar-pct').textContent = formatPct(pctEw);
  document.getElementById('modal-agen-bar-tot').textContent = formatIDR(tot);
  document.getElementById('modal-agen-bar-fill').style.width = `${Math.min(pctEw, 100)}%`;

  // Downlines Table
  const childTbody = document.getElementById('modal-downlines-tbody');
  const childCount = document.getElementById('modal-downline-count');
  const children = item.children || [];

  if (childCount) childCount.textContent = `${children.length} reseller`;

  if (childTbody) {
    if (children.length === 0) {
      childTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">Tidak ada reseller downline terdaftar di bawah agen ini.</td></tr>`;
    } else {
      let cHtml = '';
      children.forEach((c, cIdx) => {
        const isAct = c.is_active;
        const badge = isAct ? `<span class="pill positive" style="font-size: 11px;">Aktif</span>` : `<span class="pill" style="font-size: 11px; background: #f1f5f9; color: #94a3b8;">0 Trx</span>`;
        cHtml += `
          <tr style="border-bottom: 1px solid var(--surface-border); transition: background 0.15s ease;">
            <td style="padding: 8px 12px; text-align: center; color: var(--text-muted);">${cIdx + 1}</td>
            <td style="padding: 8px 12px;">
              <strong style="color: var(--text-main); display: block;">${escapeHtml(c.name)}</strong>
              <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeHtml(c.kode)}</span>
            </td>
            <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: ${isAct ? 'var(--text-main)' : 'var(--text-muted)'};">${formatIDR(c.trx_month)}</td>
            <td style="padding: 8px 12px; text-align: right; color: #1e40af; font-weight: 600;">-</td>
            <td style="padding: 8px 12px; text-align: center;">${badge}</td>
            <td style="padding: 8px 12px; text-align: center;">
              <button type="button" onclick="closeAgenModal(); openResellerModal('${escapeHtml(c.kode)}');" style="background: none; border: 1px solid var(--surface-border); border-radius: 4px; padding: 2px 6px; font-size: 11px; color: var(--primary); cursor: pointer;">
                Detail
              </button>
            </td>
          </tr>
        `;
      });
      childTbody.innerHTML = cHtml;
    }
  }

  modal.style.display = 'flex';
}
window.openAgenModal = openAgenModal;

function closeAgenModal() {
  const modal = document.getElementById('agen-modal');
  if (modal) modal.style.display = 'none';
}
window.closeAgenModal = closeAgenModal;

function openResellerModal(kode) {
  // Cari di cache reseller dahulu, jika tidak ada cari di children agen
  let r = null;
  if (agenUnifiedState.resellerRaw) {
    const list = [...(agenUnifiedState.resellerRaw.rows || []), ...(agenUnifiedState.resellerRaw.churn_rows || [])];
    r = list.find(x => x.kode === kode);
  }

  if (!r && agenUnifiedState.agenRaw) {
    for (const parent of [...(agenUnifiedState.agenRaw.rows || []), ...(agenUnifiedState.agenRaw.churn_rows || [])]) {
      if (parent.children) {
        const found = parent.children.find(c => c.kode === kode);
        if (found) {
          r = {
            kode: found.kode,
            name: found.name,
            cabang: found.cabang || parent.cabang,
            sco: parent.sco,
            agen_id: parent.agen_id,
            agen_name: parent.agen_name,
            total_trx: found.trx_month || 0,
            ewallet_trx: 0,
            pct_ewallet: 0,
            activity_status: found.is_active ? 'Aktif' : 'Pasif'
          };
          break;
        }
      }
    }
  }

  if (!r) return;

  const modal = document.getElementById('reseller-modal');
  if (!modal) return;

  document.getElementById('modal-reseller-name').textContent = r.name || r.kode;
  document.getElementById('modal-reseller-kode').textContent = r.kode;
  document.getElementById('modal-reseller-cabang').textContent = r.cabang || '-';
  document.getElementById('modal-reseller-sco').textContent = `SCO: ${r.sco || '-'}`;
  document.getElementById('modal-reseller-induk').textContent = `Induk: ${r.agen_name || r.agen_id || '-'}`;
  document.getElementById('modal-reseller-tgl-daftar').textContent = r.tgl_daftar && r.tgl_daftar !== '-' ? `Reg: ${r.tgl_daftar.split(' ')[0]}` : '';

  const tot = r.total_trx || 0;
  const ew = r.ewallet_trx || 0;
  const pctEw = r.pct_ewallet || 0;

  document.getElementById('modal-reseller-tot-trx').textContent = `${formatIDR(tot)} trx`;
  document.getElementById('modal-reseller-ew-trx').textContent = formatIDR(ew);
  document.getElementById('modal-reseller-ew-pct').textContent = formatPct(pctEw);

  const statusEl = document.getElementById('modal-reseller-status-badge');
  if (statusEl) {
    if (r.activity_status === 'Pasif / Churn' || r.activity_status === 'Pasif') {
      statusEl.innerHTML = `<span class="pill negative">Pasif / Churn</span>`;
    } else if (r.activity_status === 'Member Baru') {
      statusEl.innerHTML = `<span class="pill" style="background: #e0f2fe; color: #0284c7; font-weight: 700;">Member Baru</span>`;
    } else if (r.activity_status === 'Reaktivasi') {
      statusEl.innerHTML = `<span class="pill" style="background: #fef3c7; color: #b45309; font-weight: 600;">Reaktivasi</span>`;
    } else {
      statusEl.innerHTML = `<span class="pill positive">Aktif Rutin</span>`;
    }
  }

  // Cards Komposisi Produk
  document.getElementById('modal-reseller-card-ew').textContent = formatIDR(ew);
  document.getElementById('modal-reseller-pct-ew-card').textContent = formatPct(pctEw);
  document.getElementById('modal-reseller-card-telco').textContent = formatIDR(r.telco_trx || 0);
  document.getElementById('modal-reseller-card-ppob').textContent = formatIDR(r.ppob_trx || 0);
  document.getElementById('modal-reseller-card-token').textContent = formatIDR(r.token_trx || 0);

  document.getElementById('modal-reseller-bar-pct').textContent = formatPct(pctEw);
  document.getElementById('modal-reseller-bar-tot').textContent = formatIDR(tot);
  document.getElementById('modal-reseller-bar-fill').style.width = `${Math.min(pctEw, 100)}%`;

  modal.style.display = 'flex';
}
window.openResellerModal = openResellerModal;

function closeResellerModal() {
  const modal = document.getElementById('reseller-modal');
  if (modal) modal.style.display = 'none';
}
window.closeResellerModal = closeResellerModal;

// Close modals when clicking backdrop
document.addEventListener('click', function(e) {
  const m1 = document.getElementById('agen-modal');
  if (m1 && m1.style.display === 'flex' && e.target === m1) {
    m1.style.display = 'none';
  }
  const m2 = document.getElementById('reseller-modal');
  if (m2 && m2.style.display === 'flex' && e.target === m2) {
    m2.style.display = 'none';
  }
});


// =============================================================================
// EXPORT EXCEL SESUAI TAB AKTIF
// =============================================================================

function ensureXlsxLoaded() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/static/js/xlsx.full.min.js';
    s.onload = () => resolve();
    s.onerror = (err) => reject(err);
    document.head.appendChild(s);
  });
}

async function exportActiveTabExcel() {
  const currentTab = agenUnifiedState.currentTab;

  try {
    await ensureXlsxLoaded();
  } catch (err) {
    console.error('XLSX library failed to load:', err);
    alert('Gagal memuat pustaka XLSX. Silakan coba lagi.');
    return;
  }

  if (currentTab === 'ringkasan') {
    exportRingkasanExcel();
  } else if (currentTab === 'induk') {
    exportIndukExcel();
  } else if (currentTab === 'reseller') {
    exportResellerExcel();
  } else if (currentTab === 'tren') {
    exportTrenExcel();
  }
}
window.exportActiveTabExcel = exportActiveTabExcel;

function exportRingkasanExcel() {
  const rows = agenUnifiedState.ringkasan.filteredRows || [];
  if (rows.length === 0) {
    alert('Tidak ada data ringkasan agen untuk diekspor.');
    return;
  }

  const period = agenUnifiedState.selectedMonth || '2026';
  const mode = agenUnifiedState.ringkasan.mode === 'top' ? 'Top10_Growth' : 'Bottom10_Drop';
  const cabang = agenUnifiedState.ringkasan.cabang === 'ALL' ? 'Semua_Cabang' : agenUnifiedState.ringkasan.cabang;

  const headers = [
    'No', 'Agen ID', 'Nama Toko Induk', 'Cabang', 'SCO', 'DSO', 'Jadwal', 'Limit (Rp)', 'Tipe', 'Tgl. Daftar',
    'Total Reseller Anak', 'Anak Aktif Bulan Ini', '% Anak Aktif',
    'Daily Bln Lalu (/hari)', 'Daily Bln Ini (/hari)', 'Growth Daily (Selisih)', 'Growth Daily % (MoM)',
    'Total Trx Bln Lalu', 'Total Trx Bln Ini', 'Status'
  ];

  const sheetData = [headers];
  rows.forEach((r, idx) => {
    sheetData.push([
      idx + 1,
      r.agen_id || '',
      r.agen_name || '',
      r.cabang || '',
      r.sco || '-',
      r.dso || '-',
      r.jadwal || '-',
      Number(r.limit) || 0,
      r.type || 'Non Limit',
      r.tgl_daftar || '-',
      Number(r.total_reseller) || 0,
      Number(r.active_reseller) || 0,
      Number(r.pct_active_reseller ? (r.pct_active_reseller / 100).toFixed(3) : 0),
      Number(r.daily_prev) || 0,
      Number(r.daily_curr) || 0,
      Number(r.growth_daily) || 0,
      Number(r.growth_daily_pct ? (r.growth_daily_pct / 100).toFixed(3) : 0),
      Number(r.prev_trx) || 0,
      Number(r.total_trx) || 0,
      ((r.daily_curr || 0) === 0 ? 'Drop 100% (Pasif)' : (agenUnifiedState.ringkasan.mode === 'top' ? 'Top Growth' : 'Growth Terendah'))
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Formatting % columns (index 12 and 16)
  for (let r = 1; r < sheetData.length; r++) {
    const c12 = XLSX.utils.encode_cell({ r: r, c: 12 });
    if (ws[c12]) ws[c12].z = '0.0%';
    const c16 = XLSX.utils.encode_cell({ r: r, c: 16 });
    if (ws[c16]) ws[c16].z = '0.0%';
    const c7 = XLSX.utils.encode_cell({ r: r, c: 7 });
    if (ws[c7]) ws[c7].z = '#,##0';
  }

  const colWidths = headers.map((h, colIdx) => {
    let maxLen = h.length;
    sheetData.forEach(row => {
      const val = row[colIdx] != null ? String(row[colIdx]) : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ringkasan Agen');
  const brand = agenUnifiedState.currentBrand || "ASTAGA";
  XLSX.writeFile(wb, `Ringkasan_Agen_${brand}_${period}_${mode}_${cabang}.xlsx`);
}

function exportIndukExcel() {
  const rows = agenUnifiedState.induk.filteredRows || [];
  if (rows.length === 0) {
    alert('Tidak ada data toko induk agen untuk diekspor.');
    return;
  }

  const period = agenUnifiedState.selectedMonth || '2026';
  const status = agenUnifiedState.induk.activeStatus;
  const cabang = agenUnifiedState.induk.cabang === 'ALL' ? 'Semua_Cabang' : agenUnifiedState.induk.cabang;

  const headers = [
    'No', 'Agen ID', 'Nama Toko Induk', 'Cabang', 'SCO', 'DSO', 'Jadwal', 'Limit (Rp)', 'Tipe', 'Tgl. Daftar',
    'Total Reseller Anak', 'Anak Aktif Bulan Ini', '% Anak Aktif',
    'Total Trx Rollup', 'Trx EWALLET', '% EWALLET', 'Trx TELCO', 'Trx PPOB', 'Trx TOKEN PLN', 'Status Keaktifan'
  ];

  const sheetData = [headers];
  rows.forEach((r, idx) => {
    sheetData.push([
      idx + 1,
      r.agen_id || '',
      r.agen_name || '',
      r.cabang || '',
      r.sco || '-',
      r.dso || '-',
      r.jadwal || '-',
      Number(r.limit) || 0,
      r.type || 'Non Limit',
      r.tgl_daftar || '-',
      Number(r.total_reseller) || 0,
      Number(r.active_reseller) || 0,
      Number(r.pct_active_reseller ? (r.pct_active_reseller / 100).toFixed(3) : 0),
      Number(r.total_trx) || 0,
      Number(r.ewallet_trx) || 0,
      Number(r.pct_ewallet ? (r.pct_ewallet / 100).toFixed(3) : 0),
      Number(r.telco_trx) || 0,
      Number(r.ppob_trx) || 0,
      Number(r.token_trx) || 0,
      r.activity_status || 'Aktif Rutin'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  for (let r = 1; r < sheetData.length; r++) {
    const c12 = XLSX.utils.encode_cell({ r: r, c: 12 });
    if (ws[c12]) ws[c12].z = '0.0%';
    const c15 = XLSX.utils.encode_cell({ r: r, c: 15 });
    if (ws[c15]) ws[c15].z = '0.0%';
    const c7 = XLSX.utils.encode_cell({ r: r, c: 7 });
    if (ws[c7]) ws[c7].z = '#,##0';
  }

  const colWidths = headers.map((h, colIdx) => {
    let maxLen = h.length;
    sheetData.forEach(row => {
      const val = row[colIdx] != null ? String(row[colIdx]) : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Toko Induk Agen');
  const brand = agenUnifiedState.currentBrand || "ASTAGA";
  XLSX.writeFile(wb, `Toko_Induk_Agen_${brand}_${period}_${status}_${cabang}.xlsx`);
}

function exportResellerExcel() {
  const rows = agenUnifiedState.reseller.filteredRows || [];
  if (rows.length === 0) {
    alert('Tidak ada data reseller downline untuk diekspor.');
    return;
  }

  const period = agenUnifiedState.selectedMonth || '2026';
  const status = agenUnifiedState.reseller.activeStatus;
  const cabang = agenUnifiedState.reseller.cabang === 'ALL' ? 'Semua_Cabang' : agenUnifiedState.reseller.cabang;

  const headers = [
    'No', 'Kode Reseller', 'Nama Reseller', 'Toko Induk (Agen)', 'Agen ID', 'Cabang', 'SCO', 'Tgl. Daftar',
    'Total Trx', 'Daily Trx (/hari)', 'Trx EWALLET', '% EWALLET', 'Trx TELCO', 'Trx PPOB', 'Trx TOKEN PLN', 'Status Keaktifan'
  ];

  const sheetData = [headers];
  rows.forEach((r, idx) => {
    sheetData.push([
      idx + 1,
      r.kode || '',
      r.name || '',
      r.agen_name || '',
      r.agen_id || '',
      r.cabang || '',
      r.sco || '-',
      r.tgl_daftar || '-',
      Number(r.total_trx) || 0,
      Number(r.daily_curr) || 0,
      Number(r.ewallet_trx) || 0,
      Number(r.pct_ewallet ? (r.pct_ewallet / 100).toFixed(3) : 0),
      Number(r.telco_trx) || 0,
      Number(r.ppob_trx) || 0,
      Number(r.token_trx) || 0,
      r.activity_status || 'Aktif Rutin'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  for (let r = 1; r < sheetData.length; r++) {
    const c11 = XLSX.utils.encode_cell({ r: r, c: 11 });
    if (ws[c11]) ws[c11].z = '0.0%';
  }

  const colWidths = headers.map((h, colIdx) => {
    let maxLen = h.length;
    sheetData.forEach(row => {
      const val = row[colIdx] != null ? String(row[colIdx]) : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reseller Downline');
  const brand = agenUnifiedState.currentBrand || "ASTAGA";
  XLSX.writeFile(wb, `Reseller_Downline_${brand}_${period}_${status}_${cabang}.xlsx`);
}


// =============================================================================
// TAB 4: TREN TRX AGEN (HISTORI 12 BULAN & YoY)
// =============================================================================

function generateSparklineSvg(values, width = 76, height = 22) {
  if (!values || values.length === 0) return '';
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const validVals = values.map(v => (v !== null && v !== undefined && !isNaN(v)) ? Number(v) : 0);
  const min = Math.min(...validVals);
  const max = Math.max(...validVals);
  const range = max - min;

  const lastVal = validVals[validVals.length - 1];
  const prevVal = validVals.length > 1 ? validVals[validVals.length - 2] : lastVal;
  const isUp = lastVal >= prevVal;
  const color = isUp ? '#16a34a' : '#dc2626';

  const n = validVals.length;
  let points = [];
  for (let i = 0; i < n; i++) {
    const x = pad + (n > 1 ? (i / (n - 1)) * w : w / 2);
    const y = range === 0 ? pad + h / 2 : pad + h - ((validVals[i] - min) / range) * h;
    points.push({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });
  }

  const polyPoints = points.map(p => `${p.x},${p.y}`).join(' ');
  const lastPoint = points[points.length - 1];

  return `
    <svg class="sparkline-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="${polyPoints}" />
      <circle cx="${lastPoint.x}" cy="${lastPoint.y}" r="2.5" fill="${color}" />
    </svg>
  `;
}
window.generateSparklineSvg = generateSparklineSvg;

async function fetchTrenData() {
  const brand = agenUnifiedState.currentBrand || 'ASTAGA';
  const tbody = document.getElementById('tren-table-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="16" class="text-center" style="padding: 40px; color: var(--text-muted);"><div class="loader">Mengambil data Tren Trx Agen (1 Tahun)...</div></td></tr>`;
  }

  try {
    const res = await fetch(`/api/agen/tren?brand=${encodeURIComponent(brand)}&t=${Date.now()}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Gagal memuat data tren agen');
    agenUnifiedState.trenRaw = json;
    renderTrenControls();
    applyTrenFilters();
  } catch (err) {
    console.error('Error fetchTrenData:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="16" class="text-center" style="padding: 30px; color: var(--negative);">Terjadi kesalahan memuat data tren agen: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}
window.fetchTrenData = fetchTrenData;

function renderTrenControls() {
  if (!agenUnifiedState.trenRaw || !agenUnifiedState.trenRaw.agents) return;
  const agents = agenUnifiedState.trenRaw.agents;

  // SCO Dropdown
  const scoSelect = document.getElementById('tren-sco-select');
  if (scoSelect) {
    const uniqueScos = [...new Set(agents.map(a => (a.sco || '').trim()))].filter(Boolean).sort();
    if (agenUnifiedState.tren.sco !== 'ALL' && !uniqueScos.includes(agenUnifiedState.tren.sco)) {
      agenUnifiedState.tren.sco = 'ALL';
    }
    const currSco = agenUnifiedState.tren.sco;
    let scoHtml = `<option value="ALL" ${currSco === 'ALL' ? 'selected' : ''}>Semua Petugas SCO (${agents.length} Toko)</option>`;
    uniqueScos.forEach(s => {
      const count = agents.filter(a => (a.sco || '').trim() === s).length;
      scoHtml += `<option value="${escapeHtml(s)}" ${s === currSco ? 'selected' : ''}>${escapeHtml(s)} (${count})</option>`;
    });
    scoSelect.innerHTML = scoHtml;
  }

  // Cabang Dropdown
  const cabSelect = document.getElementById('tren-cabang-select');
  if (cabSelect) {
    const uniqueCabangs = [...new Set(agents.map(a => (a.cabang || '').trim()))].filter(Boolean).sort();
    if (agenUnifiedState.tren.cabang !== 'ALL' && !uniqueCabangs.includes(agenUnifiedState.tren.cabang)) {
      agenUnifiedState.tren.cabang = 'ALL';
    }
    const currCab = agenUnifiedState.tren.cabang;
    let cabHtml = `<option value="ALL" ${currCab === 'ALL' ? 'selected' : ''}>Semua Cabang (${agents.length} Toko)</option>`;
    uniqueCabangs.forEach(c => {
      const count = agents.filter(a => (a.cabang || '').trim() === c).length;
      cabHtml += `<option value="${escapeHtml(c)}" ${c === currCab ? 'selected' : ''}>${escapeHtml(c)} (${count})</option>`;
    });
    cabSelect.innerHTML = cabHtml;
  }
}
window.renderTrenControls = renderTrenControls;

function getFilteredTrenAgents(allAgents) {
  if (!allAgents) return [];
  let list = allAgents;

  // Filter SCO
  if (agenUnifiedState.tren.sco !== 'ALL') {
    list = list.filter(a => (a.sco || '').trim() === agenUnifiedState.tren.sco);
  }

  // Filter Cabang
  if (agenUnifiedState.tren.cabang !== 'ALL') {
    list = list.filter(a => (a.cabang || '').trim() === agenUnifiedState.tren.cabang);
  }

  // Search
  if (agenUnifiedState.tren.search) {
    const q = agenUnifiedState.tren.search.toLowerCase().trim();
    list = list.filter(a =>
      String(a.name || '').toLowerCase().includes(q) ||
      String(a.aid || '').toLowerCase().includes(q) ||
      String(a.cabang || '').toLowerCase().includes(q) ||
      String(a.sco || '').toLowerCase().includes(q) ||
      String(a.type || '').toLowerCase().includes(q)
    );
  }

  // Trend Filter (Quick Filter)
  if (agenUnifiedState.tren.trendFilter === 'UP') {
    list = list.filter(a => (a.diff_yoy || 0) >= 0);
  } else if (agenUnifiedState.tren.trendFilter === 'DOWN') {
    list = list.filter(a => (a.diff_yoy || 0) < 0);
  } else if (agenUnifiedState.tren.trendFilter === 'ACTIVE_TOP') {
    list = list.filter(a => (a.curr_val || 0) >= 50);
  }

  // Sorting
  const sortMode = agenUnifiedState.tren.sort;
  list = [...list].sort((a, b) => {
    const aDiff = Number(a.diff_yoy || 0);
    const bDiff = Number(b.diff_yoy || 0);
    const aCurr = Number(a.curr_val || 0);
    const bCurr = Number(b.curr_val || 0);
    const aNov = Number((a.monthly && a.monthly['1125']) || 0);
    const bNov = Number((b.monthly && b.monthly['1125']) || 0);

    if (sortMode === 'diff_asc') return aDiff - bDiff; // Penurunan terbesar di atas (default)
    if (sortMode === 'diff_desc') return bDiff - aDiff; // Kenaikan tertinggi di atas
    if (sortMode === 'curr_desc') return bCurr - aCurr;
    if (sortMode === 'curr_asc') return aCurr - bCurr;
    if (sortMode === 'nov_desc') return bNov - aNov;
    if (sortMode === 'name_asc') return String(a.name || '').localeCompare(String(b.name || ''));
    return aDiff - bDiff;
  });

  return list;
}

function renderTrenTableRows(agents) {
  if (!agents || agents.length === 0) {
    return `
      <tr>
        <td colspan="16" class="text-center" style="padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 28px; opacity: 0.5; margin-bottom: 8px; display: inline-flex; align-items: center; justify-content: center;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path><path d="M9 9h1"></path><path d="M9 13h1"></path><path d="M9 17h1"></path><path d="M14 9h1"></path><path d="M14 13h1"></path><path d="M14 17h1"></path></svg>
          </div>
          <div style="font-size: 14px; font-weight: 600;">Tidak ada toko/agen yang sesuai dengan kriteria pencarian atau filter.</div>
        </td>
      </tr>`;
  }

  const months = (agenUnifiedState.trenRaw && agenUnifiedState.trenRaw.months) || [];

  return agents.map((a, idx) => {
    const sparkVals = a.sparkline || [];
    const maxVal = Number(a.max_val || 0);
    const diff = Number(a.diff_yoy || 0);
    const pct = Number(a.pct_yoy || 0);
    const isPos = diff >= 0;
    const sparkSvg = generateSparklineSvg(sparkVals, 76, 22);

    return `
      <tr>
        <td class="text-center" style="color:var(--text-muted); font-size:12px; font-weight:600;">${idx + 1}</td>
        <td>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 250px;">
            <div style="min-width: 0;">
              <div style="font-weight: 700; color: var(--text-main); font-size: 13px; line-height: 1.35;">${escapeHtml(a.name)}</div>
              <div style="display:flex; align-items:center; gap:6px; margin-top:3px; flex-wrap:wrap;">
                <span style="font-size: 11px; font-family: var(--font-mono, monospace); color: var(--primary); font-weight: 700;">${escapeHtml(a.aid)}</span>
                <span class="badge" style="font-size: 10px; padding: 1px 6px; background: #e0e7ff; color: #3730a3; font-weight: 600;">${escapeHtml(a.cabang || '-')}</span>
                <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(a.sco || '-')}</span>
                <span class="badge" style="font-size: 10px; padding: 1px 5px; background: #f1f5f9; color: #475569;">${escapeHtml(a.type || '-')}</span>
              </div>
            </div>
            <div style="flex-shrink: 0; text-align: right;" title="Tren Daily 12 Bulan (Nov 2025 - Okt 2026)">
              ${sparkSvg}
            </div>
          </div>
        </td>
        ${months.map(m => {
          const v = (a.monthly && a.monthly[m.code] !== undefined) ? Number(a.monthly[m.code]) : 0;
          const isLatest = m.is_latest;
          const isPeak = v === maxVal && maxVal > 0;
          if (isLatest) {
            return `<td class="text-right" style="font-weight: 800; color: var(--primary); font-size: 13px; background: rgba(37,99,235,0.06);">${formatDailyRate(v)}</td>`;
          }
          return `<td class="text-right"><span class="${isPeak ? 'val-peak' : ''}" title="${isPeak ? 'Puncak Tertinggi 12 Bulan' : ''}">${formatDailyRate(v)}</span></td>`;
        }).join('')}
        <td class="text-right">
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
            <span class="badge ${isPos ? 'badge-success' : 'badge-danger'}" style="font-weight:700; font-size:11.5px; padding:2px 6px; ${isPos ? 'background:#dcfce7; color:#15803d;' : 'background:#fee2e2; color:#b91c1c;'}">
              ${isPos ? '+' : ''}${formatDailyRate(diff)} (${isPos ? '+' : ''}${pct.toFixed(1)}%)
            </span>
            <span style="font-size:10px; color:var(--text-muted);">Base: ${formatDailyRate(a.yoy_base)} (Okt 25)</span>
          </div>
        </td>
        <td class="text-center">
          <button class="btn-copy-mini" title="Salin ID Agen" onclick="copyAgenId('${escapeHtml(a.aid)}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </td>
      </tr>`;
  }).join('');
}

function applyTrenFilters() {
  if (!agenUnifiedState.trenRaw || !agenUnifiedState.trenRaw.agents) return;
  const tbody = document.getElementById('tren-table-tbody');
  if (!tbody) return;

  const allAgents = agenUnifiedState.trenRaw.agents;
  const filtered = getFilteredTrenAgents(allAgents);
  agenUnifiedState.tren.filteredRows = filtered;

  // Counts for quick filter buttons based on branch / sco / search filter (before trendFilter)
  let baseFiltered = allAgents;
  if (agenUnifiedState.tren.sco !== 'ALL') {
    baseFiltered = baseFiltered.filter(a => (a.sco || '').trim() === agenUnifiedState.tren.sco);
  }
  if (agenUnifiedState.tren.cabang !== 'ALL') {
    baseFiltered = baseFiltered.filter(a => (a.cabang || '').trim() === agenUnifiedState.tren.cabang);
  }
  if (agenUnifiedState.tren.search) {
    const q = agenUnifiedState.tren.search.toLowerCase().trim();
    baseFiltered = baseFiltered.filter(a =>
      String(a.name || '').toLowerCase().includes(q) ||
      String(a.aid || '').toLowerCase().includes(q) ||
      String(a.cabang || '').toLowerCase().includes(q) ||
      String(a.sco || '').toLowerCase().includes(q) ||
      String(a.type || '').toLowerCase().includes(q)
    );
  }

  const totalBase = baseFiltered.length;
  let countUp = 0;
  let countDown = 0;
  let countTop = 0;
  baseFiltered.forEach(a => {
    if ((a.diff_yoy || 0) >= 0) countUp++;
    else countDown++;
    if ((a.curr_val || 0) >= 50) countTop++;
  });

  const qfAll = document.getElementById('tren-qf-all');
  if (qfAll) qfAll.textContent = `Semua Tren (${totalBase})`;
  const qfUp = document.getElementById('tren-qf-up');
  if (qfUp) qfUp.innerHTML = `<span style="display:inline-flex; align-items:center; color:#16a34a; margin-right:3px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></span> Tren Naik YoY (${countUp})`;
  const qfDown = document.getElementById('tren-qf-down');
  if (qfDown) qfDown.innerHTML = `<span style="display:inline-flex; align-items:center; color:#dc2626; margin-right:3px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg></span> Tren Turun YoY (${countDown})`;
  const qfTop = document.getElementById('tren-qf-top');
  if (qfTop) qfTop.innerHTML = `<span style="display:inline-flex; align-items:center; color:#f59e0b; margin-right:3px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></span> Top Aktif (≥ 50 trx/hari) (${countTop})`;

  // Update active pill
  document.querySelectorAll('.quick-filter-btn').forEach(btn => {
    if (btn.id === 'tren-qf-all' && agenUnifiedState.tren.trendFilter === 'ALL') btn.classList.add('active');
    else if (btn.id === 'tren-qf-up' && agenUnifiedState.tren.trendFilter === 'UP') btn.classList.add('active');
    else if (btn.id === 'tren-qf-down' && agenUnifiedState.tren.trendFilter === 'DOWN') btn.classList.add('active');
    else if (btn.id === 'tren-qf-top' && agenUnifiedState.tren.trendFilter === 'ACTIVE_TOP') btn.classList.add('active');
    else if (btn.id && btn.id.startsWith('tren-qf-')) btn.classList.remove('active');
  });

  // Pagination / Paging limit
  const paged = filtered.slice(0, agenUnifiedState.tren.pageLimit);
  tbody.innerHTML = renderTrenTableRows(paged);

  // Counter badge in header
  const badgeCounter = document.getElementById('tren-badge-counter');
  if (badgeCounter) {
    badgeCounter.textContent = `Menampilkan ${paged.length.toLocaleString('id-ID')} dari ${filtered.length.toLocaleString('id-ID')} Agen`;
  }

  // Load more info & buttons
  const infoEl = document.getElementById('tren-loadmore-info');
  if (infoEl) {
    infoEl.innerHTML = `Menampilkan <strong>${paged.length.toLocaleString('id-ID')}</strong> dari total <strong>${filtered.length.toLocaleString('id-ID')}</strong> agen yang sesuai`;
  }

  const actionsEl = document.getElementById('tren-loadmore-actions');
  if (actionsEl) {
    if (filtered.length > agenUnifiedState.tren.pageLimit) {
      actionsEl.innerHTML = `
        <button type="button" class="reseller-btn-page" onclick="loadMoreTrenAgents()" style="background:var(--surface); border:1px solid var(--surface-border); padding:6px 14px; font-weight:700;">
          + Muat 100 Lagi
        </button>
        <button type="button" class="reseller-btn-page" onclick="loadAllTrenAgents()" style="background:var(--primary); color:#fff; border:1px solid var(--primary); padding:6px 14px; font-weight:700;">
          Tampilkan Semua (${filtered.length.toLocaleString('id-ID')})
        </button>
      `;
    } else {
      actionsEl.innerHTML = `
        <span class="badge" style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; padding:6px 12px; font-weight:600; display:inline-flex; align-items:center; gap:5px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Semua data telah ditampilkan
        </span>
      `;
    }
  }
}
window.applyTrenFilters = applyTrenFilters;

function setTrenSco(val) {
  agenUnifiedState.tren.sco = val;
  agenUnifiedState.tren.pageLimit = 100;
  applyTrenFilters();
}
window.setTrenSco = setTrenSco;

function setTrenCabang(val) {
  agenUnifiedState.tren.cabang = val;
  agenUnifiedState.tren.pageLimit = 100;
  applyTrenFilters();
}
window.setTrenCabang = setTrenCabang;

function setTrenSort(val) {
  agenUnifiedState.tren.sort = val;
  agenUnifiedState.tren.pageLimit = 100;
  applyTrenFilters();
}
window.setTrenSort = setTrenSort;

function setTrenSearch(val) {
  agenUnifiedState.tren.search = val;
  agenUnifiedState.tren.pageLimit = 100;
  const clearBtn = document.getElementById('tren-search-clear-btn');
  if (clearBtn) clearBtn.style.display = val ? 'inline-flex' : 'none';
  applyTrenFilters();
}
window.setTrenSearch = setTrenSearch;

function clearTrenSearch() {
  agenUnifiedState.tren.search = '';
  const inp = document.getElementById('tren-search-input');
  if (inp) inp.value = '';
  const clearBtn = document.getElementById('tren-search-clear-btn');
  if (clearBtn) clearBtn.style.display = 'none';
  agenUnifiedState.tren.pageLimit = 100;
  applyTrenFilters();
}
window.clearTrenSearch = clearTrenSearch;

function setTrenTrendFilter(val) {
  agenUnifiedState.tren.trendFilter = val;
  agenUnifiedState.tren.pageLimit = 100;
  applyTrenFilters();
}
window.setTrenTrendFilter = setTrenTrendFilter;

function resetTrenFilters() {
  agenUnifiedState.tren.sco = 'ALL';
  agenUnifiedState.tren.cabang = 'ALL';
  agenUnifiedState.tren.sort = 'diff_asc';
  agenUnifiedState.tren.search = '';
  agenUnifiedState.tren.trendFilter = 'ALL';
  agenUnifiedState.tren.pageLimit = 100;

  const scoSel = document.getElementById('tren-sco-select');
  if (scoSel) scoSel.value = 'ALL';
  const cabSel = document.getElementById('tren-cabang-select');
  if (cabSel) cabSel.value = 'ALL';
  const sortSel = document.getElementById('tren-sort-select');
  if (sortSel) sortSel.value = 'diff_asc';
  const searchInp = document.getElementById('tren-search-input');
  if (searchInp) searchInp.value = '';
  const clearBtn = document.getElementById('tren-search-clear-btn');
  if (clearBtn) clearBtn.style.display = 'none';

  applyTrenFilters();
}
window.resetTrenFilters = resetTrenFilters;

function loadMoreTrenAgents() {
  agenUnifiedState.tren.pageLimit += 100;
  applyTrenFilters();
}
window.loadMoreTrenAgents = loadMoreTrenAgents;

function loadAllTrenAgents() {
  agenUnifiedState.tren.pageLimit = 999999;
  applyTrenFilters();
}
window.loadAllTrenAgents = loadAllTrenAgents;

function copyAgenId(aid) {
  if (!aid) return;
  navigator.clipboard.writeText(aid).then(() => {
    alert(`ID Toko ${aid} berhasil disalin!`);
  }).catch(() => {
    prompt('Salin ID Toko:', aid);
  });
}
window.copyAgenId = copyAgenId;

async function exportTrenExcel() {
  try {
    await ensureXlsxLoaded();
  } catch (err) {
    console.error('XLSX library failed to load:', err);
    alert('Gagal memuat pustaka XLSX. Silakan coba lagi.');
    return;
  }

  const rows = agenUnifiedState.tren.filteredRows || [];
  if (rows.length === 0) {
    alert('Tidak ada data tren agen untuk diekspor.');
    return;
  }

  const months = (agenUnifiedState.trenRaw && agenUnifiedState.trenRaw.months) || [];
  const headers = [
    'No',
    'ID Agen',
    'Nama Agen',
    'Cabang',
    'Petugas SCO',
    'Tipe Agen',
    'Plafon Limit (Rp)',
    ...months.map(m => `Daily ${m.label}`),
    'Puncak 12 Bulan (Max)',
    'Base YoY (Okt 25)',
    'Selisih YoY (Trx/Hari)',
    'Pertumbuhan YoY (%)',
    'Status Tren'
  ];

  const sheetData = [headers];
  rows.forEach((a, idx) => {
    const row = [
      idx + 1,
      a.aid || '',
      a.name || '',
      a.cabang || '',
      a.sco || '-',
      a.type || '',
      Number(a.limit || 0)
    ];

    months.forEach(m => {
      row.push(Number(a.monthly ? (a.monthly[m.code] || 0) : 0));
    });

    row.push(Number(a.max_val || 0));
    row.push(Number(a.yoy_base || 0));
    row.push(Number(a.diff_yoy || 0));
    row.push(Number((a.pct_yoy != null ? a.pct_yoy : 0).toFixed(1)));
    row.push((a.diff_yoy || 0) >= 0 ? 'Naik YoY' : 'Turun YoY');

    sheetData.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Auto width
  const colWidths = headers.map((h, colIdx) => {
    let maxLen = h.length;
    sheetData.forEach(row => {
      const val = row[colIdx] != null ? String(row[colIdx]) : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tren Trx Agen 1 Tahun');

  const sco = agenUnifiedState.tren.sco === 'ALL' ? 'Semua_SCO' : agenUnifiedState.tren.sco.replace(/[^a-zA-Z0-9]/g, '_');
  const cabang = agenUnifiedState.tren.cabang === 'ALL' ? 'Semua_Cabang' : agenUnifiedState.tren.cabang;
  const brand = agenUnifiedState.currentBrand || "ASTAGA";
  const fileName = `Tren_Trx_Agen_${brand}_1_Tahun_YoY_${cabang}_${sco}.xlsx`;

  XLSX.writeFile(wb, fileName);
}
window.exportTrenExcel = exportTrenExcel;


// =========================================================================
// MODUL SURVEY INTERAKTIF AI (CHURN AGENTS)
// =========================================================================
let currentSurveyCandidate = null;
let batchSurveyCandidates = [];

async function openSurveyModal(agenId, agenName, cabang, sco, prevTrx) {
  currentSurveyCandidate = {
    agen_id: agenId,
    agen_name: agenName,
    cabang: cabang,
    sco_name: sco,
    prev_trx: prevTrx,
    no_wa: ''
  };

  const modal = document.getElementById('survey-single-modal');
  if (!modal) return;

  // Set initial texts
  document.getElementById('survey-modal-toko').textContent = agenName;
  document.getElementById('survey-modal-id').textContent = agenId;
  document.getElementById('survey-modal-cabang').textContent = cabang;
  document.getElementById('survey-modal-sco').textContent = `SCO: ${sco}`;
  document.getElementById('survey-modal-prev-trx').textContent = `${(prevTrx || 0).toLocaleString('id-ID')} Trx`;
  
  const phoneElem = document.getElementById('survey-modal-phone');
  const sourceElem = document.getElementById('survey-modal-source');
  phoneElem.textContent = 'Memuat kontak...';
  sourceElem.textContent = '';

  const msgArea = document.getElementById('survey-message-text');
  msgArea.value = 'Memuat pesan sapaan AI...';

  const resBox = document.getElementById('survey-result-box');
  resBox.style.display = 'none';

  modal.style.display = 'flex';

  try {
    const brand = agenUnifiedState.currentBrand || 'ASTAGA';
    const month = agenUnifiedState.currentPeriod || '2026-10';
    
    // Fetch candidates from API
    const resp = await fetch(`/api/survey/candidates?brand=${encodeURIComponent(brand)}&month=${encodeURIComponent(month)}`);
    const json = await resp.json();
    if (json.ok && Array.isArray(json.candidates)) {
      const match = json.candidates.find(c => c.agen_id === agenId);
      if (match) {
        currentSurveyCandidate = { ...currentSurveyCandidate, ...match };
        phoneElem.textContent = match.no_wa || 'Belum ada kontak';
        sourceElem.textContent = match.source || 'Terverifikasi';
        
        // Fetch generated preview message
        const prevResp = await fetch('/api/survey/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand: brand, candidate: match })
        });
        const prevJson = await prevResp.json();
        if (prevJson.ok && prevJson.message) {
          msgArea.value = prevJson.message;
        }
      }
    }
  } catch (err) {
    console.error('Error fetching survey candidate info:', err);
    phoneElem.textContent = 'Gagal memuat kontak';
  }
}
window.openSurveyModal = openSurveyModal;

function closeSurveyModal() {
  const modal = document.getElementById('survey-single-modal');
  if (modal) modal.style.display = 'none';
  currentSurveyCandidate = null;
}
window.closeSurveyModal = closeSurveyModal;

function toggleSurveyTestInput() {
  const isTest = document.getElementById('survey-is-test').checked;
  const box = document.getElementById('survey-test-phone-box');
  if (box) {
    box.style.display = isTest ? 'flex' : 'none';
  }
}
window.toggleSurveyTestInput = toggleSurveyTestInput;

async function submitSurveyAction() {
  if (!currentSurveyCandidate) return;

  const btn = document.getElementById('btn-submit-survey');
  const resBox = document.getElementById('survey-result-box');
  const isTest = document.getElementById('survey-is-test').checked;
  const testPhone = document.getElementById('survey-test-phone').value.trim();
  const customMsg = document.getElementById('survey-message-text').value.trim();

  if (isTest && (!testPhone || testPhone.length < 9)) {
    alert('Mohon masukkan nomor HP/WA uji coba Anda yang valid (contoh: 081234567890)');
    document.getElementById('survey-test-phone').focus();
    return;
  }

  btn.disabled = true;
  btn.style.opacity = '0.7';
  btn.innerHTML = 'Mengirim...';

  try {
    const brand = agenUnifiedState.currentBrand || 'ASTAGA';
    const month = agenUnifiedState.currentPeriod || '2026-10';

    const payload = {
      brand: brand,
      periode: month,
      agen_id: currentSurveyCandidate.agen_id,
      agen_name: currentSurveyCandidate.agen_name,
      cabang: currentSurveyCandidate.cabang,
      sco_name: currentSurveyCandidate.sco_name,
      no_wa: currentSurveyCandidate.no_wa,
      prev_trx: currentSurveyCandidate.prev_trx,
      message: customMsg,
      is_test: isTest,
      test_phone: testPhone
    };

    const resp = await fetch('/api/survey/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const res = await resp.json();

    resBox.style.display = 'block';
    if (res.ok) {
      resBox.style.background = '#f0fdf4';
      resBox.style.border = '1px solid #bbf7d0';
      resBox.style.color = '#166534';
      
      const targetTxt = isTest ? `Nomor Uji Coba (${res.target_phone})` : `Nomor Toko (${res.target_phone})`;
      resBox.innerHTML = `
        <strong>Survey Berhasil Diproses!</strong><br>
        Status: <code>${res.status}</code> &bull; Dikirim ke: ${targetTxt}<br>
        <span style="font-size: 11px; color: #15803d;">${res.gateway_status ? res.gateway_status.note || 'Terkirim' : 'Tercatat di sistem'}</span>
      `;
    } else {
      resBox.style.background = '#fef2f2';
      resBox.style.border = '1px solid #fecaca';
      resBox.style.color = '#991b1b';
      resBox.innerHTML = `<strong>Gagal:</strong> ${res.error || 'Terjadi kesalahan'}`;
    }
  } catch (err) {
    resBox.style.display = 'block';
    resBox.style.background = '#fef2f2';
    resBox.style.border = '1px solid #fecaca';
    resBox.style.color = '#991b1b';
    resBox.innerHTML = `<strong>Error:</strong> ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
      <span>Kirim Pesan Survey</span>
    `;
  }
}
window.submitSurveyAction = submitSurveyAction;

// =========================================================================
// BATCH SURVEY FUNCTIONS
// =========================================================================
async function openBatchSurveyModal() {
  const modal = document.getElementById('survey-batch-modal');
  if (!modal) return;

  const brand = agenUnifiedState.currentBrand || 'ASTAGA';
  const month = agenUnifiedState.currentPeriod || '2026-10';

  const tbody = document.getElementById('batch-candidate-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted);">Memuat daftar seluruh agen churn...</td></tr>';
  
  modal.style.display = 'flex';

  try {
    const resp = await fetch(`/api/survey/candidates?brand=${encodeURIComponent(brand)}&month=${encodeURIComponent(month)}`);
    const json = await resp.json();
    if (json.ok && Array.isArray(json.candidates)) {
      batchSurveyCandidates = json.candidates;

      document.getElementById('batch-total-churn').textContent = json.summary.total_churn || 0;
      document.getElementById('batch-ready-count').textContent = json.summary.ready_to_survey || 0;
      document.getElementById('batch-selected-count').textContent = json.candidates.length;

      renderBatchCandidatesTable();
    }
  } catch (err) {
    console.error('Error fetching batch candidates:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #ef4444;">Gagal memuat data kandidat survey.</td></tr>';
  }
}
window.openBatchSurveyModal = openBatchSurveyModal;

function closeBatchSurveyModal() {
  const modal = document.getElementById('survey-batch-modal');
  if (modal) modal.style.display = 'none';
  batchSurveyCandidates = [];
}
window.closeBatchSurveyModal = closeBatchSurveyModal;

function renderBatchCandidatesTable() {
  const tbody = document.getElementById('batch-candidate-tbody');
  if (!tbody) return;

  let html = '';
  batchSurveyCandidates.forEach((c, idx) => {
    const phone = c.no_wa ? `<code>${c.no_wa}</code>` : '<span style="color: #ef4444;">Tidak ada</span>';
    const statusBadge = c.status === 'SENT' ? '<span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Terkirim</span>' : '<span style="background: var(--table-header); color: var(--text-muted); padding: 2px 6px; border-radius: 4px;">Belum</span>';

    const displayName = c.reseller_name || c.agen_name || c.agen_id;
    const displayInduk = (c.induk_name && c.induk_name !== '-' && c.induk_name !== displayName) ? `<div style="font-size: 10.5px; color: var(--text-muted);">Induk: ${escapeHtml(c.induk_name)}</div>` : '';

    html += `
      <tr style="border-bottom: 1px solid var(--surface-border);">
        <td style="padding: 8px 12px; text-align: center;">
          <input type="checkbox" class="batch-cand-check" data-idx="${idx}" checked onchange="updateBatchSelectedCount()">
        </td>
        <td style="padding: 8px 12px;">
          <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(displayName)}</div>
          <div style="font-size: 11px; font-family: monospace; color: var(--primary);">${escapeHtml(c.reseller_id || c.agen_id)}</div>
          ${displayInduk}
        </td>
        <td style="padding: 8px 12px;">
          <div style="font-weight: 600;">${escapeHtml(c.cabang || '-')}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(c.sco_name || '-')}</div>
        </td>
        <td style="padding: 8px 12px; text-align: center; font-weight: 700; color: #0284c7;">
          ${(c.prev_trx || 0).toLocaleString('id-ID')}
        </td>
        <td style="padding: 8px 12px;">
          ${phone}
        </td>
        <td style="padding: 8px 12px; text-align: center;">
          ${statusBadge}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  updateBatchSelectedCount();
}

function updateBatchSelectedCount() {
  const checks = document.querySelectorAll('.batch-cand-check:checked');
  const countElem = document.getElementById('batch-selected-count');
  if (countElem) {
    countElem.textContent = checks.length;
  }
}
window.updateBatchSelectedCount = updateBatchSelectedCount;

function toggleSelectAllBatch(checked) {
  document.querySelectorAll('.batch-cand-check').forEach(cb => {
    cb.checked = checked;
  });
  const checkAll = document.getElementById('batch-check-all');
  if (checkAll) checkAll.checked = checked;
  updateBatchSelectedCount();
}
window.toggleSelectAllBatch = toggleSelectAllBatch;

function toggleBatchTestInput() {
  // Mode test toggle
}
window.toggleBatchTestInput = toggleBatchTestInput;

async function submitBatchSurveyAction() {
  const selectedIndices = [];
  document.querySelectorAll('.batch-cand-check:checked').forEach(cb => {
    selectedIndices.push(parseInt(cb.getAttribute('data-idx')));
  });

  if (selectedIndices.length === 0) {
    alert('Pilih minimal 1 agen untuk disurvey.');
    return;
  }

  const isTest = document.getElementById('batch-is-test').checked;
  const btn = document.getElementById('btn-submit-batch-survey');
  const resBox = document.getElementById('batch-result-box');

  if (!confirm(`Konfirmasi: Jalankan survey AI ke ${selectedIndices.length} agen terpilih? (${isTest ? 'Mode Uji Coba / Simulasi Database' : 'Kirim WhatsApp Nyata'})`)) {
    return;
  }

  btn.disabled = true;
  btn.style.opacity = '0.7';
  btn.innerHTML = 'Memproses batch...';

  resBox.style.display = 'block';
  resBox.style.background = '#eff6ff';
  resBox.style.border = '1px solid #bfdbfe';
  resBox.style.color = '#1e40af';
  resBox.innerHTML = `Sedang memproses 0 dari ${selectedIndices.length} survey...`;

  const brand = agenUnifiedState.currentBrand || 'ASTAGA';
  const month = agenUnifiedState.currentPeriod || '2026-10';

  let successCount = 0;
  for (let i = 0; i < selectedIndices.length; i++) {
    const cand = batchSurveyCandidates[selectedIndices[i]];
    try {
      // 1. Generate preview message
      const prevResp = await fetch('/api/survey/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brand, candidate: cand })
      });
      const prevJson = await prevResp.json();
      const msg = prevJson.message || `Halo Kak di ${cand.agen_name}, salam dari tim ${brand}...`;

      // 2. Send survey
      await fetch('/api/survey/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: brand,
          periode: month,
          agen_id: cand.agen_id,
          agen_name: cand.agen_name,
          cabang: cand.cabang,
          sco_name: cand.sco_name,
          no_wa: cand.no_wa,
          prev_trx: cand.prev_trx,
          message: msg,
          is_test: isTest
        })
      });
      successCount++;
      resBox.innerHTML = `Sedang memproses ${successCount} dari ${selectedIndices.length} survey...`;
    } catch (e) {
      console.error('Batch error for', cand.agen_id, e);
    }
  }

  resBox.style.background = '#f0fdf4';
  resBox.style.border = '1px solid #bbf7d0';
  resBox.style.color = '#166534';
  resBox.innerHTML = `<strong>Selesai!</strong> Berhasil memproses ${successCount} dari ${selectedIndices.length} agen terpilih (${isTest ? 'Mode Uji Coba Tercatat' : 'Terkirim'}).`;

  btn.disabled = false;
  btn.style.opacity = '1';
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"></line>
      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
    <span>Mulai Survey Batch Terpilih</span>
  `;

  // Reload candidates to refresh status
  setTimeout(() => {
    openBatchSurveyModal();
  }, 1000);
}
window.submitBatchSurveyAction = submitBatchSurveyAction;
