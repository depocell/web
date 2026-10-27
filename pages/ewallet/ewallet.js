/**
 * ewallet.js
 * Dedicated Controller untuk Halaman E-Wallet Monitoring
 * Tab 1: Analisa Fraud & Self-Transaction Reseller (E-Wallet Gestun)
 * Tab 2: Tren % EWALLET Toko Induk Agen Tiap Bulan Selama 2026
 */

(function () {
  'use strict';

  const state = {
    currentBrand: 'ASTAGA',
    selectedMonth: '2026-10',
    currentTab: 'fraud',
    fraudRaw: null,
    filters: {
      mode: 'fraud_only',
      cabang: 'ALL',
      sco: 'ALL',
      search: '',
      page: 1,
      pageSize: 50,
      filteredRows: []
    },
    trenRaw: null,
    tren: {
      cabang: 'ALL',
      sco: 'ALL',
      porsi: 'all',
      search: '',
      page: 1,
      pageSize: 50,
      filteredRows: []
    }
  };

  // Expose state globally for debugging if needed
  window.ewalletState = state;

  // ── 1. MAIN ENTRYPOINT: loadEwallet ──
  async function loadEwallet() {
    // Parse query params from URL if present
    const hash = window.location.hash || '';
    if (hash.includes('?')) {
      const qStr = hash.split('?')[1];
      const params = new URLSearchParams(qStr);
      const b = (params.get('brand') || '').toUpperCase();
      if (b === 'ASTAGA' || b === 'OKIPAY') {
        state.currentBrand = 'ASTAGA';
      }
      const m = params.get('month');
      if (m) {
        state.selectedMonth = m;
      }
      const tab = params.get('tab');
      if (tab === 'tren') {
        state.currentTab = 'tren';
      }
    }

    updateBrandButtons();
    updateMonthDropdown();

    if (state.currentTab === 'tren') {
      await switchEwalletTab('tren');
    } else {
      await fetchFraudData();
    }
  }
  window.loadEwallet = loadEwallet;

  // ── 2. BRAND & MONTH CONTROLLERS ──
  function updateBrandButtons() {
    const btnAstaga = document.getElementById('btn-brand-astaga');
    const btnOkipay = document.getElementById('btn-brand-okipay');
    if (btnAstaga && btnOkipay) {
      if (state.currentBrand === 'ASTAGA') {
        btnAstaga.classList.add('active');
        btnOkipay.classList.remove('active');
      } else {
        btnOkipay.classList.add('active');
        btnAstaga.classList.remove('active');
      }
    }
  }

  function setEwalletBrand(brand) {
    state.currentBrand = 'ASTAGA';
    updateBrandButtons();
  }
  window.setEwalletBrand = setEwalletBrand;

  function updateMonthDropdown() {
    const select = document.getElementById('ewallet-month-select');
    if (select && state.selectedMonth) {
      select.value = state.selectedMonth;
    }
  }

  function onEwalletMonthChange(val) {
    state.selectedMonth = val;
    state.filters.page = 1;
    fetchFraudData();
  }
  window.onEwalletMonthChange = onEwalletMonthChange;

  // =========================================================================
  // TAB 1: ANALISA FRAUD (SELF-TRX E-WALLET GESTUN)
  // =========================================================================

  async function fetchFraudData() {
    const tbody = document.getElementById('ewallet-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="12" class="text-center" style="padding: 40px; color: var(--text-muted);"><div class="loader">Memuat data Analisa Fraud E-Wallet...</div></td></tr>`;
    }

    const brand = state.currentBrand;
    const month = state.selectedMonth || '2026-10';
    const url = `/api/reseller/fraud?brand=${encodeURIComponent(brand)}&month=${encodeURIComponent(month)}&t=${Date.now()}`;

    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || 'Gagal memuat data');
      }

      state.fraudRaw = json;
      renderKPI();
      renderControls();
      applyFilters();
    } catch (err) {
      console.error('[Ewallet Fraud Error]', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center" style="padding: 30px; color: var(--negative);">Terjadi kesalahan: ${err.message}</td></tr>`;
      }
    }
  }

  function renderKPI() {
    const data = state.fraudRaw;
    if (!data) return;

    const summary = data.summary || {
      total_fraud_resellers: 0,
      total_self_hits: 0,
      total_self_nominal: 0,
      avg_self_pct: 0.0
    };

    const countEl = document.getElementById('ewallet-kpi-count');
    if (countEl) countEl.textContent = Number(summary.total_fraud_resellers || 0).toLocaleString('id-ID');

    const countSubEl = document.getElementById('ewallet-kpi-count-sub');
    if (countSubEl && data.total_targets) {
      countSubEl.textContent = `Dari ${Number(data.total_targets).toLocaleString('id-ID')} target toko binaan SCO`;
    }

    const hitsEl = document.getElementById('ewallet-kpi-hits');
    if (hitsEl) hitsEl.textContent = Number(summary.total_self_hits || 0).toLocaleString('id-ID');

    const nominalEl = document.getElementById('ewallet-kpi-nominal');
    if (nominalEl) nominalEl.textContent = 'Rp ' + Number(summary.total_self_nominal || 0).toLocaleString('id-ID');

    const pctEl = document.getElementById('ewallet-kpi-pct');
    if (pctEl) pctEl.textContent = (summary.avg_self_pct || 0).toFixed(1) + '%';


  }

  function renderControls() {
    const data = state.fraudRaw;
    if (!data || !data.rows) return;

    // Month fixed to 2026-10 (MTD)

    // Cabang dropdown
    const cabangSel = document.getElementById('ewallet-cabang-select');
    if (cabangSel) {
      const cur = state.filters.cabang || 'ALL';
      const cabangs = Array.from(new Set(data.rows.map(r => r.cabang).filter(Boolean))).sort();
      cabangSel.innerHTML = '<option value="ALL">Semua Cabang</option>' +
        cabangs.map(c => `<option value="${c}" ${c === cur ? 'selected' : ''}>Cabang ${c}</option>`).join('');
    }

    // SCO dropdown
    const scoSel = document.getElementById('ewallet-sco-select');
    if (scoSel) {
      const cur = state.filters.sco || 'ALL';
      const scos = Array.from(new Set(data.rows.map(r => r.sco).filter(Boolean))).sort();
      scoSel.innerHTML = '<option value="ALL">Semua Tim SCO</option>' +
        scos.map(s => `<option value="${s}" ${s === cur ? 'selected' : ''}>SCO ${s}</option>`).join('');
    }

    // Mode dropdown sync
    const modeSel = document.getElementById('ewallet-mode-select');
    if (modeSel) {
      modeSel.value = state.filters.mode || 'fraud_only';
    }
  }

  function applyFilters() {
    const data = state.fraudRaw;
    if (!data || !data.rows) return;

    const modeSel = document.getElementById('ewallet-mode-select');
    const cabangSel = document.getElementById('ewallet-cabang-select');
    const scoSel = document.getElementById('ewallet-sco-select');
    const searchInput = document.getElementById('ewallet-search-input');

    const mode = modeSel ? modeSel.value : 'fraud_only';
    const cabang = cabangSel ? cabangSel.value : 'ALL';
    const sco = scoSel ? scoSel.value : 'ALL';
    const search = searchInput ? searchInput.value.trim().toLowerCase() : '';

    state.filters.mode = mode;
    state.filters.cabang = cabang;
    state.filters.sco = sco;
    state.filters.search = search;

    let filtered = data.rows.slice();

    if (mode === 'fraud_only') {
      filtered = filtered.filter(r => (r.self_hits || 0) > 0);
    }

    if (cabang !== 'ALL') {
      filtered = filtered.filter(r => (r.cabang || '').toUpperCase() === cabang.toUpperCase());
    }

    if (sco !== 'ALL') {
      filtered = filtered.filter(r => (r.sco || '').toUpperCase() === sco.toUpperCase());
    }

    if (search) {
      filtered = filtered.filter(r => {
        const text = [
          r.kode_reseller,
          r.nama_reseller,
          r.root_agen_id,
          r.nama_agen,
          r.registered_phone,
          ...(r.candidate_phones || [])
        ].filter(Boolean).join(' ').toLowerCase();
        return text.includes(search);
      });
    }

    filtered.sort((a, b) => {
      const hitsA = a.self_hits || 0;
      const hitsB = b.self_hits || 0;
      if (hitsB !== hitsA) return hitsB - hitsA;
      return (b.self_nominal || 0) - (a.self_nominal || 0);
    });

    state.filters.filteredRows = filtered;
    renderTable();
  }
  window.applyEwalletFilters = applyFilters;

  function clearEwalletSearch() {
    const input = document.getElementById('ewallet-search-input');
    if (input) input.value = '';
    state.filters.page = 1;
    applyFilters();
  }
  window.clearEwalletSearch = clearEwalletSearch;

  function renderTable() {
    const rows = state.filters.filteredRows || [];
    const tbody = document.getElementById('ewallet-tbody');
    const rowCountEl = document.getElementById('ewallet-table-row-count');
    const pageInfoEl = document.getElementById('ewallet-table-page-info');
    const pageNumEl = document.getElementById('ewallet-page-current-num');
    const btnPrev = document.getElementById('btn-ewallet-page-prev');
    const btnNext = document.getElementById('btn-ewallet-page-next');

    if (rowCountEl) rowCountEl.textContent = `${rows.length.toLocaleString('id-ID')} baris`;

    if (!rows.length) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center" style="padding: 40px; color: var(--text-muted);">Tidak ada data yang cocok dengan filter yang dipilih.</td></tr>`;
      }
      if (pageInfoEl) pageInfoEl.textContent = 'Menampilkan 0 dari 0 data';
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = true;
      return;
    }

    const pageSize = state.filters.pageSize || 50;
    const totalPages = Math.ceil(rows.length / pageSize) || 1;
    if (state.filters.page > totalPages) state.filters.page = totalPages;
    if (state.filters.page < 1) state.filters.page = 1;
    const curPage = state.filters.page;

    const startIdx = (curPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, rows.length);
    const pageRows = rows.slice(startIdx, endIdx);

    if (pageInfoEl) {
      pageInfoEl.textContent = `Menampilkan ${startIdx + 1} - ${endIdx} dari ${rows.length.toLocaleString('id-ID')} data`;
    }
    if (pageNumEl) pageNumEl.textContent = `${curPage} / ${totalPages}`;
    if (btnPrev) btnPrev.disabled = (curPage <= 1);
    if (btnNext) btnNext.disabled = (curPage >= totalPages);

    if (!tbody) return;

    let html = '';
    pageRows.forEach((r, idx) => {
      const rowNum = startIdx + idx + 1;
      const isFraud = (r.self_hits || 0) > 0;
      const rowBg = isFraud ? 'background: rgba(239, 68, 68, 0.04);' : '';

      const selfHitsBadge = isFraud
        ? `<span class="badge" style="background: rgba(220, 38, 38, 0.12); color: #dc2626; font-weight: 800; font-family: var(--font-mono); font-size: 12px; padding: 3px 8px; border-radius: 6px;">${Number(r.self_hits).toLocaleString('id-ID')}</span>`
        : `<span style="color: var(--text-muted); font-size: 12px;">0</span>`;

      const selfNominalText = isFraud
        ? `<span style="font-weight: 700; color: #dc2626; font-family: var(--font-mono);">Rp ${Number(r.self_nominal || 0).toLocaleString('id-ID')}</span>`
        : `<span style="color: var(--text-muted);">Rp 0</span>`;

      const selfPctBadge = isFraud
        ? `<span style="font-weight: 700; color: #d97706;">${(r.self_pct || 0).toFixed(1)}%</span>`
        : `<span style="color: var(--text-muted);">0.0%</span>`;

      const limitFormatted = r.limit_saldo
        ? `Rp ${Number(r.limit_saldo).toLocaleString('id-ID')}`
        : '-';

      const typeBadge = (r.agent_type === 'Limit')
        ? `<span class="badge" style="background: rgba(2, 132, 199, 0.1); color: #0284c7; font-weight: 700; font-size: 10.5px; padding: 2px 6px;">Limit</span>`
        : `<span class="badge" style="background: var(--table-header); color: var(--text-muted); font-weight: 600; font-size: 10.5px; padding: 2px 6px;">${r.agent_type || '-'}</span>`;

      html += `
        <tr style="${rowBg}">
          <td style="text-align: center; color: var(--text-muted); font-size: 12px;">${rowNum}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 13px;">${r.nama_reseller || '-'}</div>
            <div style="font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px;">${r.kode_reseller}</div>
          </td>
          <td>
            <div style="font-weight: 600; font-size: 12.5px;">Cabang ${r.cabang || '-'}</div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">SCO: ${r.sco || '-'}</div>
          </td>
          <td>
            <div style="font-size: 12px; color: var(--text-main); font-weight: 500;">${r.nama_agen || r.root_agen_id || '-'}</div>
            <div style="margin-top: 3px; display: flex; align-items: center; gap: 5px;">
              ${typeBadge}
              <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${limitFormatted}</span>
            </div>
          </td>
          <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-main);">
            ${r.registered_phone || '-'}
          </td>
          <td class="text-right" style="font-size: 12.5px;">${Number(r.total_all_hits || 0).toLocaleString('id-ID')}</td>
          <td class="text-right" style="font-size: 12.5px;">${Number(r.total_ew_hits || 0).toLocaleString('id-ID')}</td>
          <td class="text-right" style="font-size: 12.5px; font-weight: 600;">${(r.pct_ewallet || 0).toFixed(1)}%</td>
          <td class="text-right">${selfHitsBadge}</td>
          <td class="text-right">${selfNominalText}</td>
          <td class="text-right">${selfPctBadge}</td>
          <td class="text-center">
            <button type="button" onclick="openEwalletDetail('${r.kode_reseller}')" style="padding: 5px 12px; border-radius: 6px; border: 1px solid rgba(2, 132, 199, 0.3); background: rgba(2, 132, 199, 0.08); color: #0284c7; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s ease;">
              Detail
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  function prevEwalletPage() {
    if (state.filters.page > 1) {
      state.filters.page--;
      renderTable();
    }
  }
  window.prevEwalletPage = prevEwalletPage;

  function nextEwalletPage() {
    const totalPages = Math.ceil((state.filters.filteredRows.length || 1) / (state.filters.pageSize || 50));
    if (state.filters.page < totalPages) {
      state.filters.page++;
      renderTable();
    }
  }
  window.nextEwalletPage = nextEwalletPage;

  async function openEwalletDetail(kodeReseller) {
    const modal = document.getElementById('ewallet-detail-modal');
    if (!modal) return;

    modal.style.display = 'flex';

    const nameEl = document.getElementById('ewallet-modal-name');
    const idEl = document.getElementById('ewallet-modal-id');
    const metaEl = document.getElementById('ewallet-modal-meta');
    const hitsEl = document.getElementById('ewallet-modal-hits');
    const nomEl = document.getElementById('ewallet-modal-nominal');
    const phoneEl = document.getElementById('ewallet-modal-phone');
    const tbody = document.getElementById('ewallet-modal-tbody');

    if (nameEl) nameEl.textContent = 'Memuat data...';
    if (idEl) idEl.textContent = kodeReseller;
    if (metaEl) metaEl.textContent = '-';
    if (hitsEl) hitsEl.textContent = '0';
    if (nomEl) nomEl.textContent = 'Rp 0';
    if (phoneEl) phoneEl.textContent = '-';
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 30px; color: var(--text-muted);"><div class="loader">Mengambil rincian transaksi...</div></td></tr>`;

    const brand = state.currentBrand;
    const month = state.selectedMonth || '2026-10';
    const url = `/api/reseller/fraud/detail?brand=${encodeURIComponent(brand)}&kode_reseller=${encodeURIComponent(kodeReseller)}&month=${encodeURIComponent(month)}&t=${Date.now()}`;

    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Gagal memuat rincian transaksi');

      const meta = json.reseller || json.meta || {};
      const trxs = json.items || json.transactions || [];
      const totalHits = json.total_self_hits !== undefined ? json.total_self_hits : (meta.self_hits || trxs.length || 0);
      const totalNominal = json.total_self_nominal !== undefined ? json.total_self_nominal : (meta.self_nominal || 0);

      if (nameEl) nameEl.textContent = meta.nama_reseller || kodeReseller;
      if (idEl) idEl.textContent = kodeReseller;
      if (metaEl) {
        metaEl.textContent = `Cabang ${meta.cabang || '-'} • SCO: ${meta.sco || '-'} • Toko Induk: ${meta.nama_agen || meta.root_agen_id || '-'}`;
      }
      if (hitsEl) hitsEl.textContent = Number(totalHits).toLocaleString('id-ID');
      if (nomEl) nomEl.textContent = 'Rp ' + Number(totalNominal).toLocaleString('id-ID');
      if (phoneEl) {
        const cands = (meta.candidate_phones || []).join(', ');
        phoneEl.textContent = meta.registered_phone ? `${meta.registered_phone} (Kandidat: ${cands || '-'})` : '-';
      }

      if (!trxs.length) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 30px; color: var(--text-muted);">Tidak ada transaksi individual self-topup yang ditemukan pada periode ini.</td></tr>`;
        return;
      }

      let rowsHtml = '';
      trxs.forEach(t => {
        const tgl = t.tgl_entry || t.tgl_entri || '-';
        const prod = t.product_id || t.kode_produk || '-';
        const tujuan = t.nomor_tujuan || t.tujuan || '-';
        const harga = Number(t.harga_jual || t.jual || 0);
        const status = t.status || 'Sukses';

        rowsHtml += `
          <tr>
            <td style="font-size: 12px; font-family: var(--font-mono); color: var(--text-muted);">${tgl}</td>
            <td style="font-size: 12px; font-family: var(--font-mono); font-weight: 600;">${t.trx_id || '-'}</td>
            <td>
              <div style="font-weight: 700; font-size: 12.5px;">${prod}</div>
              ${t.nama_produk ? `<div style="font-size: 11px; color: var(--text-muted);">${t.nama_produk}</div>` : ''}
            </td>
            <td style="font-family: var(--font-mono); font-size: 12.5px; font-weight: 700; color: #dc2626;">
              ${tujuan}
            </td>
            <td class="text-right" style="font-family: var(--font-mono); font-size: 12.5px; font-weight: 600;">
              Rp ${harga.toLocaleString('id-ID')}
            </td>
            <td class="text-center">
              <span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #059669; font-weight: 700; font-size: 10.5px; padding: 2px 7px;">
                ${status}
              </span>
            </td>
          </tr>
        `;
      });

      if (tbody) tbody.innerHTML = rowsHtml;
    } catch (err) {
      console.error('[Detail Error]', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 30px; color: var(--negative);">Terjadi kesalahan: ${err.message}</td></tr>`;
      }
    }
  }
  window.openEwalletDetail = openEwalletDetail;

  function closeEwalletDetailModal() {
    const modal = document.getElementById('ewallet-detail-modal');
    if (modal) modal.style.display = 'none';
  }
  window.closeEwalletDetailModal = closeEwalletDetailModal;

  // =========================================================================
  // TAB 2: TREN % EWALLET TOKO INDUK AGEN TIAP BULAN SELAMA 2026
  // =========================================================================

  async function fetchTrenData() {
    const tbody = document.getElementById('tren-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="15" class="text-center" style="padding: 40px; color: var(--text-muted);"><div class="loader">Memuat data Tren E-Wallet Agen 2026...</div></td></tr>`;
    }

    const brand = state.currentBrand;
    const url = `/api/ewallet/tren?brand=${encodeURIComponent(brand)}&year=2026&t=${Date.now()}`;

    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Gagal memuat tren e-wallet');

      state.trenRaw = json;
      renderTrenKPI();
      renderTrenStrip();
      renderTrenControls();
      applyTrenFilters();
    } catch (err) {
      console.error('[Ewallet Tren Error]', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="15" class="text-center" style="padding: 30px; color: var(--negative);">Terjadi kesalahan: ${err.message}</td></tr>`;
      }
    }
  }
  window.fetchTrenData = fetchTrenData;

  function renderTrenKPI() {
    const data = state.trenRaw;
    if (!data || !data.summary) return;
    const s = data.summary;

    const avgEl = document.getElementById('tren-kpi-server-avg');
    if (avgEl) avgEl.textContent = (s.avg_server_pct_ewallet || 0).toFixed(1) + '%';

    const latestEl = document.getElementById('tren-kpi-latest-pct');
    if (latestEl) latestEl.textContent = (s.latest_month_pct || 0).toFixed(1) + '%';

    const totalEl = document.getElementById('tren-kpi-total-agen');
    if (totalEl) totalEl.textContent = Number(s.total_agen || 0).toLocaleString('id-ID');

    const highEl = document.getElementById('tren-kpi-high-count');
    if (highEl) highEl.textContent = Number(s.high_ew_agen_count || 0).toLocaleString('id-ID');
  }

  function renderTrenStrip() {
    const data = state.trenRaw;
    const strip = document.getElementById('tren-server-monthly-strip');
    if (!strip || !data || !data.months || !data.summary) return;

    const mPct = data.summary.monthly_server_pct || {};
    let html = '';

    data.months.forEach(m => {
      const pct = mPct[m.code] !== undefined ? mPct[m.code] : 0.0;
      const isLatest = (m.code === '1026');
      const bg = isLatest ? 'background: rgba(2, 132, 199, 0.12); border-color: #0284c7;' : 'background: var(--surface-bg); border-color: var(--surface-border);';
      const color = isLatest ? '#0284c7' : 'var(--text-main)';

      html += `
        <div style="flex: 1; min-width: 95px; padding: 8px 12px; border: 1px solid; border-radius: 8px; ${bg} display: flex; flex-direction: column; gap: 3px; text-align: center;">
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted);">${m.label}</div>
          <div style="font-size: 15px; font-weight: 800; font-family: var(--font-mono); color: ${color};">${pct.toFixed(1)}%</div>
        </div>
      `;
    });

    strip.innerHTML = html;
  }

  function renderTrenControls() {
    const data = state.trenRaw;
    if (!data) return;

    const cabangSel = document.getElementById('tren-cabang-select');
    if (cabangSel && data.all_cabangs) {
      const cur = state.tren.cabang || 'ALL';
      cabangSel.innerHTML = '<option value="ALL">Semua Cabang</option>' +
        data.all_cabangs.map(c => `<option value="${c}" ${c === cur ? 'selected' : ''}>Cabang ${c}</option>`).join('');
    }

    const scoSel = document.getElementById('tren-sco-select');
    if (scoSel && data.all_scos) {
      const cur = state.tren.sco || 'ALL';
      scoSel.innerHTML = '<option value="ALL">Semua Tim SCO</option>' +
        data.all_scos.map(s => `<option value="${s}" ${s === cur ? 'selected' : ''}>SCO ${s}</option>`).join('');
    }

    const porsiSel = document.getElementById('tren-porsi-select');
    if (porsiSel) {
      porsiSel.value = state.tren.porsi || 'all';
    }
  }

  function applyTrenFilters() {
    const data = state.trenRaw;
    if (!data || !data.rows) return;

    const cabangSel = document.getElementById('tren-cabang-select');
    const scoSel = document.getElementById('tren-sco-select');
    const porsiSel = document.getElementById('tren-porsi-select');
    const searchInput = document.getElementById('tren-search-input');

    const cabang = cabangSel ? cabangSel.value : 'ALL';
    const sco = scoSel ? scoSel.value : 'ALL';
    const porsi = porsiSel ? porsiSel.value : 'all';
    const search = searchInput ? searchInput.value.trim().toLowerCase() : '';

    state.tren.cabang = cabang;
    state.tren.sco = sco;
    state.tren.porsi = porsi;
    state.tren.search = search;

    let filtered = data.rows.slice();

    if (cabang !== 'ALL') {
      filtered = filtered.filter(r => (r.cabang || '').toUpperCase() === cabang.toUpperCase());
    }

    if (sco !== 'ALL') {
      filtered = filtered.filter(r => (r.sco || '').toUpperCase() === sco.toUpperCase());
    }

    if (porsi === 'high') {
      filtered = filtered.filter(r => (r.avg_pct_ewallet || 0) >= 50.0);
    } else if (porsi === 'mid') {
      filtered = filtered.filter(r => (r.avg_pct_ewallet || 0) >= 20.0 && (r.avg_pct_ewallet || 0) < 50.0);
    } else if (porsi === 'low') {
      filtered = filtered.filter(r => (r.avg_pct_ewallet || 0) < 20.0);
    }

    if (search) {
      filtered = filtered.filter(r => {
        const text = [r.agen_id, r.nama_agen, r.cabang, r.sco].filter(Boolean).join(' ').toLowerCase();
        return text.includes(search);
      });
    }

    // Default sorting: total transaksi 2026 terbanyak
    filtered.sort((a, b) => (b.total_hits_2026 || 0) - (a.total_hits_2026 || 0));

    state.tren.filteredRows = filtered;
    renderTrenTable();
  }
  window.applyTrenFilters = applyTrenFilters;

  function clearTrenSearch() {
    const input = document.getElementById('tren-search-input');
    if (input) input.value = '';
    state.tren.page = 1;
    applyTrenFilters();
  }
  window.clearTrenSearch = clearTrenSearch;

  function renderTrenTable() {
    const rows = state.tren.filteredRows || [];
    const data = state.trenRaw;
    const months = (data && data.months) || [];
    const tbody = document.getElementById('tren-tbody');
    const rowCountEl = document.getElementById('tren-table-row-count');
    const pageInfoEl = document.getElementById('tren-table-page-info');
    const pageNumEl = document.getElementById('tren-page-current-num');
    const btnPrev = document.getElementById('btn-tren-page-prev');
    const btnNext = document.getElementById('btn-tren-page-next');

    if (rowCountEl) rowCountEl.textContent = `${rows.length.toLocaleString('id-ID')} baris`;

    if (!rows.length) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="15" class="text-center" style="padding: 40px; color: var(--text-muted);">Tidak ada data Toko Induk Agen yang cocok dengan filter yang dipilih.</td></tr>`;
      }
      if (pageInfoEl) pageInfoEl.textContent = 'Menampilkan 0 dari 0 data';
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = true;
      return;
    }

    const pageSize = state.tren.pageSize || 50;
    const totalPages = Math.ceil(rows.length / pageSize) || 1;
    if (state.tren.page > totalPages) state.tren.page = totalPages;
    if (state.tren.page < 1) state.tren.page = 1;
    const curPage = state.tren.page;

    const startIdx = (curPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, rows.length);
    const pageRows = rows.slice(startIdx, endIdx);

    if (pageInfoEl) {
      pageInfoEl.textContent = `Menampilkan ${startIdx + 1} - ${endIdx} dari ${rows.length.toLocaleString('id-ID')} data`;
    }
    if (pageNumEl) pageNumEl.textContent = `${curPage} / ${totalPages}`;
    if (btnPrev) btnPrev.disabled = (curPage <= 1);
    if (btnNext) btnNext.disabled = (curPage >= totalPages);

    if (!tbody) return;

    let html = '';
    pageRows.forEach((r, idx) => {
      const rowNum = startIdx + idx + 1;
      const limitFormatted = r.limit_saldo ? `Rp ${Number(r.limit_saldo).toLocaleString('id-ID')}` : '-';
      const typeBadge = (r.agent_type === 'Limit')
        ? `<span class="badge" style="background: rgba(2, 132, 199, 0.1); color: #0284c7; font-weight: 700; font-size: 10.5px; padding: 2px 6px;">Limit</span>`
        : `<span class="badge" style="background: var(--table-header); color: var(--text-muted); font-weight: 600; font-size: 10.5px; padding: 2px 6px;">${r.agent_type || '-'}</span>`;

      // Render 10 monthly % columns
      let monthCells = '';
      months.forEach(m => {
        const val = r.months ? r.months[m.code] : null;
        if (val !== null && val !== undefined) {
          const num = Number(val);
          if (num >= 50.0) {
            monthCells += `<td class="text-right"><span style="color: #d97706; font-weight: 800; font-family: var(--font-mono); font-size: 12px;">${num.toFixed(1)}%</span></td>`;
          } else {
            monthCells += `<td class="text-right" style="font-family: var(--font-mono); font-size: 12px; color: var(--text-main); font-weight: 500;">${num.toFixed(1)}%</td>`;
          }
        } else {
          monthCells += `<td class="text-right" style="color: var(--text-muted); font-size: 12px;">-</td>`;
        }
      });

      const avgColor = (r.avg_pct_ewallet >= 50.0) ? '#d97706' : '#0284c7';

      html += `
        <tr>
          <td style="text-align: center; color: var(--text-muted); font-size: 12px;">${rowNum}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 13px;">${r.nama_agen || r.agen_id}</div>
            <div style="font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px;">${r.agen_id}</div>
          </td>
          <td>
            <div style="font-weight: 600; font-size: 12.5px;">Cabang ${r.cabang || '-'}</div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">SCO: ${r.sco || '-'}</div>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 5px;">
              ${typeBadge}
              <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${limitFormatted}</span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">
              Total: ${Number(r.total_hits_2026 || 0).toLocaleString('id-ID')} hit
            </div>
          </td>
          ${monthCells}
          <td class="text-right" style="background: rgba(2, 132, 199, 0.04);">
            <span style="color: ${avgColor}; font-weight: 800; font-family: var(--font-mono); font-size: 13px;">
              ${(r.avg_pct_ewallet || 0).toFixed(1)}%
            </span>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  function prevTrenPage() {
    if (state.tren.page > 1) {
      state.tren.page--;
      renderTrenTable();
    }
  }
  window.prevTrenPage = prevTrenPage;

  function nextTrenPage() {
    const totalPages = Math.ceil((state.tren.filteredRows.length || 1) / (state.tren.pageSize || 50));
    if (state.tren.page < totalPages) {
      state.tren.page++;
      renderTrenTable();
    }
  }
  window.nextTrenPage = nextTrenPage;

  // ── 10. TAB CONTROLLER (EXACT STYLE OF #YOY) ──
  async function switchEwalletTab(tabName) {
    state.currentTab = tabName;
    const btnFraud = document.getElementById('tab-btn-fraud');
    const btnTren = document.getElementById('tab-btn-tren');
    const secFraud = document.getElementById('section-ewallet-fraud');
    const secTren = document.getElementById('section-ewallet-tren');
    const monthGroup = document.getElementById('ewallet-month-select-group');
    const subtitleEl = document.getElementById('ewallet-subtitle-desc');

    if (btnFraud) btnFraud.classList.toggle('active', tabName === 'fraud');
    if (btnTren) btnTren.classList.toggle('active', tabName === 'tren');

    if (secFraud) secFraud.style.display = (tabName === 'fraud') ? 'flex' : 'none';
    if (secTren) secTren.style.display = (tabName === 'tren') ? 'flex' : 'none';

    if (monthGroup) {
      monthGroup.style.display = (tabName === 'fraud') ? 'inline-flex' : 'none';
    }

    if (subtitleEl) {
      if (tabName === 'fraud') {
        subtitleEl.textContent = 'Monitoring Transaksi & Deteksi Fraud E-Wallet (Gestun) - Oktober 2026 MTD';
      } else {
        subtitleEl.textContent = 'Tren Porsi % EWALLET Toko Induk Agen (Limit & Non-Limit) Binaan SCO Tiap Bulan Selama 2026';
      }
    }

    if (tabName === 'tren') {
      if (!state.trenRaw) {
        await fetchTrenData();
      } else {
        renderTrenKPI();
        renderTrenStrip();
        renderTrenControls();
        applyTrenFilters();
      }
    }
  }
  window.switchEwalletTab = switchEwalletTab;

  // ── 11. EXPORT EXCEL (TAB 1 & TAB 2 UNIFIED) ──
  function exportEwalletExcel() {
    if (typeof XLSX === 'undefined') {
      alert('Library SheetJS (XLSX) belum dimuat.');
      return;
    }

    const brand = state.currentBrand;

    if (state.currentTab === 'fraud') {
      const rows = state.filters.filteredRows || [];
      if (!rows.length) {
        alert('Tidak ada data Analisa Fraud E-Wallet untuk diekspor.');
        return;
      }
      const period = state.selectedMonth || '2026-10';
      const cabang = state.filters.cabang === 'ALL' ? 'Semua_Cabang' : state.filters.cabang;
      const headers = [
        'No', 'Kode Reseller', 'Nama Reseller', 'Cabang', 'Tim SCO', 'Toko Induk',
        'Tipe Agen', 'Plafon Limit (Rp)', 'No HP Terdaftar', 'Total Trx Toko',
        'Total Trx EW', '% EWALLET', 'Hits Self-Trx', 'Nominal Self-Trx (Rp)', '% Self-Trx'
      ];
      const sheetData = [headers];
      rows.forEach((r, idx) => {
        sheetData.push([
          idx + 1,
          r.kode_reseller || '',
          r.nama_reseller || '',
          r.cabang || '',
          r.sco || '',
          r.nama_agen || r.root_agen_id || '',
          r.agent_type || '',
          r.limit_saldo || 0,
          r.registered_phone || '',
          r.total_all_hits || 0,
          r.total_ew_hits || 0,
          Number((r.pct_ewallet || 0).toFixed(1)),
          r.self_hits || 0,
          r.self_nominal || 0,
          Number((r.self_pct || 0).toFixed(1))
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Fraud E-Wallet');
      XLSX.writeFile(wb, `Monitoring_Ewallet_Fraud_${brand}_${period}_${cabang}.xlsx`);
    } else {
      const rows = state.tren.filteredRows || [];
      const data = state.trenRaw;
      if (!rows.length || !data) {
        alert('Tidak ada data Tren E-Wallet Agen untuk diekspor.');
        return;
      }
      const cabang = state.tren.cabang === 'ALL' ? 'Semua_Cabang' : state.tren.cabang;
      const months = data.months || [];
      const headers = [
        'No', 'Kode Agen', 'Nama Toko Induk Agen', 'Cabang', 'Tim SCO', 'Tipe Agen',
        'Plafon Limit (Rp)', 'Total Hits 2026', 'Total Hits EW 2026',
        ...months.map(m => m.label + ' (%)'),
        'Avg 2026 (%)'
      ];
      const sheetData = [headers];
      rows.forEach((r, idx) => {
        const mValues = months.map(m => {
          const v = r.months ? r.months[m.code] : null;
          return v !== null && v !== undefined ? Number(Number(v).toFixed(1)) : '-';
        });
        sheetData.push([
          idx + 1,
          r.agen_id || '',
          r.nama_agen || '',
          r.cabang || '',
          r.sco || '',
          r.agent_type || '',
          r.limit_saldo || 0,
          r.total_hits_2026 || 0,
          r.total_ew_hits_2026 || 0,
          ...mValues,
          Number((r.avg_pct_ewallet || 0).toFixed(1))
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tren E-Wallet Agen 2026');
      XLSX.writeFile(wb, `Tren_Ewallet_Agen_2026_${brand}_${cabang}.xlsx`);
    }
  }
  window.exportEwalletExcel = exportEwalletExcel;

})();
