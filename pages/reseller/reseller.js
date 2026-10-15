// pages/reseller/reseller.js — Controller Analisa Customer & Reseller ASTAGA

let resellerState = {
  raw: null,
  activeTab: 'semua_aktif',
  selectedCabang: 'ALL',
  searchQuery: '',
  page: 1,
  pageSize: 50,
  filteredRows: []
};

function formatIDR(val) {
  if (!val || isNaN(val)) return '0';
  return Number(val).toLocaleString('id-ID');
}

function formatPct(val) {
  if (val === undefined || val === null || isNaN(val)) return '0%';
  return Number(val).toFixed(1).replace('.', ',') + '%';
}

window.loadReseller = async function(monthCode = null) {
  const tbody = document.getElementById('reseller-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 40px; color: var(--text-muted);"><div class="loader">Memuat data Customer &amp; Reseller ASTAGA...</div></td></tr>`;
  }

  try {
    let url = '/api/reseller?year=2026';
    if (monthCode) {
      url += `&month=${encodeURIComponent(monthCode)}`;
    }
    const res = await fetch(url + '&t=' + Date.now());
    const json = await res.json();

    if (!json.ok) {
      throw new Error(json.error || 'Gagal memuat data reseller');
    }

    resellerState.raw = json.data;
    renderResellerHeaderAndKPI();
    renderResellerControls();
    applyResellerFilters();
  } catch (err) {
    console.error('Error loadReseller:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 30px; color: var(--negative);">Terjadi kesalahan: ${err.message}</td></tr>`;
    }
  }
};

function renderResellerHeaderAndKPI() {
  const data = resellerState.raw;
  if (!data || !data.kpi) return;

  const k = data.kpi;
  const elReg = document.getElementById('kpi-total-registered');
  const elAct = document.getElementById('kpi-active-current');
  const elRate = document.getElementById('kpi-active-rate');
  const elRet = document.getElementById('kpi-retained');
  const elNewAct = document.getElementById('kpi-new-active');
  const elNewRate = document.getElementById('kpi-new-rate');
  const elReac = document.getElementById('kpi-reactivated');
  const elChu = document.getElementById('kpi-churned');
  const elTrx = document.getElementById('kpi-total-trx');
  const elPew = document.getElementById('kpi-pct-ewallet');

  if (elReg) elReg.textContent = formatIDR(k.total_registered);
  if (elAct) elAct.textContent = formatIDR(k.active_current);
  if (elRate && k.total_registered > 0) {
    const actRate = ((k.active_current / k.total_registered) * 100).toFixed(1).replace('.', ',');
    elRate.textContent = `${actRate}% dari total master`;
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
    const dailyRate = k.daily_rate_total ? Number(k.daily_rate_total).toLocaleString('id-ID', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '0';
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

  const elCS = document.getElementById('count-semua-aktif');
  const elCB = document.getElementById('count-baru');
  const elCReac = document.getElementById('count-reaktivasi');
  const elCR = document.getElementById('count-rutin');
  const elCC = document.getElementById('count-churn');
  const elCE = document.getElementById('count-ewallet');

  if (elCS) elCS.textContent = formatIDR(countSemua);
  if (elCB) elCB.textContent = formatIDR(countBaru);
  if (elCReac) elCReac.textContent = formatIDR(countReaktivasi);
  if (elCR) elCR.textContent = formatIDR(countRutin);
  if (elCC) elCC.textContent = formatIDR(countChurn);
  if (elCE) elCE.textContent = formatIDR(countEwallet);
}

function renderResellerControls() {
  const data = resellerState.raw;
  if (!data) return;

  // Month selector
  const mSelect = document.getElementById('reseller-month-select');
  if (mSelect && data.available_months) {
    mSelect.innerHTML = data.available_months.map(m => {
      const isSel = m === data.selected_month ? 'selected' : '';
      return `<option value="${m}" ${isSel}>${m}</option>`;
    }).join('');
  }

  // Cabang selector
  const cSelect = document.getElementById('reseller-cabang-select');
  if (cSelect && data.all_cabangs) {
    const currentVal = resellerState.selectedCabang;
    let opts = '<option value="ALL">Semua Cabang</option>';
    data.all_cabangs.forEach(c => {
      const isSel = c === currentVal ? 'selected' : '';
      opts += `<option value="${c}" ${isSel}>${c}</option>`;
    });
    cSelect.innerHTML = opts;
  }
}

window.onResellerMonthChange = function(monthCode) {
  if (!monthCode) return;
  window.loadReseller(monthCode);
};

window.setResellerTab = function(tabName, btnElem) {
  resellerState.activeTab = tabName;
  resellerState.page = 1;

  document.querySelectorAll('#status-filter-pills .reseller-tab').forEach(b => b.classList.remove('active'));
  if (btnElem) btnElem.classList.add('active');

  applyResellerFilters();
};

window.applyResellerFilters = function() {
  const data = resellerState.raw;
  if (!data) return;

  const cSelect = document.getElementById('reseller-cabang-select');
  if (cSelect) resellerState.selectedCabang = cSelect.value;

  const sInput = document.getElementById('reseller-search-input');
  if (sInput) resellerState.searchQuery = sInput.value.trim().toLowerCase();

  let source = [];
  if (resellerState.activeTab === 'churn') {
    source = data.churn_rows || [];
  } else if (resellerState.activeTab === 'baru') {
    source = (data.rows || []).filter(r => r.activity_status === 'Member Baru');
  } else if (resellerState.activeTab === 'reaktivasi') {
    source = (data.rows || []).filter(r => r.activity_status === 'Reaktivasi');
  } else if (resellerState.activeTab === 'rutin') {
    source = (data.rows || []).filter(r => r.activity_status === 'Aktif Rutin');
  } else if (resellerState.activeTab === 'ewallet_high') {
    source = (data.rows || []).filter(r => (r.pct_ewallet || 0) >= 50);
  } else {
    source = data.rows || [];
  }

  // Filter Cabang
  if (resellerState.selectedCabang !== 'ALL') {
    source = source.filter(r => (r.cabang || '').toUpperCase() === resellerState.selectedCabang.toUpperCase());
  }

  // Filter Search
  if (resellerState.searchQuery) {
    const q = resellerState.searchQuery;
    source = source.filter(r => {
      const k = (r.kode || '').toLowerCase();
      const n = (r.name || '').toLowerCase();
      const s = (r.sco || '').toLowerCase();
      const a = (r.agen_name || '').toLowerCase();
      return k.includes(q) || n.includes(q) || s.includes(q) || a.includes(q);
    });
  }

  // Toggle Clear Button
  const btnClear = document.getElementById('btn-clear-search');
  if (btnClear) {
    btnClear.style.display = sInput && sInput.value ? 'flex' : 'none';
  }

  // Sort
  const sortSelect = document.getElementById('reseller-sort-select');
  const sortMode = sortSelect ? sortSelect.value : 'daily_desc';

  if (sortMode === 'growth_desc') {
    source.sort((a, b) => {
      const gA = a.growth_daily !== undefined ? a.growth_daily : 0;
      const gB = b.growth_daily !== undefined ? b.growth_daily : 0;
      if (gA !== gB) return gB - gA;
      return (b.growth_daily_pct || 0) - (a.growth_daily_pct || 0);
    });
  } else if (sortMode === 'growth_asc') {
    source.sort((a, b) => {
      const gA = a.growth_daily !== undefined ? a.growth_daily : 0;
      const gB = b.growth_daily !== undefined ? b.growth_daily : 0;
      if (gA !== gB) return gA - gB;
      return (a.growth_daily_pct || 0) - (b.growth_daily_pct || 0);
    });
  } else if (sortMode === 'ewallet_desc') {
    source.sort((a, b) => (b.pct_ewallet || 0) - (a.pct_ewallet || 0));
  } else if (sortMode === 'total_desc') {
    source.sort((a, b) => (b.total_trx || 0) - (a.total_trx || 0));
  } else {
    // Default: daily_desc
    source.sort((a, b) => (b.daily_curr || 0) - (a.daily_curr || 0));
  }

  resellerState.filteredRows = source;
  resellerState.page = 1;
  renderResellerTable();
};

window.clearResellerSearch = function() {
  const sInput = document.getElementById('reseller-search-input');
  if (sInput) {
    sInput.value = '';
    sInput.focus();
  }
  window.applyResellerFilters();
};

function renderResellerTable() {
  const tbody = document.getElementById('reseller-tbody');
  const countEl = document.getElementById('table-row-count');
  const pageInfo = document.getElementById('table-page-info');
  const pageNum = document.getElementById('page-current-num');
  const btnPrev = document.getElementById('btn-page-prev');
  const btnNext = document.getElementById('btn-page-next');
  const titleEl = document.getElementById('table-title');

  const total = resellerState.filteredRows.length;
  if (countEl) countEl.textContent = `${formatIDR(total)} reseller`;

  if (titleEl) {
    const tabLabels = {
      semua_aktif: 'Daftar Semua Reseller Aktif',
      baru: 'Reseller Member Baru (Daftar & Transaksi Bulan Ini)',
      reaktivasi: 'Reseller Reaktivasi (Akun Lama Belanja Kembali)',
      rutin: 'Reseller Aktif Rutin (Retained)',
      churn: 'Reseller Pasif / Churn (Bulan Lalu Aktif, Bulan Ini 0)',
      ewallet_high: 'Reseller Dominan EWALLET (Porsi ≥ 50%)'
    };
    titleEl.textContent = tabLabels[resellerState.activeTab] || 'Daftar Reseller';
  }

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 30px; color: var(--text-muted);">Tidak ada data reseller yang cocok dengan filter.</td></tr>`;
    if (pageInfo) pageInfo.textContent = 'Menampilkan 0 dari 0 data';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const startIdx = (resellerState.page - 1) * resellerState.pageSize;
  const endIdx = Math.min(startIdx + resellerState.pageSize, total);
  const pageRows = resellerState.filteredRows.slice(startIdx, endIdx);

  if (pageInfo) {
    pageInfo.textContent = `Menampilkan ${startIdx + 1} - ${endIdx} dari ${formatIDR(total)} data`;
  }
  if (pageNum) pageNum.textContent = resellerState.page;
  if (btnPrev) btnPrev.disabled = resellerState.page <= 1;
  if (btnNext) btnNext.disabled = endIdx >= total;

  let html = '';
  pageRows.forEach((r, idx) => {
    const rowNum = startIdx + idx + 1;
    const isChurn = resellerState.activeTab === 'churn' || r.activity_status === 'Pasif / Churn';

    // Status Pill
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

    // % EWALLET Badge
    const pctEw = r.pct_ewallet || 0;
    let ewBadge = '';
    if (isChurn) {
      ewBadge = `<span style="color: var(--text-muted);">-</span>`;
    } else if (pctEw >= 50) {
      ewBadge = `<span class="pill badge-ewallet-high">${formatPct(pctEw)}</span>`;
    } else {
      ewBadge = `<span class="pill badge-ewallet-normal">${formatPct(pctEw)}</span>`;
    }

    // Mini Product Composition
    let compHtml = '';
    if (isChurn) {
      compHtml = `<span style="font-size: 11.5px; color: var(--text-muted);">Bln lalu: ${formatIDR(r.prev_trx || 0)} trx</span>`;
    } else {
      compHtml = `
        <div style="font-size: 11.5px; display: flex; gap: 6px; flex-wrap: wrap;">
          <span style="color: #1d4ed8; font-weight: 600;">EW: ${formatIDR(r.ewallet_trx || 0)}</span>
          <span style="color: #15803d;">TEL: ${formatIDR(r.telco_trx || 0)}</span>
          <span style="color: #a16207;">PP: ${formatIDR(r.ppob_trx || 0)}</span>
          <span style="color: #7e22ce;">PLN: ${formatIDR(r.token_trx || 0)}</span>
        </div>
      `;
    }

    html += `
      <tr style="cursor: pointer;" onclick="openResellerModal('${encodeURIComponent(r.kode)}')">
        <td class="text-center" style="color: var(--text-muted); font-size: 12px;">${rowNum}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 13.5px;">${escapeHtml(r.kode)}</div>
          <div style="font-size: 12px; color: var(--text-muted); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(r.name)}">
            ${escapeHtml(r.name)}
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge" style="font-size: 11px; padding: 2px 7px;">${escapeHtml(r.cabang || '-')}</span>
          </div>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 3px;">
            SCO: <strong>${escapeHtml(r.sco || '-')}</strong> ${r.tgl_daftar && r.tgl_daftar !== '-' ? `• <span style="font-size: 10.5px; color: var(--text-muted);">Reg: ${escapeHtml(r.tgl_daftar.split(' ')[0])}</span>` : ''}
          </div>
        </td>
        <td>
          <div style="font-size: 12px; font-weight: 600; color: var(--text-main);">
            ${escapeHtml(r.jadwal || '-')}
          </div>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px; display: flex; align-items: center; gap: 4px;">
            <span class="badge" style="font-size: 10px; padding: 1px 5px; ${r.type === 'Limit' ? 'background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe;' : (r.type === 'Prima' ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;' : 'background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;')}">${escapeHtml(r.type || 'Non Limit')}</span>
            <span>Rp ${formatIDR(r.limit || 0)}</span>
          </div>
        </td>
        <td class="text-right font-semibold" style="font-size: 13.5px; color: var(--text-main);">
          ${
            isChurn ? `
              <div style="font-size: 13px; font-weight: 700; color: var(--text-muted);">0 / hari</div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 1px;">Bln lalu: ${(r.daily_prev || 0).toLocaleString('id-ID', {minimumFractionDigits: 1, maximumFractionDigits: 1})} / hari</div>
              <div style="margin-top: 4px;">
                <span class="pill negative" style="font-weight: 700; font-size: 11px; padding: 2px 7px; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;">
                  Drop 100% (-${(r.daily_prev || 0).toLocaleString('id-ID', {minimumFractionDigits: 1, maximumFractionDigits: 1})} / hr)
                </span>
              </div>
              <div style="font-size: 10px; color: var(--text-muted); margin-top: 3px;">
                (Total: 0 vs ${formatIDR(r.prev_trx || 0)})
              </div>
            ` : `
              <div style="font-size: 13.5px; font-weight: 700; color: var(--text-main);">${(r.daily_curr || 0).toLocaleString('id-ID', {minimumFractionDigits: 1, maximumFractionDigits: 1})} / hari</div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 1px;">Bln lalu: ${(r.daily_prev || 0).toLocaleString('id-ID', {minimumFractionDigits: 1, maximumFractionDigits: 1})} / hari</div>
              <div style="margin-top: 4px;">
                <span class="pill ${r.growth_daily >= 0 ? 'positive' : 'negative'}" style="font-weight: 700; font-size: 11px; padding: 2px 7px; ${r.growth_daily >= 0 ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;' : 'background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;'}">
                  ${r.growth_daily >= 0 ? '+' : ''}${(r.growth_daily || 0).toLocaleString('id-ID', {minimumFractionDigits: 1, maximumFractionDigits: 1})} / hr (${(r.growth_daily_pct || 0) > 0 ? '+' : ''}${formatPct(r.growth_daily_pct)})
                </span>
              </div>
              <div style="font-size: 10px; color: var(--text-muted); margin-top: 3px;">
                (Total: ${formatIDR(r.total_trx || 0)} vs ${formatIDR(r.prev_trx || 0)})
              </div>
            `
          }
        </td>
        <td class="text-right font-semibold" style="color: #2563eb;">
          ${formatIDR(r.ewallet_trx || 0)}
        </td>
        <td class="text-right">
          ${ewBadge}
        </td>
        <td>
          ${compHtml}
        </td>
        <td class="text-center">
          ${statusBadge}
        </td>
        <td class="text-center">
          <button type="button" class="reseller-btn-page" style="padding: 3px 8px; font-size: 11px;" onclick="event.stopPropagation(); openResellerModal('${encodeURIComponent(r.kode)}')">
            Detail
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

window.prevResellerPage = function() {
  if (resellerState.page > 1) {
    resellerState.page--;
    renderResellerTable();
  }
};

window.nextResellerPage = function() {
  const maxPage = Math.ceil(resellerState.filteredRows.length / resellerState.pageSize);
  if (resellerState.page < maxPage) {
    resellerState.page++;
    renderResellerTable();
  }
};

window.openResellerModal = function(encodedKode) {
  const kode = decodeURIComponent(encodedKode);
  const data = resellerState.raw;
  if (!data) return;

  // Cari di rows atau churn_rows
  let item = (data.rows || []).find(r => r.kode === kode);
  if (!item) {
    item = (data.churn_rows || []).find(r => r.kode === kode);
  }
  if (!item) return;

  document.getElementById('modal-reseller-title').textContent = item.name || item.kode;
  document.getElementById('modal-reseller-kode').textContent = `Kode Reseller: ${item.kode}`;
  document.getElementById('modal-cabang').textContent = item.cabang || '-';
  document.getElementById('modal-sco').textContent = item.sco || '-';
  document.getElementById('modal-agen-id').textContent = `${item.agen_id || '-'} (${item.agen_name || '-'})`;
  document.getElementById('modal-jadwal').textContent = item.jadwal || '-';
  document.getElementById('modal-limit').textContent = `Rp ${formatIDR(item.limit || 0)}`;
  const typeEl = document.getElementById('modal-type');
  if (typeEl) {
    typeEl.textContent = item.type || 'Non Limit';
    typeEl.className = `pill ${item.type === 'Limit' ? 'positive' : ''}`;
  }

  const tglDaftarEl = document.getElementById('modal-tgl-daftar');
  if (tglDaftarEl) tglDaftarEl.textContent = item.tgl_daftar || '-';

  const statusEl = document.getElementById('modal-status');
  if (statusEl) {
    statusEl.textContent = item.activity_status || '-';
    if (item.activity_status === 'Pasif / Churn') {
      statusEl.className = 'pill negative';
      statusEl.style.background = '';
      statusEl.style.color = '';
      statusEl.style.border = '';
    } else if (item.activity_status === 'Member Baru') {
      statusEl.className = 'pill';
      statusEl.style.background = '#e0f2fe';
      statusEl.style.color = '#0284c7';
      statusEl.style.border = '1px solid #bae6fd';
    } else if (item.activity_status === 'Reaktivasi') {
      statusEl.className = 'pill';
      statusEl.style.background = '#fef3c7';
      statusEl.style.color = '#b45309';
      statusEl.style.border = '1px solid #fde68a';
    } else {
      statusEl.className = 'pill positive';
      statusEl.style.background = '';
      statusEl.style.color = '';
      statusEl.style.border = '';
    }
  }

  // Komposisi
  const tot = item.total_trx || 0;
  const ew = item.ewallet_trx || 0;
  const pctEw = item.pct_ewallet || 0;

  document.getElementById('modal-ewallet-trx').textContent = formatIDR(ew);
  document.getElementById('modal-ewallet-pct').textContent = formatPct(pctEw);
  document.getElementById('modal-telco-trx').textContent = formatIDR(item.telco_trx || 0);
  document.getElementById('modal-ppob-trx').textContent = formatIDR(item.ppob_trx || 0);
  document.getElementById('modal-token-trx').textContent = formatIDR(item.token_trx || 0);

  document.getElementById('modal-bar-pct').textContent = formatPct(pctEw);
  document.getElementById('modal-bar-tot').textContent = formatIDR(tot);

  const fillEl = document.getElementById('modal-bar-fill');
  if (fillEl) {
    fillEl.style.width = `${Math.min(pctEw, 100)}%`;
    if (pctEw >= 50) {
      fillEl.style.background = '#dc2626';
    } else {
      fillEl.style.background = '#2563eb';
    }
  }

  const modal = document.getElementById('reseller-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeResellerModal = function() {
  const modal = document.getElementById('reseller-modal');
  if (modal) modal.style.display = 'none';
};

// Tutup modal jika klik di luar box
document.addEventListener('click', function(e) {
  const modal = document.getElementById('reseller-modal');
  if (modal && modal.style.display === 'flex' && e.target === modal) {
    modal.style.display = 'none';
  }
});

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

window.exportResellerExcel = async function() {
  const rows = resellerState.filteredRows;
  if (!rows || rows.length === 0) {
    alert('Tidak ada data reseller yang cocok dengan filter untuk diekspor.');
    return;
  }

  const period = (resellerState.raw && resellerState.raw.selected_month) || '2026';
  const isChurn = resellerState.activeTab === 'churn';

  const tabLabels = {
    semua_aktif: 'Semua_Aktif',
    baru: 'Member_Baru_Trx',
    reaktivasi: 'Reaktivasi',
    rutin: 'Aktif_Rutin',
    churn: 'Pasif_Churn',
    ewallet_high: 'Dominan_EWALLET'
  };
  const tabName = tabLabels[resellerState.activeTab] || resellerState.activeTab;
  const cabangName = resellerState.selectedCabang === 'ALL' ? 'Semua_Cabang' : resellerState.selectedCabang.replace(/\s+/g, '_');

  try {
    await ensureXlsxLoaded();
  } catch (err) {
    console.warn('XLSX library gagal dimuat, menggunakan fallback CSV:', err);
    return exportResellerCSVFallback();
  }

  // Header definisi
  const headers = isChurn ? [
    'No',
    'Kode Reseller',
    'Nama Reseller',
    'Cabang',
    'Nama Agen',
    'Agen ID',
    'SCO',
    'Jadwal Kunjungan',
    'Limit (Rp)',
    'Tgl. Daftar',
    'Daily Trx (Bulan Ini)',
    'Daily Trx (Bulan Lalu)',
    'Daily Growth',
    'Daily Growth %',
    'Total Trx Bulan Lalu',
    'Status Keaktifan'
  ] : [
    'No',
    'Kode Reseller',
    'Nama Reseller',
    'Cabang',
    'Nama Agen',
    'Agen ID',
    'SCO',
    'Jadwal Kunjungan',
    'Limit (Rp)',
    'Tgl. Daftar',
    'Daily Trx (Bulan Ini)',
    'Daily Trx (Bulan Lalu)',
    'Daily Growth',
    'Daily Growth %',
    'Total Trx',
    'Trx EWALLET',
    '% EWALLET',
    'Trx TELCO',
    'Trx PPOB',
    'Trx TOKEN PLN',
    'Status Keaktifan'
  ];

  const sheetData = [headers];

  rows.forEach((r, idx) => {
    if (isChurn) {
      sheetData.push([
        idx + 1,
        r.kode || '',
        r.name || '',
        r.cabang || '',
        r.agen_name || '-',
        r.agen_id || '-',
        r.sco || '-',
        r.jadwal || '-',
        Number(r.limit) || 0,
        r.tgl_daftar || '-',
        0,
        Number(r.daily_prev) || 0,
        Number(r.growth_daily) || 0,
        -1.0,
        Number(r.prev_trx) || 0,
        r.activity_status || 'Pasif / Churn'
      ]);
    } else {
      sheetData.push([
        idx + 1,
        r.kode || '',
        r.name || '',
        r.cabang || '',
        r.agen_name || '-',
        r.agen_id || '-',
        r.sco || '-',
        r.jadwal || '-',
        Number(r.limit) || 0,
        r.tgl_daftar || '-',
        Number(r.daily_curr) || 0,
        Number(r.daily_prev) || 0,
        Number(r.growth_daily) || 0,
        Number(r.growth_daily_pct ? (r.growth_daily_pct / 100).toFixed(3) : 0),
        Number(r.total_trx) || 0,
        Number(r.ewallet_trx) || 0,
        Number(r.pct_ewallet ? (r.pct_ewallet / 100).toFixed(3) : 0),
        Number(r.telco_trx) || 0,
        Number(r.ppob_trx) || 0,
        Number(r.token_trx) || 0,
        r.activity_status || 'Aktif Rutin'
      ]);
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Formatting % EWALLET & Growth %
  if (!isChurn) {
    for (let r = 1; r < sheetData.length; r++) {
      const cellEw = XLSX.utils.encode_cell({ r: r, c: 16 });
      if (ws[cellEw]) ws[cellEw].z = '0.0%';
      const cellGw = XLSX.utils.encode_cell({ r: r, c: 13 });
      if (ws[cellGw]) ws[cellGw].z = '0.0%';
    }
  }

  // Formatting Number Limit
  const limitCol = 8;
  for (let r = 1; r < sheetData.length; r++) {
    const cell = XLSX.utils.encode_cell({ r: r, c: limitCol });
    if (ws[cell]) {
      ws[cell].z = '#,##0';
    }
  }

  // Auto-width kolom
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
  const sheetTitle = isChurn ? 'Reseller Churn' : 'Customer & Reseller';
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle);

  const filename = `Reseller_ASTAGA_${period}_${tabName}_${cabangName}.xlsx`;
  XLSX.writeFile(wb, filename);
};

// Fallback CSV jika terjadi kendala pada XLSX
async function exportResellerCSVFallback() {
  const rows = resellerState.filteredRows;
  const period = (resellerState.raw && resellerState.raw.selected_month) || '2026';
  const headers = ['Kode', 'Nama', 'Cabang', 'SCO', 'Agen ID', 'Jadwal', 'Limit', 'Total Trx', 'Trx EWALLET', '% EWALLET', 'Trx Telco', 'Trx PPOB', 'Trx PLN', 'Status Keaktifan'];
  
  const csvLines = [headers.join(',')];
  rows.forEach(r => {
    const line = [
      `"${r.kode || ''}"`,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${r.cabang || ''}"`,
      `"${r.sco || ''}"`,
      `"${r.agen_id || ''}"`,
      `"${r.jadwal || ''}"`,
      r.limit || 0,
      r.total_trx || 0,
      r.ewallet_trx || 0,
      r.pct_ewallet || 0,
      r.telco_trx || 0,
      r.ppob_trx || 0,
      r.token_trx || 0,
      `"${r.activity_status || ''}"`
    ];
    csvLines.push(line.join(','));
  });

  const filename = `Reseller_ASTAGA_${period}_${resellerState.activeTab}.csv`;
  const csvContent = csvLines.join('\n');
  if (typeof window.saveFileSmart === "function") {
    await window.saveFileSmart(filename, csvContent, 'text/csv;charset=utf-8;');
  } else {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Kompatibilitas alias fungsi lama
window.exportResellerData = window.exportResellerExcel;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
