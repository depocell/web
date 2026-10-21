/**
 * pages/survey/survey.js
 * Controller Modul Survei Interaktif AI & Reaktivasi Reseller
 */

const surveyState = {
  brand: 'ASTAGA',
  period: '2026-10',
  activeTab: 'list',
  candidates: [],
  filteredCandidates: [],
  logs: [],
  filteredLogs: [],
  gateway: {
    connected: false,
    phone: null
  },
  currentCandidate: null,
  batchCandidates: [],
  waStatus: {},
  donutChart: null,
  barChart: null,
  gatewayInterval: null
};

// =========================================================================
// ENTRY POINT (Loaded by app.js router)
// =========================================================================
function loadSurveyPage() {
  surveyState.brand = 'ASTAGA';
  surveyState.period = '2026-10';

  checkGatewayStatus();
  if (surveyState.gatewayInterval) clearInterval(surveyState.gatewayInterval);
  surveyState.gatewayInterval = setInterval(checkGatewayStatus, 5000);

  loadSurveyCandidates();
}
window.loadSurveyPage = loadSurveyPage;

// =========================================================================
// GATEWAY CHECK & UTILITIES
// =========================================================================
async function checkGatewayStatus() {
  const badgeDot = document.getElementById('gateway-status-dot');
  const badgeText = document.getElementById('gateway-status-text');

  try {
    const res = await fetch('/api/survey/gateway-status');
    const json = await res.json();

    if (json.connected) {
      surveyState.gateway.connected = true;
      surveyState.gateway.phone = json.phone;
      if (badgeDot) badgeDot.style.background = '#16a34a'; // Green
      if (badgeText) {
        badgeText.style.color = '#15803d';
        badgeText.textContent = `Online (+${json.phone})`;
      }
    } else {
      surveyState.gateway.connected = false;
      surveyState.gateway.phone = null;
      if (badgeDot) badgeDot.style.background = '#dc2626'; // Red
      if (badgeText) {
        badgeText.style.color = '#b91c1c';
        badgeText.textContent = 'Gateway Offline';
      }
    }
  } catch (err) {
    if (badgeDot) badgeDot.style.background = '#94a3b8';
    if (badgeText) {
      badgeText.style.color = 'var(--text-muted)';
      badgeText.textContent = 'Gateway Standby';
    }
  }
}
window.checkGatewayStatus = checkGatewayStatus;

function showGatewayInfoModal() {
  const modal = document.getElementById('gateway-info-modal');
  if (modal) modal.style.display = 'flex';
}
window.showGatewayInfoModal = showGatewayInfoModal;

function closeGatewayInfoModal() {
  const modal = document.getElementById('gateway-info-modal');
  if (modal) modal.style.display = 'none';
}
window.closeGatewayInfoModal = closeGatewayInfoModal;

async function resetWaSessionAction() {
  if (!confirm('Apakah Anda yakin ingin mereset sesi WhatsApp bot?\nSesi lama akan dihapus agar Anda bisa scan QR dengan nomor baru.')) {
    return;
  }

  try {
    const res = await fetch('/api/survey/reset-session', { method: 'POST' });
    const json = await res.json();
    if (json.ok) {
      alert('Sesi WhatsApp berhasil direset!\nSilakan tutup lalu jalankan kembali "run_wa_gateway.bat" untuk scan QR nomor baru.');
      checkGatewayStatus();
    } else {
      alert('Gagal reset sesi: ' + (json.error || 'Terjadi kesalahan'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
window.resetWaSessionAction = resetWaSessionAction;

// =========================================================================
// TAB SWITCHING
// =========================================================================
function switchSurveyTab(tabName, btnElem) {
  surveyState.activeTab = tabName;

  document.querySelectorAll('.survey-tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`survey-tab-${tabName}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.survey-page-wrapper .reseller-tab').forEach(b => {
    b.classList.remove('active');
    b.style.borderBottom = 'none';
    b.style.color = 'var(--text-muted)';
  });

  if (btnElem) {
    btnElem.classList.add('active');
    btnElem.style.borderBottom = '2px solid #4f46e5';
    btnElem.style.color = '#4f46e5';
  }

  if (tabName === 'logs') {
    loadSurveyLogs();
  } else if (tabName === 'chart') {
    renderSurveyCharts();
  }
}
window.switchSurveyTab = switchSurveyTab;

function setSurveyBrand(brand) {
  surveyState.brand = brand;
  const bAstaga = document.getElementById('survey-brand-astaga');
  const bOkipay = document.getElementById('survey-brand-okipay');

  if (brand === 'ASTAGA') {
    if (bAstaga) { bAstaga.style.background = '#4f46e5'; bAstaga.style.color = '#fff'; }
    if (bOkipay) { bOkipay.style.background = 'none'; bOkipay.style.color = 'var(--text-muted)'; }
  } else {
    if (bOkipay) { bOkipay.style.background = '#4f46e5'; bOkipay.style.color = '#fff'; }
    if (bAstaga) { bAstaga.style.background = 'none'; bAstaga.style.color = 'var(--text-muted)'; }
  }

  loadSurveyCandidates();
  if (surveyState.activeTab === 'logs') loadSurveyLogs();
  if (surveyState.activeTab === 'chart') renderSurveyCharts();
}
window.setSurveyBrand = setSurveyBrand;

// =========================================================================
// TAB 1: CANDIDATES LOGIC
// =========================================================================
async function loadSurveyCandidates() {
  const tbody = document.getElementById('survey-candidate-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding: 30px; text-align: center; color: var(--text-muted);">Memuat daftar reseller pasif/churn...</td></tr>';
  }

  try {
    const res = await fetch(`/api/survey/candidates?brand=${encodeURIComponent(surveyState.brand)}&month=${encodeURIComponent(surveyState.period)}`);
    const json = await res.json();

    if (json.ok && Array.isArray(json.candidates)) {
      surveyState.candidates = json.candidates;

      const cnt = document.getElementById('survey-count-target');
      if (cnt) cnt.textContent = json.summary.total_churn || json.candidates.length;

      const batchText = document.getElementById('btn-survey-batch-text');
      if (batchText) batchText.textContent = `Survei AI Batch (${json.candidates.length})`;

      // Populate cabang filter dropdown
      populateCabangFilter(json.candidates);
      applySurveyFilters();

      // Cek status validitas nomor WhatsApp di latar belakang (Pre-Check Otomatis)
      checkCandidatesWaStatus(json.candidates);
    } else {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="padding: 24px; text-align: center; color: #ef4444;">Gagal mengambil data kandidat.</td></tr>';
    }
  } catch (err) {
    console.error('Error loadSurveyCandidates:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="padding: 24px; text-align: center; color: #ef4444;">Error: ${err.message}</td></tr>`;
  }
}
window.loadSurveyCandidates = loadSurveyCandidates;

function populateCabangFilter(candidates) {
  const sel = document.getElementById('survey-filter-cabang');
  if (!sel) return;

  const currentVal = sel.value;
  const cabangs = Array.from(new Set(candidates.map(c => c.cabang).filter(Boolean))).sort();

  sel.innerHTML = '<option value="ALL">Semua Cabang</option>' + 
    cabangs.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  if (cabangs.includes(currentVal)) {
    sel.value = currentVal;
  }
}

async function checkCandidatesWaStatus(candidates) {
  // 1. Kumpulkan seluruh nomor unik (primary no_wa + seluruh candidate_phones)
  const phoneSet = new Set();
  (candidates || []).forEach(c => {
    if (c.no_wa) phoneSet.add(c.no_wa);
    if (Array.isArray(c.candidate_phones)) {
      c.candidate_phones.forEach(p => p && phoneSet.add(p));
    }
  });

  const phones = Array.from(phoneSet);
  if (phones.length === 0) return;

  try {
    const res = await fetch('/api/survey/check-phones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones })
    });
    const json = await res.json();
    if (json.ok && json.results) {
      surveyState.waStatus = { ...surveyState.waStatus, ...json.results };

      // 2. SMART MULTI-NUMBER PROMOTION:
      // Jika no_wa awal tidak aktif di WA (false/null), tapi salah satu candidate_phones AKTIF (true),
      // otomatis promosikan nomor aktif tersebut menjadi no_wa utama!
      (candidates || []).forEach(c => {
        const isCurrentActive = surveyState.waStatus[c.no_wa] === true;
        if (!isCurrentActive && Array.isArray(c.candidate_phones)) {
          const activeWinner = c.candidate_phones.find(p => surveyState.waStatus[p] === true);
          if (activeWinner && activeWinner !== c.no_wa) {
            console.log(`[SmartWA] Promoted active number for ${c.reseller_id}: ${c.no_wa} -> ${activeWinner}`);
            c.no_wa = activeWinner;
            // Sinkronkan ke database server secara background
            fetch('/api/survey/update-primary-phone', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kode_reseller: c.reseller_id, active_phone: activeWinner })
            }).catch(() => {});
          }
        }
      });

      renderCandidatesTable();
      const modal = document.getElementById('survey-batch-modal');
      if (modal && modal.style.display !== 'none') {
        renderBatchTable();
      }
    }
  } catch (err) {
    console.debug('checkCandidatesWaStatus error:', err);
  }
}
window.checkCandidatesWaStatus = checkCandidatesWaStatus;

function applySurveyFilters() {
  const tSel = document.getElementById('survey-filter-trx');
  const cSel = document.getElementById('survey-filter-cabang');
  const sInput = document.getElementById('survey-search-input');

  const selectedTrx = tSel ? tSel.value : 'GT5';
  const selectedCabang = cSel ? cSel.value : 'ALL';
  const query = sInput ? sInput.value.trim().toLowerCase() : '';

  let list = surveyState.candidates.slice();

  // 1. Filter Volume Transaksi
  if (selectedTrx === 'GT5') {
    list = list.filter(c => (c.prev_trx || 0) > 5);
  }

  // 2. Filter Cabang
  if (selectedCabang !== 'ALL') {
    list = list.filter(c => (c.cabang || '').toUpperCase() === selectedCabang.toUpperCase());
  }

  // 3. Search Box
  if (query) {
    list = list.filter(c => {
      const id = (c.reseller_id || '').toLowerCase();
      const n = (c.reseller_name || '').toLowerCase();
      const a = (c.agen_name || '').toLowerCase();
      const sco = (c.sco_name || '').toLowerCase();
      const p = (c.no_wa || '').toLowerCase();
      return id.includes(query) || n.includes(query) || a.includes(query) || sco.includes(query) || p.includes(query);
    });
  }

  surveyState.filteredCandidates = list;
  renderCandidatesTable();

  const cnt = document.getElementById('survey-count-target');
  if (cnt) cnt.textContent = list.length;

  const batchText = document.getElementById('btn-survey-batch-text');
  if (batchText) {
    batchText.textContent = `Survei AI Batch (${list.length})`;
  }
}
window.applySurveyFilters = applySurveyFilters;

function renderCandidatesTable() {
  const tbody = document.getElementById('survey-candidate-tbody');
  if (!tbody) return;

  const list = surveyState.filteredCandidates;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding: 30px; text-align: center; color: var(--text-muted);">Tidak ada reseller yang cocok dengan filter.</td></tr>';
    return;
  }

  let html = '';
  list.forEach((c, idx) => {
    let phone = '<span style="color: #ef4444; font-size: 11px;">Belum Ada</span>';
    if (c.no_wa) {
      const hasWa = surveyState.waStatus[c.no_wa];
      const multiBadge = (c.candidate_count && c.candidate_count > 1)
        ? `<span class="badge" style="background: var(--table-header); color: var(--text-muted); font-size: 9.5px; padding: 1px 5px; font-weight: 600; margin-left: 4px; border: 1px solid var(--surface-border);" title="Tersedia total ${c.candidate_count} nomor pengirim OtomaX">+${c.candidate_count - 1} no</span>`
        : '';

      if (hasWa === true) {
        phone = `
          <div style="font-family: monospace; font-weight: 700; color: #16a34a; display: inline-flex; align-items: center; gap: 6px;" title="Terverifikasi: Akun WhatsApp Aktif">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: #16a34a; display: inline-block;"></span>
            <span>${escapeHtml(c.no_wa)}</span>
            ${multiBadge}
          </div>
        `;
      } else if (hasWa === false) {
        phone = `
          <div style="font-family: monospace; font-weight: 500; color: #94a3b8; display: inline-flex; align-items: center; gap: 6px;" title="Nomor tidak terdaftar di WhatsApp">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: #94a3b8; display: inline-block;"></span>
            <span style="opacity: 0.85;">${escapeHtml(c.no_wa)}</span>
            <span class="badge" style="background: #f1f5f9; color: #64748b; font-size: 10px; padding: 1px 5px; font-weight: 600;">Non-WA</span>
            ${multiBadge}
          </div>
        `;
      } else {
        phone = `
          <div style="font-family: monospace; font-weight: 600; color: var(--text-main); display: inline-flex; align-items: center; gap: 6px;">
            <span>${escapeHtml(c.no_wa)}</span>
            ${multiBadge}
          </div>
        `;
      }
    }
    
    let statusBadge = '<span class="badge" style="background: var(--table-header); color: var(--text-muted);">Belum</span>';
    if (c.status === 'REPLIED') {
      statusBadge = '<span class="badge" style="background: #dcfce7; color: #15803d; font-weight: 700;">Sudah Balas</span>';
    } else if (c.status === 'SENT' || c.status === 'TEST_SENT') {
      statusBadge = '<span class="badge" style="background: #e0f2fe; color: #0369a1; font-weight: 600;">Terkirim</span>';
    } else if (c.status === 'NOT_ON_WA') {
      statusBadge = '<span class="badge" style="background: #fee2e2; color: #dc2626; font-weight: 700;">Tidak Ada WA</span>';
    }

    const indukDisplay = c.agen_name && c.agen_name !== '-' ? escapeHtml(c.agen_name) : '<span style="color: var(--text-muted);">-</span>';

    html += `
      <tr style="border-bottom: 1px solid var(--surface-border);">
        <td style="padding: 10px 14px; text-align: center; color: var(--text-muted); font-size: 11px;">${idx + 1}</td>
        <td style="padding: 10px 14px;">
          <strong style="color: var(--text-main); font-size: 13px; display: block;">${escapeHtml(c.reseller_name || c.reseller_id)}</strong>
          <span style="font-size: 11px; font-family: monospace; color: var(--primary);">${escapeHtml(c.reseller_id)}</span>
        </td>
        <td style="padding: 10px 14px; font-size: 12px;">
          ${indukDisplay}
        </td>
        <td style="padding: 10px 14px;">
          <div style="font-weight: 600; font-size: 12.5px;">${escapeHtml(c.cabang || '-')}</div>
          <div style="font-size: 11px; color: var(--text-muted);">SCO: ${escapeHtml(c.sco_name || '-')}</div>
        </td>
        <td style="padding: 10px 14px; text-align: center; font-weight: 800; color: #0284c7; font-size: 13.5px;">
          ${(c.prev_trx || 0).toLocaleString('id-ID')}
        </td>
        <td style="padding: 10px 14px;">
          ${phone}
        </td>
        <td style="padding: 10px 14px; text-align: center;">
          ${statusBadge}
        </td>
        <td style="padding: 10px 14px; text-align: center;">
          <button type="button" onclick="openSurveyModal('${escapeHtml(c.reseller_id)}', '${escapeHtml(c.reseller_name || c.reseller_id)}', '${escapeHtml(c.cabang || '-')}', '${escapeHtml(c.sco_name || '-')}', ${c.prev_trx || 0})"
            style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 6px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Survei
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// =========================================================================
// TAB 2: LOGS LOGIC
// =========================================================================
async function loadSurveyLogs() {
  const tbody = document.getElementById('survey-logs-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding: 30px; text-align: center; color: var(--text-muted);">Memuat riwayat log survei...</td></tr>';
  }

  try {
    const res = await fetch(`/api/survey/logs?brand=${encodeURIComponent(surveyState.brand)}&periode=${encodeURIComponent(surveyState.period)}`);
    const json = await res.json();

    if (json.ok && Array.isArray(json.logs)) {
      surveyState.logs = json.logs;
      surveyState.filteredLogs = json.logs;

      const logCnt = document.getElementById('survey-count-logs');
      if (logCnt) logCnt.textContent = json.logs.length;

      renderLogsTable();
    } else {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="padding: 24px; text-align: center; color: #ef4444;">Gagal mengambil data log.</td></tr>';
    }
  } catch (err) {
    console.error('Error loadSurveyLogs:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="padding: 24px; text-align: center; color: #ef4444;">Error: ${err.message}</td></tr>`;
  }
}
window.loadSurveyLogs = loadSurveyLogs;

function filterLogsByStatus(statusFilter, btnElem) {
  document.querySelectorAll('#survey-tab-logs .reseller-tab').forEach(b => b.classList.remove('active'));
  if (btnElem) btnElem.classList.add('active');

  if (statusFilter === 'ALL') {
    surveyState.filteredLogs = surveyState.logs.slice();
  } else if (statusFilter === 'REPLIED') {
    surveyState.filteredLogs = surveyState.logs.filter(l => l.status === 'REPLIED');
  } else if (statusFilter === 'NOT_ON_WA') {
    surveyState.filteredLogs = surveyState.logs.filter(l => l.status === 'NOT_ON_WA');
  } else {
    surveyState.filteredLogs = surveyState.logs.filter(l => l.status === 'SENT' || l.status === 'TEST_SENT');
  }

  renderLogsTable();
}
window.filterLogsByStatus = filterLogsByStatus;

function renderLogsTable() {
  const tbody = document.getElementById('survey-logs-tbody');
  if (!tbody) return;

  const logs = surveyState.filteredLogs;
  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding: 30px; text-align: center; color: var(--text-muted);">Belum ada riwayat survei untuk filter ini.</td></tr>';
    return;
  }

  let html = '';
  logs.forEach(l => {
    let statusBadge = '<span class="badge" style="background: var(--table-header); color: var(--text-muted);">PENDING</span>';
    if (l.status === 'REPLIED') {
      statusBadge = '<span class="badge" style="background: #dcfce7; color: #15803d; font-weight: 700;">SUDAH BALAS</span>';
    } else if (l.status === 'SENT' || l.status === 'TEST_SENT') {
      statusBadge = '<span class="badge" style="background: #e0f2fe; color: #0369a1; font-weight: 600;">TERKIRIM</span>';
    } else if (l.status === 'NOT_ON_WA') {
      statusBadge = '<span class="badge" style="background: #fee2e2; color: #dc2626; font-weight: 700;">TIDAK ADA WA</span>';
    }

    let catBadge = '<span style="color: var(--text-muted);">-</span>';
    if (l.ai_category === 'KENDALA_SALDO') {
      catBadge = '<span class="badge" style="background: #fef3c7; color: #b45309; font-weight: 700;">KENDALA SALDO</span>';
    } else if (l.ai_category === 'KENDALA_APLIKASI') {
      catBadge = '<span class="badge" style="background: #fee2e2; color: #b91c1c; font-weight: 700;">APLIKASI EROR</span>';
    } else if (l.ai_category === 'KENDALA_HARGA') {
      catBadge = '<span class="badge" style="background: #f3e8ff; color: #7e22ce; font-weight: 700;">KALAH HARGA</span>';
    } else if (l.ai_category === 'TOKO_TUTUP') {
      catBadge = '<span class="badge" style="background: #f1f5f9; color: #475569; font-weight: 700;">TOKO TUTUP</span>';
    } else if (l.ai_category === 'NO_WHATSAPP') {
      catBadge = '<span class="badge" style="background: #fee2e2; color: #dc2626; font-weight: 700;">NON-WA</span>';
    } else if (l.ai_category) {
      catBadge = `<span class="badge" style="background: var(--table-header); color: var(--text-main); font-weight: 600;">${escapeHtml(l.ai_category)}</span>`;
    }

    const visitBadge = (l.need_sco_visit || l.status === 'NOT_ON_WA') ? '<span class="badge" style="background: #eff6ff; color: #1d4ed8; font-weight: 700;">BUTUH VISIT</span>' : '<span style="color: var(--text-muted);">-</span>';
    let replyText = l.reply_received ? `<div style="font-style: italic; color: var(--text-main);">"${escapeHtml(l.reply_received)}"</div>` : '<span style="color: var(--text-muted); font-size: 11px;">(Menunggu balasan)</span>';
    if (l.status === 'NOT_ON_WA') {
      replyText = '<span style="color: #dc2626; font-size: 11px; font-weight: 600;">Nomor tidak terdaftar di WhatsApp. Hubungi via GSM / Visit SCO.</span>';
    }

    const sentTime = l.sent_at ? l.sent_at.substring(0, 16).replace('T', ' ') : '-';

    html += `
      <tr style="border-bottom: 1px solid var(--surface-border);">
        <td style="padding: 10px 12px; text-align: center; color: var(--text-muted); font-weight: 700;">#${l.id}</td>
        <td style="padding: 10px 12px; font-family: monospace; font-size: 11px; color: var(--text-muted); white-space: nowrap;">${sentTime}</td>
        <td style="padding: 10px 12px;">
          <strong style="color: var(--text-main); font-size: 12.5px; display: block;">${escapeHtml(l.reseller_name || l.reseller_id)}</strong>
          <span style="font-size: 10.5px; font-family: monospace; color: var(--primary);">${escapeHtml(l.reseller_id)}</span>
        </td>
        <td style="padding: 10px 12px; font-family: monospace; font-size: 11.5px; font-weight: 600;">
          ${escapeHtml(l.no_wa || '-')}
        </td>
        <td style="padding: 10px 12px; text-align: center;">${statusBadge}</td>
        <td style="padding: 10px 12px; max-width: 280px;">${replyText}</td>
        <td style="padding: 10px 12px; text-align: center;">${catBadge}</td>
        <td style="padding: 10px 12px; text-align: center;">${visitBadge}</td>
        <td style="padding: 10px 12px; text-align: center;">
          <button type="button" onclick="deleteSingleLogAction(${l.id})" title="Hapus log #${l.id}"
            style="border: 1px solid #fecaca; background: #fff1f2; color: #e11d48; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
            Hapus
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

async function deleteSingleLogAction(logId) {
  if (!confirm(`Hapus riwayat survei #${logId}?`)) return;
  try {
    const res = await fetch('/api/survey/logs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: logId })
    });
    const json = await res.json();
    if (json.ok) {
      loadSurveyLogs();
      loadSurveyCandidates();
    } else {
      alert('Gagal menghapus log: ' + (json.error || 'Terjadi kesalahan'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
window.deleteSingleLogAction = deleteSingleLogAction;

async function clearAllSurveyLogsAction() {
  if (!confirm('Apakah Anda yakin ingin MENGHAPUS SEMUA riwayat log survei?\nTindakan ini akan mengosongkan seluruh riwayat dan mereset status survei.')) {
    return;
  }
  try {
    const res = await fetch('/api/survey/logs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear_all: true, brand: surveyState.brand, periode: surveyState.period })
    });
    const json = await res.json();
    if (json.ok) {
      alert(`Berhasil menghapus ${json.deleted_count || 0} riwayat log.`);
      loadSurveyLogs();
      loadSurveyCandidates();
    } else {
      alert('Gagal menghapus log: ' + (json.error || 'Terjadi kesalahan'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
window.clearAllLogsAction = clearAllSurveyLogsAction;
window.clearAllSurveyLogsAction = clearAllSurveyLogsAction;

// =========================================================================
// TAB 3: CHARTS & ANALYTICS
// =========================================================================
async function renderSurveyCharts() {
  if (surveyState.logs.length === 0) {
    await loadSurveyLogs();
  }

  const logs = surveyState.logs;
  const total = logs.length;
  const replied = logs.filter(l => l.status === 'REPLIED').length;
  const rate = total > 0 ? Math.round((replied / total) * 100) : 0;
  const scoVisit = logs.filter(l => l.need_sco_visit).length;

  // KPI Metrics Update
  document.getElementById('chart-metric-total').textContent = total;
  document.getElementById('chart-metric-replied').textContent = replied;
  document.getElementById('chart-metric-rate').textContent = `Response Rate: ${rate}%`;
  document.getElementById('chart-metric-sco-visit').textContent = `${scoVisit} Toko`;

  // Count by category
  const catCounts = {
    'KENDALA_SALDO': 0,
    'KENDALA_APLIKASI': 0,
    'KENDALA_HARGA': 0,
    'TOKO_TUTUP': 0,
    'LAINNYA': 0
  };

  let maxCat = '-';
  let maxCatCount = 0;

  logs.forEach(l => {
    if (l.ai_category && catCounts.hasOwnProperty(l.ai_category)) {
      catCounts[l.ai_category]++;
      if (catCounts[l.ai_category] > maxCatCount) {
        maxCatCount = catCounts[l.ai_category];
        maxCat = l.ai_category.replace('KENDALA_', '');
      }
    }
  });

  document.getElementById('chart-metric-top-issue').textContent = maxCatCount > 0 ? maxCat : 'Belum Ada';

  // Render Donut Chart
  const donutCtx = document.getElementById('chart-category-donut');
  if (donutCtx && typeof Chart !== 'undefined') {
    if (surveyState.donutChart) surveyState.donutChart.destroy();
    surveyState.donutChart = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: ['Kendala Saldo', 'Aplikasi Eror', 'Kalah Harga', 'Toko Tutup', 'Lainnya'],
        datasets: [{
          data: [
            catCounts['KENDALA_SALDO'],
            catCounts['KENDALA_APLIKASI'],
            catCounts['KENDALA_HARGA'],
            catCounts['TOKO_TUTUP'],
            catCounts['LAINNYA']
          ],
          backgroundColor: ['#f59e0b', '#ef4444', '#a855f7', '#64748b', '#0ea5e9'],
          borderWidth: 2,
          borderColor: 'var(--surface)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }

  // Render Bar Chart per Cabang
  const cabangMap = {};
  logs.forEach(l => {
    const c = l.cabang || 'UNKNOWN';
    if (!cabangMap[c]) cabangMap[c] = { sent: 0, replied: 0 };
    cabangMap[c].sent++;
    if (l.status === 'REPLIED') cabangMap[c].replied++;
  });

  const cabangLabels = Object.keys(cabangMap);
  const sentData = cabangLabels.map(k => cabangMap[k].sent);
  const repliedData = cabangLabels.map(k => cabangMap[k].replied);

  const barCtx = document.getElementById('chart-cabang-bar');
  if (barCtx && typeof Chart !== 'undefined') {
    if (surveyState.barChart) surveyState.barChart.destroy();
    surveyState.barChart = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: cabangLabels.length > 0 ? cabangLabels : ['Belum Ada Data'],
        datasets: [
          { label: 'Terkirim', data: sentData.length > 0 ? sentData : [0], backgroundColor: '#93c5fd' },
          { label: 'Merespon', data: repliedData.length > 0 ? repliedData : [0], backgroundColor: '#3b82f6' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }
}
window.renderSurveyCharts = renderSurveyCharts;

// =========================================================================
// MODAL SINGLE & BATCH SURVEY ACTIONS
// =========================================================================
async function openSurveyModal(resellerId, resellerName, cabang, sco, prevTrx) {
  surveyState.currentCandidate = {
    reseller_id: resellerId,
    reseller_name: resellerName,
    cabang: cabang,
    sco_name: sco,
    prev_trx: prevTrx,
    no_wa: ''
  };

  const modal = document.getElementById('survey-single-modal');
  if (!modal) return;

  document.getElementById('survey-modal-toko').textContent = resellerName;
  document.getElementById('survey-modal-id').textContent = resellerId;
  document.getElementById('survey-modal-cabang').textContent = cabang;
  document.getElementById('survey-modal-sco').textContent = `SCO: ${sco}`;
  document.getElementById('survey-modal-prev-trx').textContent = `${(prevTrx || 0).toLocaleString('id-ID')} Trx`;

  const phoneElem = document.getElementById('survey-modal-phone');
  phoneElem.textContent = 'Memuat kontak...';

  const msgArea = document.getElementById('survey-message-text');
  msgArea.value = 'Memuat pesan sapaan AI...';

  const resBox = document.getElementById('survey-result-box');
  resBox.style.display = 'none';

  modal.style.display = 'flex';

  try {
    const cand = surveyState.candidates.find(c => c.reseller_id === resellerId) || surveyState.currentCandidate;
    surveyState.currentCandidate = { ...surveyState.currentCandidate, ...cand };
    phoneElem.textContent = cand.no_wa || 'Belum ada nomor WA';

    // Fetch generated preview message
    const prevResp = await fetch('/api/survey/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: surveyState.brand, candidate: cand })
    });
    const prevJson = await prevResp.json();
    if (prevJson.ok && prevJson.message) {
      msgArea.value = prevJson.message;
    }
  } catch (err) {
    phoneElem.textContent = 'Gagal memuat kontak';
  }
}
window.openSurveyModal = openSurveyModal;

function closeSurveyModal() {
  const modal = document.getElementById('survey-single-modal');
  if (modal) modal.style.display = 'none';
  surveyState.currentCandidate = null;
}
window.closeSurveyModal = closeSurveyModal;

function toggleSurveyTestInput() {
  const isTest = document.getElementById('survey-is-test').checked;
  const box = document.getElementById('survey-test-phone-box');
  if (box) box.style.display = isTest ? 'flex' : 'none';
}
window.toggleSurveyTestInput = toggleSurveyTestInput;

async function submitSurveyAction() {
  if (!surveyState.currentCandidate) return;

  const btn = document.getElementById('btn-submit-survey');
  const resBox = document.getElementById('survey-result-box');
  const isTest = document.getElementById('survey-is-test').checked;
  const testPhone = document.getElementById('survey-test-phone').value.trim();
  const customMsg = document.getElementById('survey-message-text').value.trim();

  if (isTest && (!testPhone || testPhone.length < 9)) {
    alert('Masukkan nomor HP/WA uji coba yang valid (contoh: 085882888808)');
    document.getElementById('survey-test-phone').focus();
    return;
  }

  btn.disabled = true;
  btn.style.opacity = '0.7';
  btn.innerHTML = 'Mengirim...';

  try {
    const payload = {
      brand: surveyState.brand,
      periode: surveyState.period,
      agen_id: surveyState.currentCandidate.reseller_id,
      agen_name: surveyState.currentCandidate.reseller_name,
      cabang: surveyState.currentCandidate.cabang,
      sco_name: surveyState.currentCandidate.sco_name,
      no_wa: surveyState.currentCandidate.no_wa,
      prev_trx: surveyState.currentCandidate.prev_trx,
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
      const dest = isTest ? `Nomor Uji Coba (+${res.target_phone})` : `Nomor Reseller (+${res.target_phone})`;
      resBox.innerHTML = `<strong>Pesan Berhasil Diproses!</strong><br>Status: <code>${res.status}</code> &bull; Tujuan: ${dest}`;
      
      // Auto refresh candidates and logs
      loadSurveyCandidates();
      loadSurveyLogs();
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
      <span>Kirim Pesan Survei</span>
    `;
  }
}
window.submitSurveyAction = submitSurveyAction;

// Batch Survey Actions
function openBatchSurveyModal() {
  const modal = document.getElementById('survey-batch-modal');
  if (!modal) return;

  const tSel = document.getElementById('survey-filter-trx');
  const currentTrx = tSel ? tSel.value : 'GT5';

  const cSel = document.getElementById('survey-filter-cabang');
  const currentCabang = cSel ? cSel.value : 'ALL';

  const batchTrxSel = document.getElementById('batch-filter-trx');
  if (batchTrxSel) batchTrxSel.value = currentTrx;

  populateBatchCabangOptions(currentTrx, currentCabang);
  updateBatchList(currentTrx, currentCabang);

  modal.style.display = 'flex';
}
window.openBatchSurveyModal = openBatchSurveyModal;

function populateBatchCabangOptions(trxFilter, selectedCabang) {
  const batchCabangSel = document.getElementById('batch-filter-cabang');
  if (!batchCabangSel) return;

  let pool = surveyState.candidates.slice();
  if (trxFilter === 'GT5') {
    pool = pool.filter(c => (c.prev_trx || 0) > 5);
  }

  const cabangs = Array.from(new Set(pool.map(c => c.cabang).filter(Boolean))).sort();
  let optHtml = `<option value="ALL">Semua Cabang (${pool.length})</option>`;
  cabangs.forEach(cb => {
    const count = pool.filter(c => (c.cabang || '').toUpperCase() === cb.toUpperCase()).length;
    optHtml += `<option value="${escapeHtml(cb)}">${escapeHtml(cb)} (${count})</option>`;
  });
  batchCabangSel.innerHTML = optHtml;
  batchCabangSel.value = cabangs.includes(selectedCabang) || selectedCabang === 'ALL' ? selectedCabang : 'ALL';
}

function changeBatchTrx(selectedTrx) {
  const tSel = document.getElementById('survey-filter-trx');
  if (tSel) {
    tSel.value = selectedTrx;
    applySurveyFilters();
  }
  const cSel = document.getElementById('batch-filter-cabang');
  const currentCabang = cSel ? cSel.value : 'ALL';
  populateBatchCabangOptions(selectedTrx, currentCabang);
  updateBatchList(selectedTrx, currentCabang);
}
window.changeBatchTrx = changeBatchTrx;

function changeBatchCabang(selectedCabang) {
  const cSel = document.getElementById('survey-filter-cabang');
  if (cSel) {
    cSel.value = selectedCabang;
    applySurveyFilters();
  }
  const tSel = document.getElementById('batch-filter-trx');
  const currentTrx = tSel ? tSel.value : 'GT5';
  updateBatchList(currentTrx, selectedCabang);
}
window.changeBatchCabang = changeBatchCabang;

function updateBatchList(trxFilter, cabangFilter) {
  let list = surveyState.candidates.slice();
  if (trxFilter === 'GT5') {
    list = list.filter(c => (c.prev_trx || 0) > 5);
  }
  if (cabangFilter !== 'ALL') {
    list = list.filter(c => (c.cabang || '').toUpperCase() === cabangFilter.toUpperCase());
  }

  surveyState.batchCandidates = list;

  const totalElem = document.getElementById('batch-total-churn');
  if (totalElem) totalElem.textContent = list.length;

  const readyElem = document.getElementById('batch-ready-count');
  if (readyElem) readyElem.textContent = list.filter(c => c.no_wa && surveyState.waStatus[c.no_wa] !== false).length;

  const selectElem = document.getElementById('batch-selected-count');
  if (selectElem) selectElem.textContent = list.filter(c => c.no_wa && surveyState.waStatus[c.no_wa] !== false).length;

  renderBatchTable();
}

function closeBatchSurveyModal() {
  const modal = document.getElementById('survey-batch-modal');
  if (modal) modal.style.display = 'none';
}
window.closeBatchSurveyModal = closeBatchSurveyModal;

function renderBatchTable() {
  const tbody = document.getElementById('batch-candidate-tbody');
  if (!tbody) return;

  let html = '';
  surveyState.batchCandidates.forEach((c, idx) => {
    let phone = '<span style="color: #ef4444;">Tidak ada</span>';
    const hasWa = c.no_wa ? surveyState.waStatus[c.no_wa] : null;

    if (c.no_wa) {
      if (hasWa === true) {
        phone = `
          <div style="font-family: monospace; font-weight: 700; color: #16a34a; display: inline-flex; align-items: center; gap: 5px;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #16a34a; display: inline-block;"></span>
            <code>${escapeHtml(c.no_wa)}</code>
          </div>
        `;
      } else if (hasWa === false) {
        phone = `
          <div style="font-family: monospace; font-weight: 500; color: #94a3b8; display: inline-flex; align-items: center; gap: 5px;" title="Nomor tidak terdaftar di WhatsApp">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #cbd5e1; display: inline-block;"></span>
            <code style="opacity: 0.85;">${escapeHtml(c.no_wa)}</code>
            <span class="badge" style="background: #f1f5f9; color: #64748b; font-size: 9.5px; padding: 1px 4px; font-weight: 600;">Non-WA</span>
          </div>
        `;
      } else {
        phone = `<code>${escapeHtml(c.no_wa)}</code>`;
      }
    }

    let statusBadge = '<span class="badge" style="background: var(--table-header); color: var(--text-muted);">Belum</span>';
    if (c.status === 'REPLIED') {
      statusBadge = '<span class="badge" style="background: #dcfce7; color: #15803d; font-weight: 700;">Sudah Balas</span>';
    } else if (c.status === 'SENT' || c.status === 'TEST_SENT') {
      statusBadge = '<span class="badge" style="background: #e0f2fe; color: #0369a1;">Terkirim</span>';
    } else if (c.status === 'NOT_ON_WA') {
      statusBadge = '<span class="badge" style="background: #fee2e2; color: #dc2626; font-weight: 700;">Tidak Ada WA</span>';
    }

    const displayInduk = c.agen_name && c.agen_name !== '-' ? `<div style="font-size: 10.5px; color: var(--text-muted);">Induk: ${escapeHtml(c.agen_name)}</div>` : '';
    const isChecked = (c.no_wa && hasWa !== false) ? 'checked' : '';
    const rowStyle = (hasWa === false) ? 'opacity: 0.65;' : '';

    html += `
      <tr style="border-bottom: 1px solid var(--surface-border); ${rowStyle}">
        <td style="padding: 8px 12px; text-align: center;">
          <input type="checkbox" class="batch-check-item" data-idx="${idx}" ${isChecked} onchange="updateBatchSelectedCount()">
        </td>
        <td style="padding: 8px 12px;">
          <strong style="color: var(--text-main);">${escapeHtml(c.reseller_name || c.reseller_id)}</strong>
          <div style="font-size: 10.5px; font-family: monospace; color: var(--primary);">${escapeHtml(c.reseller_id)}</div>
          ${displayInduk}
        </td>
        <td style="padding: 8px 12px;">
          <div>${escapeHtml(c.cabang || '-')}</div>
          <div style="font-size: 10.5px; color: var(--text-muted);">${escapeHtml(c.sco_name || '-')}</div>
        </td>
        <td style="padding: 8px 12px; text-align: center; font-weight: 700; color: #0284c7;">
          ${(c.prev_trx || 0).toLocaleString('id-ID')}
        </td>
        <td style="padding: 8px 12px;">${phone}</td>
        <td style="padding: 8px 12px; text-align: center;">${statusBadge}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  updateBatchSelectedCount();
}

function updateBatchSelectedCount() {
  const count = document.querySelectorAll('.batch-check-item:checked').length;
  const countElem = document.getElementById('batch-selected-count');
  if (countElem) countElem.textContent = count;
}
window.updateBatchSelectedCount = updateBatchSelectedCount;

function toggleSelectAllBatch(checked) {
  document.querySelectorAll('.batch-check-item').forEach(cb => cb.checked = checked);
  const chkAll = document.getElementById('batch-check-all');
  if (chkAll) chkAll.checked = checked;
  updateBatchSelectedCount();
}
window.toggleSelectAllBatch = toggleSelectAllBatch;

async function submitBatchSurveyAction() {
  const checkedItems = Array.from(document.querySelectorAll('.batch-check-item:checked')).map(cb => parseInt(cb.getAttribute('data-idx')));
  if (checkedItems.length === 0) {
    alert('Pilih minimal 1 reseller.');
    return;
  }

  const isTest = document.getElementById('batch-is-test').checked;
  const resBox = document.getElementById('batch-result-box');
  const btn = document.getElementById('btn-submit-batch-survey');

  if (!confirm(`Jalankan survei AI ke ${checkedItems.length} reseller terpilih? (${isTest ? 'Mode Uji Coba' : 'WhatsApp Nyata'})`)) {
    return;
  }

  btn.disabled = true;
  btn.style.opacity = '0.7';
  btn.innerHTML = 'Memproses batch...';

  resBox.style.display = 'block';
  resBox.style.background = '#eff6ff';
  resBox.style.border = '1px solid #bfdbfe';
  resBox.style.color = '#1e40af';
  resBox.innerHTML = `Sedang memproses 0 dari ${checkedItems.length} survei...`;

  let successCount = 0;
  for (let i = 0; i < checkedItems.length; i++) {
    const cand = surveyState.batchCandidates[checkedItems[i]];
    try {
      const prevResp = await fetch('/api/survey/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: surveyState.brand, candidate: cand })
      });
      const prevJson = await prevResp.json();
      const msg = prevJson.message || `Halo Kak di ${cand.reseller_name}...`;

      await fetch('/api/survey/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: surveyState.brand,
          periode: surveyState.period,
          agen_id: cand.reseller_id,
          agen_name: cand.reseller_name,
          cabang: cand.cabang,
          sco_name: cand.sco_name,
          no_wa: cand.no_wa,
          prev_trx: cand.prev_trx,
          message: msg,
          is_test: isTest
        })
      });
      successCount++;
      resBox.innerHTML = `Sedang memproses ${successCount} dari ${checkedItems.length} survei...`;
    } catch (e) {
      console.error(e);
    }
  }

  resBox.style.background = '#f0fdf4';
  resBox.style.border = '1px solid #bbf7d0';
  resBox.style.color = '#166534';
  resBox.innerHTML = `<strong>Selesai!</strong> Berhasil memproses ${successCount} survei reseller.`;

  btn.disabled = false;
  btn.style.opacity = '1';
  btn.innerHTML = '<span>Mulai Survei Batch Terpilih</span>';

  loadSurveyCandidates();
  loadSurveyLogs();
}
window.submitBatchSurveyAction = submitBatchSurveyAction;

// Helper escapeHtml
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
