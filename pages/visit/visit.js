/**
 * pages/visit/visit.js — Target Kunjungan SCO vs Realisasi
 * Standar Arsitektur: Blueprint #YoY (Hukum 10 GEMINI.md) & Anti-AI Slop (Lucide Vector SVG)
 */

let _visitData = null;
let _currentTab = "leaderboard";
let _pjpClaimData = null;
let _kpiScoData = null;

/**
 * Entrypoint dipanggil oleh Single Shell Router (static/js/app.js) saat membuka #visit
 */
async function loadVisit() {
  console.log("[Visit] Inisialisasi halaman Target Kunjungan SCO vs Realisasi...");
  await loadVisitSummary(false);
}
window.loadVisit = loadVisit;

/**
 * Mengambil ringkasan target vs realisasi dari API backend
 */
async function loadVisitSummary(forceRefresh = false) {
  try {
    const url = `/api/visit/summary${forceRefresh ? "?refresh=1" : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Gagal memproses data kunjungan");

    _visitData = data;
    renderVisitSummary(data);
  } catch (err) {
    console.error("[Visit] Error loading summary:", err);
    alert("Gagal memuat data kunjungan SCO: " + err.message);
  }
}
window.loadVisitSummary = loadVisitSummary;

/**
 * Render seluruh visual dashboard visit
 */
function renderVisitSummary(data) {
  const kpi = data.kpi || {};
  const leaderboard = data.leaderboard || [];
  const matrix = data.matrix || [];
  const dates = data.dates || [];
  const jadwalBreakdown = data.jadwal_breakdown || [];

  // 1. Periode Header
  const periodEl = document.getElementById("visit-period-label");
  if (periodEl) {
    periodEl.textContent = `Periode Target: ${data.min_date || '2026-11-03'} s/d ${data.max_date || '2026-11-14'} (${kpi.total_active_days || 11} Hari Kerja Aktif)`;
  }

  // 2. KPI Cards
  const kpiTargetEl = document.getElementById("kpi-total-target");
  if (kpiTargetEl) kpiTargetEl.textContent = formatNum(kpi.total_target || 0);

  const kpiDaysEl = document.getElementById("kpi-active-days");
  if (kpiDaysEl) kpiDaysEl.textContent = `${kpi.total_active_days || 11} Hari Kerja Aktif`;

  const kpiStoreEl = document.getElementById("kpi-store-count");
  if (kpiStoreEl) {
    const act = kpi.total_target_agents || 453;
    const dorm = kpi.dormant_excluded || 47;
    kpiStoreEl.textContent = `${formatNum(act)} Toko Aktif (${dorm} Dorman Dikeluarkan)`;
  }

  const kpiScoreEl = document.getElementById("kpi-total-score");
  if (kpiScoreEl) kpiScoreEl.textContent = formatNum(kpi.total_score || 0);

  const kpiOverallPill = document.getElementById("kpi-overall-pill");
  if (kpiOverallPill) kpiOverallPill.textContent = `${(kpi.overall_pct || 0).toFixed(1)}%`;

  const kpiScoreSub = document.getElementById("kpi-score-sub");
  if (kpiScoreSub) kpiScoreSub.textContent = `${formatNum(kpi.total_score || 0)} Kunjungan Tepat Sasaran`;

  const kpiMissedEl = document.getElementById("kpi-total-missed");
  if (kpiMissedEl) kpiMissedEl.textContent = formatNum(kpi.total_missed || 0);

  const kpiTopScoEl = document.getElementById("kpi-top-sco");
  const kpiTopAchEl = document.getElementById("kpi-top-achievement");
  if (kpiTopScoEl && leaderboard.length > 0) {
    const top = leaderboard[0];
    kpiTopScoEl.textContent = top.sco;
    if (kpiTopAchEl) {
      kpiTopAchEl.textContent = `Pencapaian: ${top.achievement_pct.toFixed(1)}% (${formatNum(top.realisasi)}/${formatNum(top.target)})`;
    }
  }

  // 3. Leaderboard Table
  renderLeaderboardTable(leaderboard);

  // 4. Daily Matrix Table
  renderDailyMatrixTable(matrix, dates);

  // Preload tab data jika tab aktif
  if (_currentTab === "claim") {
    loadPjpClaimData(false);
  } else if (_currentTab === "kpisco") {
    loadKpiScoData(false);
  }
}

/**
 * Render Tabel Klasemen Kunjungan SCO
 */
function renderLeaderboardTable(leaderboard) {
  const tbody = document.getElementById("tbody-visit-leaderboard");
  if (!tbody) return;

  if (!leaderboard || leaderboard.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 24px; color: var(--text-muted);">Tidak ada data klasemen</td></tr>`;
    return;
  }

  let totalTarget = 0;
  let totalRealisasi = 0;
  let totalMissed = 0;

  let html = "";
  leaderboard.forEach(row => {
    totalTarget += row.target;
    totalRealisasi += row.realisasi;
    totalMissed += row.missed;

    // Status Pill
    let statusBg = "rgba(16, 185, 129, 0.12)";
    let statusColor = "#10b981";
    if (row.status === "WASPADA") {
      statusBg = "rgba(245, 158, 11, 0.12)";
      statusColor = "#f59e0b";
    } else if (row.status === "EVALUASI") {
      statusBg = "rgba(239, 68, 68, 0.12)";
      statusColor = "#ef4444";
    }

    const rankPill = row.rank === 1 
      ? `<span class="pill-badge" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">#1</span>`
      : `<span style="font-weight: 700; color: var(--text-muted);">#${row.rank}</span>`;

    const targetPill = row.izin > 0 
      ? `<div>${formatNum(row.target)}</div><div style="font-size: 10px; color: #d97706; font-weight: 600;" title="${row.izin} toko dinolkan karena izin">(${row.izin} Izin)</div>`
      : formatNum(row.target);

    html += `
      <tr>
        <td class="text-center">${rankPill}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(row.sco)}</div>
        </td>
        <td>
          <span class="pill-badge" style="background: var(--surface-bg); border: 1px solid var(--surface-border); color: var(--text-muted); font-size: 11px;">${escapeHtml(row.cabang)}</span>
        </td>
        <td class="text-right" style="font-family: var(--font-mono);">${targetPill}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: #10b981;">${formatNum(row.realisasi)}</td>
        <td class="text-right" style="font-family: var(--font-mono); color: ${row.missed > 0 ? '#ef4444' : 'var(--text-muted)'}; font-weight: ${row.missed > 0 ? '700' : '400'};">${formatNum(row.missed)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800; color: ${statusColor};">${row.achievement_pct.toFixed(1)}%</td>
        <td class="text-center">
          <span class="pill-badge" style="background: ${statusBg}; color: ${statusColor};">${row.status}</span>
        </td>
      </tr>
    `;
  });

  // Total Row
  const totalPct = totalTarget > 0 ? ((totalRealisasi / totalTarget) * 100) : 0;
  html += `
    <tr class="total-row">
      <td class="text-center">&bull;</td>
      <td>TOTAL KESELURUHAN</td>
      <td>5 CABANG</td>
      <td class="text-right" style="font-family: var(--font-mono); font-size: 13px;">${formatNum(totalTarget)}</td>
      <td class="text-right" style="font-family: var(--font-mono); font-size: 13px; color: #10b981;">${formatNum(totalRealisasi)}</td>
      <td class="text-right" style="font-family: var(--font-mono); font-size: 13px; color: #ef4444;">${formatNum(totalMissed)}</td>
      <td class="text-right" style="font-family: var(--font-mono); font-size: 13.5px; color: var(--primary);">${totalPct.toFixed(1)}%</td>
      <td class="text-center"><span class="pill-badge" style="background: rgba(2, 132, 199, 0.15); color: var(--primary);">77.9% AVERAGE</span></td>
    </tr>
  `;

  tbody.innerHTML = html;
}

/**
 * Render Tabel Matriks Harian (Date Columns)
 */
function renderDailyMatrixTable(matrix, dates) {
  const thead = document.getElementById("thead-visit-matrix");
  const tbody = document.getElementById("tbody-visit-matrix");
  if (!thead || !tbody) return;

  if (!dates || dates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="15" class="text-center" style="padding: 24px; color: var(--text-muted);">Tidak ada data tanggal</td></tr>`;
    return;
  }

  // Header
  let headHtml = `
    <tr>
      <th style="min-width: 150px;">NAMA SCO</th>
      <th style="width: 75px;" class="text-center">CABANG</th>
  `;
  dates.forEach(d => {
    headHtml += `<th class="text-center" style="min-width: 65px; font-size: 11.5px;">${formatDateHeader(d)}</th>`;
  });
  headHtml += `
      <th class="text-right" style="min-width: 80px;">TARGET</th>
      <th class="text-right" style="min-width: 85px;">REALISASI</th>
      <th class="text-right" style="min-width: 70px;">%</th>
    </tr>
  `;
  thead.innerHTML = headHtml;

  // Daily Totals Accumulator
  const dayTargetTotals = {};
  const dayScoreTotals = {};
  dates.forEach(d => {
    dayTargetTotals[d] = 0;
    dayScoreTotals[d] = 0;
  });

  let grandTarget = 0;
  let grandRealisasi = 0;

  let bodyHtml = "";
  matrix.forEach(row => {
    grandTarget += row.total_target;
    grandRealisasi += row.total_realisasi;

    bodyHtml += `
      <tr>
        <td style="font-weight: 700; color: var(--text-main);">${escapeHtml(row.sco)}</td>
        <td class="text-center">
          <span class="pill-badge" style="background: var(--surface-bg); border: 1px solid var(--surface-border); color: var(--text-muted); font-size: 11px;">${escapeHtml(row.cabang)}</span>
        </td>
    `;

    dates.forEach(d => {
      const target = row.daily_targets ? (row.daily_targets[d] || 0) : 0;
      const score = row.daily_scores ? (row.daily_scores[d] || 0) : 0;
      const isIzin = (row.daily_izin && row.daily_izin[d]);
      const origTarget = (row.daily_orig_targets && row.daily_orig_targets[d]) || target;

      dayTargetTotals[d] += target;
      dayScoreTotals[d] += score;

      if (isIzin) {
        bodyHtml += `<td class="cell-matrix cell-izin" title="Izin / Off (Target ${origTarget} dinolkan)"><span class="pill-badge pill-izin">IZIN</span></td>`;
      } else if (target === 0) {
        bodyHtml += `<td class="cell-matrix" style="color: var(--text-muted);">-</td>`;
      } else {
        let cellClass = "cell-partial";
        if (score >= target) cellClass = "cell-full";
        else if (score === 0) cellClass = "cell-zero";

        bodyHtml += `<td class="cell-matrix ${cellClass}" title="${score} selesai dari ${target} target">${score}/${target}</td>`;
      }
    });

    const pctColor = row.achievement_pct >= 85 ? '#10b981' : (row.achievement_pct >= 75 ? '#0284c7' : '#ef4444');
    bodyHtml += `
        <td class="text-right" style="font-family: var(--font-mono);">${formatNum(row.total_target)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: #10b981;">${formatNum(row.total_realisasi)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800; color: ${pctColor};">${row.achievement_pct.toFixed(1)}%</td>
      </tr>
    `;
  });

  // Total Summary Row
  const grandPct = grandTarget > 0 ? ((grandRealisasi / grandTarget) * 100) : 0;
  bodyHtml += `
    <tr class="total-row">
      <td>TOTAL HARIAN</td>
      <td class="text-center">&bull;</td>
  `;
  dates.forEach(d => {
    const dTarget = dayTargetTotals[d] || 0;
    const dScore = dayScoreTotals[d] || 0;
    bodyHtml += `<td class="cell-matrix" style="font-weight: 800; color: var(--text-main); font-size: 11px;">${dScore}/${dTarget}</td>`;
  });
  bodyHtml += `
      <td class="text-right" style="font-family: var(--font-mono);">${formatNum(grandTarget)}</td>
      <td class="text-right" style="font-family: var(--font-mono); color: #10b981;">${formatNum(grandRealisasi)}</td>
      <td class="text-right" style="font-family: var(--font-mono); color: var(--primary);">${grandPct.toFixed(1)}%</td>
    </tr>
  `;

  tbody.innerHTML = bodyHtml;
}

// ==============================================================================
// TAB NAVIGATION SWITCHER
// ==============================================================================

function switchVisitTab(tabName) {
  _currentTab = tabName;

  // Buttons
  document.getElementById("tab-btn-leaderboard")?.classList.toggle("active", tabName === "leaderboard");
  document.getElementById("tab-btn-claim")?.classList.toggle("active", tabName === "claim");
  document.getElementById("tab-btn-kpisco")?.classList.toggle("active", tabName === "kpisco");

  // Panels
  const viewLeaderboard = document.getElementById("view-visit-leaderboard");
  const viewClaim = document.getElementById("view-visit-claim");
  const viewKpisco = document.getElementById("view-visit-kpisco");

  if (viewLeaderboard) viewLeaderboard.style.display = tabName === "leaderboard" ? "flex" : "none";
  if (viewClaim) viewClaim.style.display = tabName === "claim" ? "flex" : "none";
  if (viewKpisco) viewKpisco.style.display = tabName === "kpisco" ? "flex" : "none";

  if (tabName === "claim") {
    if (!_pjpClaimData) {
      loadPjpClaimData(false);
    }
  } else if (tabName === "kpisco") {
    if (!_kpiScoData) {
      loadKpiScoData(false);
    }
  }
}
window.switchVisitTab = switchVisitTab;

// ==============================================================================
// TAB 2: NET CLAIM TRX (NAM PJP)
// ==============================================================================

async function loadPjpClaimData(forceRefresh = false) {
  const tbody = document.getElementById("tbody-visit-claim");
  if (tbody && !_pjpClaimData) {
    tbody.innerHTML = `<tr><td colspan="15" class="text-center" style="padding: 24px; color: var(--text-muted);">Memuat data Net Claim Trx dari sheet NAM_PJP...</td></tr>`;
  }

  try {
    const url = `/api/visit/pjp-claim${forceRefresh ? "?refresh=1" : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Gagal memuat data Net Claim Trx");

    _pjpClaimData = data;
    renderPjpClaimSummary(data.summary || {});
    const scosAggList = Array.isArray(data.scos_agg) ? data.scos_agg : Object.values(data.scos_agg || {});
    setupClaimFilterOptions(scosAggList);
    applyClaimFilters();
  } catch (err) {
    console.error("[Visit] Error loading PJP claim data:", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="15" class="text-center" style="padding: 24px; color: #ef4444;">Gagal memuat Net Claim Trx: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}
window.loadPjpClaimData = loadPjpClaimData;

function renderPjpClaimSummary(summary) {
  const totalStores = summary.total_stores || 0;
  const passStores = summary.passed_stores !== undefined ? summary.passed_stores : (summary.total_claimable_stores || 0);
  const lostStores = summary.failed_stores !== undefined ? summary.failed_stores : (summary.total_lost_stores || 0);
  const passPct = summary.passed_pct !== undefined ? summary.passed_pct : (totalStores > 0 ? (passStores / totalStores * 100) : 0);
  const lostPct = summary.failed_pct !== undefined ? summary.failed_pct : (totalStores > 0 ? (lostStores / totalStores * 100) : 0);

  const totalStoresEl = document.getElementById("claim-kpi-total-stores");
  if (totalStoresEl) totalStoresEl.textContent = `${formatNum(totalStores)} Toko`;

  const passStoresEl = document.getElementById("claim-kpi-pass-stores");
  if (passStoresEl) passStoresEl.textContent = `${formatNum(passStores)} Toko`;

  const passPctEl = document.getElementById("claim-kpi-pass-pct");
  if (passPctEl) passPctEl.textContent = `${passPct.toFixed(1)}%`;

  const lostStoresEl = document.getElementById("claim-kpi-lost-stores");
  if (lostStoresEl) lostStoresEl.textContent = `${formatNum(lostStores)} Toko`;

  const lostPctEl = document.getElementById("claim-kpi-lost-pct");
  if (lostPctEl) lostPctEl.textContent = `${lostPct.toFixed(1)}%`;

  const grossRate = summary.total_gross_nov !== undefined ? summary.total_gross_nov : (summary.total_nov_gross_rate || 0);
  const netRate = summary.total_net_trx !== undefined ? summary.total_net_trx : (summary.total_net_claim_rate || 0);
  const lostRate = summary.total_lost_trx !== undefined ? summary.total_lost_trx : (summary.total_lost_rate || 0);
  const claimRatePct = grossRate > 0 ? (netRate / grossRate * 100) : 0;

  const grossRateEl = document.getElementById("claim-kpi-gross-rate");
  if (grossRateEl) grossRateEl.textContent = formatRate(grossRate);

  const netRateEl = document.getElementById("claim-kpi-net-rate");
  if (netRateEl) netRateEl.textContent = formatRate(netRate);

  const claimRatePctEl = document.getElementById("claim-kpi-claim-rate-pct");
  if (claimRatePctEl) claimRatePctEl.textContent = `${claimRatePct.toFixed(1)}% Sah`;

  const lostRateEl = document.getElementById("claim-kpi-lost-rate");
  if (lostRateEl) lostRateEl.textContent = formatRate(lostRate);
}

function setupClaimFilterOptions(scoSummary) {
  const selSco = document.getElementById("filter-claim-sco");
  if (!selSco) return;

  const currentVal = selSco.value || "ALL";
  selSco.innerHTML = `<option value="ALL">Semua SCO (${scoSummary.length})</option>`;

  scoSummary.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.sco;
    const passed = item.passed_stores !== undefined ? item.passed_stores : (item.claimable_stores || 0);
    const total = item.total_stores || 0;
    opt.textContent = `${item.sco} (${passed}/${total} Lolos)`;
    selSco.appendChild(opt);
  });

  selSco.value = currentVal;
}

function applyClaimFilters() {
  if (!_pjpClaimData || !_pjpClaimData.stores) return;

  const scoVal = document.getElementById("filter-claim-sco")?.value || "ALL";
  const jadwalVal = document.getElementById("filter-claim-jadwal")?.value || "ALL";
  const statusVal = document.getElementById("filter-claim-status")?.value || "ALL";
  const searchVal = (document.getElementById("filter-claim-search")?.value || "").trim().toLowerCase();

  const filtered = _pjpClaimData.stores.filter(row => {
    if (scoVal !== "ALL" && row.sco !== scoVal) return false;
    if (jadwalVal !== "ALL" && row.jadwal !== jadwalVal) return false;
    if (statusVal === "PASS" && !row.is_claimable) return false;
    if (statusVal === "LOST" && row.is_claimable) return false;

    if (searchVal) {
      const matchAr = (row.agen_id || "").toLowerCase().includes(searchVal);
      const matchNama = (row.nama_agen || "").toLowerCase().includes(searchVal);
      const matchSco = (row.sco || "").toLowerCase().includes(searchVal);
      if (!matchAr && !matchNama && !matchSco) return false;
    }

    return true;
  });

  renderPjpClaimTable(filtered);
}
window.applyClaimFilters = applyClaimFilters;

function applyClaimSearch() {
  applyClaimFilters();
}
window.applyClaimSearch = applyClaimSearch;

function renderPjpClaimTable(stores) {
  const tbody = document.getElementById("tbody-visit-claim");
  const tfoot = document.getElementById("tfoot-visit-claim");
  const countEl = document.getElementById("claim-filter-count");
  if (!tbody) return;

  if (countEl) {
    countEl.textContent = `Menampilkan ${formatNum(stores.length)} toko`;
  }

  if (!stores || stores.length === 0) {
    tbody.innerHTML = `<tr><td colspan="15" class="text-center" style="padding: 24px; color: var(--text-muted);">Tidak ada toko sesuai kriteria filter</td></tr>`;
    if (tfoot) tfoot.innerHTML = "";
    return;
  }

  let sumOkt = 0;
  let sumNov = 0;
  let sumTarget = 0;
  let sumActual = 0;
  let sumNet = 0;
  let sumGrowth = 0;

  let html = "";
  stores.forEach((row, idx) => {
    const octTrx = row.oct_trx !== undefined ? row.oct_trx : (row.trx_okt_gross_rate || 0);
    const novTrx = row.nov_trx !== undefined ? row.nov_trx : (row.trx_nov_gross_rate || 0);
    const tgtVisit = row.tgt_visit !== undefined ? row.tgt_visit : (row.visit_target || 0);
    const achVisit = row.ach_visit !== undefined ? row.ach_visit : (row.visit_actual || 0);
    const achPctVal = row.ach_pct !== undefined ? row.ach_pct : (row.visit_ach_pct || 0);
    const netTrx = row.net_trx !== undefined ? row.net_trx : (row.trx_net_claim_rate || 0);
    const growth = row.growth !== undefined ? row.growth : (row.growth_rate || 0);
    const growthPct = octTrx > 0 ? ((novTrx - octTrx) / octTrx * 100) : 0;

    sumOkt += octTrx;
    sumNov += novTrx;
    sumTarget += tgtVisit;
    sumActual += achVisit;
    sumNet += netTrx;
    sumGrowth += growth;

    const isPass = row.is_claimable;
    const statusPill = isPass 
      ? `<span class="pill-badge" style="background: rgba(16, 185, 129, 0.12); color: #10b981;">BERHAK KLAIM</span>`
      : `<span class="pill-badge" style="background: rgba(239, 68, 68, 0.12); color: #ef4444;">HANGUS (&lt;60%)</span>`;

    const netCell = isPass
      ? `<span style="font-weight: 800; color: #059669;">${formatRate(netTrx)}</span>`
      : `<span style="color: #ef4444; font-weight: 700;">0.00</span>`;

    const achPct = achPctVal * 100;
    const achColor = achPct >= 80 ? '#10b981' : (achPct >= 60 ? '#f59e0b' : '#ef4444');
    const grwColor = growth >= 0 ? '#10b981' : '#ef4444';

    html += `
      <tr>
        <td class="text-center" style="color: var(--text-muted); font-size: 11.5px;">${row.no || idx + 1}</td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--primary);">${escapeHtml(row.agen_id)}</td>
        <td style="font-weight: 600;">${escapeHtml(row.nama_agen)}</td>
        <td><span class="pill-badge" style="background: var(--surface-bg); border: 1px solid var(--surface-border); color: var(--text-muted); font-size: 11px;">${escapeHtml(row.cabang)}</span></td>
        <td style="font-weight: 600;">${escapeHtml(row.sco)}</td>
        <td style="color: var(--text-muted); font-size: 11.5px;">${escapeHtml(row.jadwal)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatRate(octTrx)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 600;">${formatRate(novTrx)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatNum(tgtVisit)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatNum(achVisit)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: ${achColor};">${achPct.toFixed(0)}%</td>
        <td class="text-center">${statusPill}</td>
        <td class="text-right" style="font-family: var(--font-mono); background: rgba(16, 185, 129, 0.05);">${netCell}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 600; color: ${grwColor};">${growth >= 0 ? '+' : ''}${formatRate(growth)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 600; color: ${grwColor};">${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}%</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;

  // Footer Totals Row
  if (tfoot) {
    const avgAch = sumTarget > 0 ? (sumActual / sumTarget * 100) : 0;
    const avgGrwPct = sumOkt > 0 ? ((sumNov - sumOkt) / sumOkt * 100) : 0;
    const grwSumColor = sumGrowth >= 0 ? '#10b981' : '#ef4444';

    tfoot.innerHTML = `
      <tr class="total-row">
        <td colspan="6" style="font-weight: 800;">TOTAL (${formatNum(stores.length)} TOKO)</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatRate(sumOkt)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatRate(sumNov)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatNum(sumTarget)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatNum(sumActual)}</td>
        <td class="text-right" style="font-family: var(--font-mono); color: var(--primary);">${avgAch.toFixed(1)}%</td>
        <td class="text-center">&bull;</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800; color: #059669; background: rgba(16, 185, 129, 0.1);">${formatRate(sumNet)}</td>
        <td class="text-right" style="font-family: var(--font-mono); color: ${grwSumColor};">${sumGrowth >= 0 ? '+' : ''}${formatRate(sumGrowth)}</td>
        <td class="text-right" style="font-family: var(--font-mono); color: ${grwSumColor};">${avgGrwPct >= 0 ? '+' : ''}${avgGrwPct.toFixed(1)}%</td>
      </tr>
    `;
  }
}

// ==============================================================================
// TAB 3: KPI SCO & INSENTIF
// ==============================================================================

async function loadKpiScoData(forceRefresh = false) {
  const tbody = document.getElementById("tbody-visit-kpisco");
  if (tbody && !_kpiScoData) {
    tbody.innerHTML = `<tr><td colspan="22" class="text-center" style="padding: 24px; color: var(--text-muted);">Menghitung scorecard 4 pilar KPI SCO &amp; insentif...</td></tr>`;
  }

  try {
    const url = `/api/visit/kpi-sco${forceRefresh ? "?refresh=1" : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Gagal memproses scorecard KPI SCO");

    _kpiScoData = data;
    renderKpiScoSummary(data);
    renderKpiScoTable(data.kpi || [], data.totals || {});
  } catch (err) {
    console.error("[Visit] Error loading KPI SCO data:", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="22" class="text-center" style="padding: 24px; color: #ef4444;">Gagal memuat KPI SCO: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}
window.loadKpiScoData = loadKpiScoData;

function renderKpiScoSummary(data) {
  const totals = data.totals || {};
  const kpiList = data.kpi || [];

  const incentiveEl = document.getElementById("kpisco-total-incentive");
  if (incentiveEl) incentiveEl.textContent = formatRupiah(totals.estimasi_insentif || 0);

  const topScoEl = document.getElementById("kpisco-top-sco");
  const topDetailEl = document.getElementById("kpisco-top-detail");
  if (topScoEl && kpiList.length > 0) {
    const top = kpiList[0];
    topScoEl.textContent = top.sco;
    const topScore = (top.total_score || 0) * (top.total_score <= 1 ? 100 : 1);
    if (topDetailEl) {
      topDetailEl.textContent = `Skor: ${topScore.toFixed(1)}% &bull; Insentif: ${formatRupiah(top.estimasi_insentif)}`;
    }
  }

  const avgScoreEl = document.getElementById("kpisco-avg-score");
  const avgBadgeEl = document.getElementById("kpisco-avg-score-badge");
  if (avgScoreEl) {
    const rawAvg = totals.total_score !== undefined ? totals.total_score : (totals.avg_score || 0);
    const avg = rawAvg * (rawAvg <= 1 ? 100 : 1);
    avgScoreEl.textContent = `${avg.toFixed(1)}%`;
    if (avgBadgeEl) avgBadgeEl.textContent = `${avg.toFixed(1)}% RATA-RATA`;
  }

  const totalNetEl = document.getElementById("kpisco-total-net-trx");
  const totalNetSubEl = document.getElementById("kpisco-total-net-sub");
  if (totalNetEl) {
    const netRate = totals.net_trx !== undefined ? totals.net_trx : (totals.net_claim_rate || 0);
    const grossRate = totals.nov_gross !== undefined ? totals.nov_gross : (totals.nov_gross_rate || 0);
    const lostRate = (grossRate - netRate) >= 0 ? (grossRate - netRate) : 0;
    totalNetEl.textContent = formatRate(netRate);
    if (totalNetSubEl) {
      totalNetSubEl.textContent = `Gross: ${formatRate(grossRate)} (Lost: ${formatRate(lostRate)})`;
    }
  }
}

function renderKpiScoTable(kpiList, totals) {
  const tbody = document.getElementById("tbody-visit-kpisco");
  const tfoot = document.getElementById("tfoot-visit-kpisco");
  if (!tbody) return;

  if (!kpiList || kpiList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="22" class="text-center" style="padding: 24px; color: var(--text-muted);">Tidak ada data KPI SCO</td></tr>`;
    if (tfoot) tfoot.innerHTML = "";
    return;
  }

  let html = "";
  kpiList.forEach((row, idx) => {
    const rank = row.rank || (idx + 1);
    const rankPill = rank === 1
      ? `<span class="pill-badge" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">#1</span>`
      : `<span style="font-weight: 700; color: var(--text-muted);">#${rank}</span>`;

    // Pilar 1
    const vTgt = row.visit_target !== undefined ? row.visit_target : (row.visit_tgt || 0);
    const vAch = row.visit_realisasi !== undefined ? row.visit_realisasi : (row.visit_ach || 0);
    const vPct = (row.visit_ach_pct !== undefined ? row.visit_ach_pct : (row.visit_pct || 0)) * ((row.visit_ach_pct || row.visit_pct || 0) <= 1 ? 100 : 1);
    const vScore = (row.visit_score !== undefined ? row.visit_score : (row.score_visit || 0)) * ((row.visit_score || row.score_visit || 0) <= 1 ? 100 : 1);

    // Pilar 2
    const cTgt = row.coll_target !== undefined ? row.coll_target : (row.collection_tgt || 0);
    const cAch = row.coll_realisasi !== undefined ? row.coll_realisasi : (row.collection_ach || 0);
    const cPct = (row.coll_ach_pct !== undefined ? row.coll_ach_pct : (row.collection_pct || 0)) * ((row.coll_ach_pct || row.collection_pct || 0) <= 1 ? 100 : 1);
    const cScore = (row.coll_score !== undefined ? row.coll_score : (row.score_collection || 0)) * ((row.coll_score || row.score_collection || 0) <= 1 ? 100 : 1);

    // Pilar 3
    const nTgt = row.net_target !== undefined ? row.net_target : (row.net_tgt_rate || 0);
    const nTrx = row.net_trx !== undefined ? row.net_trx : (row.net_claim_rate || 0);
    const nPct = (row.net_ach_pct !== undefined ? row.net_ach_pct : (row.net_trx_pct || 0)) * ((row.net_ach_pct || row.net_trx_pct || 0) <= 1 ? 100 : 1);
    const nScore = (row.net_score !== undefined ? row.net_score : (row.score_net_trx || 0)) * ((row.net_score || row.score_net_trx || 0) <= 1 ? 100 : 1);

    // Pilar 4
    const octG = row.oct_gross !== undefined ? row.oct_gross : (row.oct_gross_rate || 0);
    const novG = row.nov_gross !== undefined ? row.nov_gross : (row.nov_gross_rate || 0);
    const grwRaw = row.growth_pct !== undefined ? row.growth_pct : 0;
    const grwPct = grwRaw * (Math.abs(grwRaw) <= 1 ? 100 : 1);
    const grwScoreRaw = row.growth_score !== undefined ? row.growth_score : (row.score_growth || 0);
    const grwScore = grwScoreRaw * (Math.abs(grwScoreRaw) <= 1 ? 100 : 1);

    // Hasil & Multiplier
    const totScoreRaw = row.total_score !== undefined ? row.total_score : 0;
    const totScore = totScoreRaw * (totScoreRaw <= 1 ? 100 : 1);
    const mulRaw = row.multiplier !== undefined ? row.multiplier : 0;
    const mul = mulRaw * (mulRaw <= 1 ? 100 : 1);
    const insentif = row.estimasi_insentif || 0;

    const multiColor = mul >= 80 ? '#10b981' : (mul >= 60 ? '#f59e0b' : '#ef4444');
    const grwScoreColor = grwScore >= 0 ? '#7c3aed' : '#ef4444';

    html += `
      <tr>
        <td class="text-center">${rankPill}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(row.sco)}</div>
        </td>
        <td style="border-right: 1px solid var(--surface-border);">
          <span class="pill-badge" style="background: var(--surface-bg); border: 1px solid var(--surface-border); color: var(--text-muted); font-size: 11px;">${escapeHtml(row.cabang)}</span>
        </td>

        <!-- PILAR 1: VISIT (15%) -->
        <td class="text-right" style="font-family: var(--font-mono);">${formatNum(vTgt)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatNum(vAch)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 600;">${vPct.toFixed(1)}%</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800; color: var(--primary); border-right: 1px solid var(--surface-border);">${vScore.toFixed(2)}%</td>

        <!-- PILAR 2: COLLECTION (25%) -->
        <td class="text-right" style="font-family: var(--font-mono);">${formatCollection(cTgt)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 600;">${formatCollection(cAch)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 600;">${cPct.toFixed(1)}%</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800; color: #d97706; border-right: 1px solid var(--surface-border);">${cScore.toFixed(2)}%</td>

        <!-- PILAR 3: NET TRX (35%) -->
        <td class="text-right" style="font-family: var(--font-mono);">${formatRate(nTgt)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: #059669;">${formatRate(nTrx)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 600;">${nPct.toFixed(1)}%</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800; color: #059669; border-right: 1px solid var(--surface-border);">${nScore.toFixed(2)}%</td>

        <!-- PILAR 4: GROWTH GROSS (25%) -->
        <td class="text-right" style="font-family: var(--font-mono);">${formatRate(octG)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatRate(novG)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 600; color: ${grwPct >= 0 ? '#10b981' : '#ef4444'};">${grwPct >= 0 ? '+' : ''}${grwPct.toFixed(2)}%</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800; color: ${grwScoreColor}; border-right: 1px solid var(--surface-border);">${grwScore >= 0 ? '+' : ''}${grwScore.toFixed(2)}%</td>

        <!-- HASIL & INSENTIF -->
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800; color: var(--text-main);">${totScore.toFixed(2)}%</td>
        <td class="text-center" style="font-family: var(--font-mono); font-weight: 800; color: ${multiColor};">${mul.toFixed(2)}%</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800; color: #059669; background: rgba(16, 185, 129, 0.08); font-size: 13px;">${formatRupiah(insentif)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;

  if (tfoot && totals) {
    const totVTgt = totals.visit_target !== undefined ? totals.visit_target : (totals.visit_tgt || 0);
    const totVAch = totals.visit_realisasi !== undefined ? totals.visit_realisasi : (totals.visit_ach || 0);
    const totVPct = (totals.visit_ach_pct !== undefined ? totals.visit_ach_pct : (totals.visit_pct || 0)) * ((totals.visit_ach_pct || totals.visit_pct || 0) <= 1 ? 100 : 1);
    const totVScore = (totals.visit_score !== undefined ? totals.visit_score : (totals.score_visit || 0)) * ((totals.visit_score || totals.score_visit || 0) <= 1 ? 100 : 1);

    const totCTgt = totals.coll_target !== undefined ? totals.coll_target : (totals.collection_tgt || 0);
    const totCAch = totals.coll_realisasi !== undefined ? totals.coll_realisasi : (totals.collection_ach || 0);
    const totCPct = (totals.coll_ach_pct !== undefined ? totals.coll_ach_pct : (totals.collection_pct || 0)) * ((totals.coll_ach_pct || totals.collection_pct || 0) <= 1 ? 100 : 1);
    const totCScore = (totals.coll_score !== undefined ? totals.coll_score : (totals.score_collection || 0)) * ((totals.coll_score || totals.score_collection || 0) <= 1 ? 100 : 1);

    const totNTgt = totals.net_target !== undefined ? totals.net_target : (totals.net_tgt_rate || 0);
    const totNTrx = totals.net_trx !== undefined ? totals.net_trx : (totals.net_claim_rate || 0);
    const totNPct = (totals.net_ach_pct !== undefined ? totals.net_ach_pct : (totals.net_trx_pct || 0)) * ((totals.net_ach_pct || totals.net_trx_pct || 0) <= 1 ? 100 : 1);
    const totNScore = (totals.net_score !== undefined ? totals.net_score : (totals.score_net_trx || 0)) * ((totals.net_score || totals.score_net_trx || 0) <= 1 ? 100 : 1);

    const totOctG = totals.oct_gross !== undefined ? totals.oct_gross : (totals.oct_gross_rate || 0);
    const totNovG = totals.nov_gross !== undefined ? totals.nov_gross : (totals.nov_gross_rate || 0);
    const totGrwRaw = totals.growth_pct !== undefined ? totals.growth_pct : 0;
    const totGrwPct = totGrwRaw * (Math.abs(totGrwRaw) <= 1 ? 100 : 1);
    const totGrwScoreRaw = totals.growth_score !== undefined ? totals.growth_score : (totals.score_growth || 0);
    const totGrwScore = totGrwScoreRaw * (Math.abs(totGrwScoreRaw) <= 1 ? 100 : 1);

    const totScoreRaw = totals.total_score !== undefined ? totals.total_score : (totals.avg_score || 0);
    const totScore = totScoreRaw * (totScoreRaw <= 1 ? 100 : 1);

    tfoot.innerHTML = `
      <tr class="total-row">
        <td colspan="3" style="font-weight: 800; border-right: 1px solid var(--surface-border);">TOTAL (6 SCO)</td>
        
        <!-- PILAR 1 -->
        <td class="text-right" style="font-family: var(--font-mono);">${formatNum(totVTgt)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatNum(totVAch)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${totVPct.toFixed(1)}%</td>
        <td class="text-right" style="font-family: var(--font-mono); border-right: 1px solid var(--surface-border); color: var(--primary);">${totVScore.toFixed(2)}%</td>

        <!-- PILAR 2 -->
        <td class="text-right" style="font-family: var(--font-mono);">${formatCollection(totCTgt)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatCollection(totCAch)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${totCPct.toFixed(1)}%</td>
        <td class="text-right" style="font-family: var(--font-mono); border-right: 1px solid var(--surface-border); color: #d97706;">${totCScore.toFixed(2)}%</td>

        <!-- PILAR 3 -->
        <td class="text-right" style="font-family: var(--font-mono);">${formatRate(totNTgt)}</td>
        <td class="text-right" style="font-family: var(--font-mono); color: #059669;">${formatRate(totNTrx)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${totNPct.toFixed(1)}%</td>
        <td class="text-right" style="font-family: var(--font-mono); border-right: 1px solid var(--surface-border); color: #059669;">${totNScore.toFixed(2)}%</td>

        <!-- PILAR 4 -->
        <td class="text-right" style="font-family: var(--font-mono);">${formatRate(totOctG)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatRate(totNovG)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${totGrwPct >= 0 ? '+' : ''}${totGrwPct.toFixed(2)}%</td>
        <td class="text-right" style="font-family: var(--font-mono); border-right: 1px solid var(--surface-border); color: #7c3aed;">${totGrwScore >= 0 ? '+' : ''}${totGrwScore.toFixed(2)}%</td>

        <!-- HASIL -->
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800;">${totScore.toFixed(2)}%</td>
        <td class="text-center" style="font-family: var(--font-mono); font-weight: 800;">-</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 800; color: #059669; background: rgba(16, 185, 129, 0.15); font-size: 13.5px;">${formatRupiah(totals.estimasi_insentif || 0)}</td>
      </tr>
    `;
  }
}

// ==============================================================================
// MODAL INPUT COLLECTION MANUAL
// ==============================================================================

function openCollectionModal() {
  const modal = document.getElementById("modal-collection");
  const tbody = document.getElementById("tbody-collection-inputs");
  if (!modal || !tbody) return;

  const kpiList = _kpiScoData?.kpi || [];

  let html = "";
  kpiList.forEach(item => {
    const tgt = item.coll_target !== undefined ? item.coll_target : (item.collection_tgt || 0);
    const ach = item.coll_realisasi !== undefined ? item.coll_realisasi : (item.collection_ach || 0);
    const pct = tgt > 0 ? ((ach / tgt) * 100).toFixed(1) : "0.0";

    html += `
      <tr data-sco="${escapeHtml(item.sco)}">
        <td style="font-weight: 700; color: var(--text-main);">${escapeHtml(item.sco)}</td>
        <td><span class="pill-badge" style="background: var(--surface-bg); border: 1px solid var(--surface-border); font-size: 11px;">${escapeHtml(item.cabang)}</span></td>
        <td>
          <input type="number" class="input-collection input-col-tgt" value="${tgt}" step="1" oninput="handleCollectionInputLive(this)">
        </td>
        <td>
          <input type="number" class="input-collection input-col-ach" value="${ach}" step="1" oninput="handleCollectionInputLive(this)">
        </td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: #d97706;">
          <span class="label-col-pct">${pct}%</span>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  modal.style.display = "flex";
}
window.openCollectionModal = openCollectionModal;

function closeCollectionModal() {
  const modal = document.getElementById("modal-collection");
  if (modal) modal.style.display = "none";
}
window.closeCollectionModal = closeCollectionModal;

function handleCollectionInputLive(inputEl) {
  const row = inputEl.closest("tr");
  if (!row) return;
  const tgt = parseFloat(row.querySelector(".input-col-tgt")?.value) || 0;
  const ach = parseFloat(row.querySelector(".input-col-ach")?.value) || 0;
  const pctEl = row.querySelector(".label-col-pct");
  if (pctEl) {
    const pct = tgt > 0 ? ((ach / tgt) * 100).toFixed(1) : "0.0";
    pctEl.textContent = `${pct}%`;
  }
}
window.handleCollectionInputLive = handleCollectionInputLive;

async function saveCollectionData() {
  const rows = document.querySelectorAll("#tbody-collection-inputs tr");
  const payload = {};

  rows.forEach(row => {
    const sco = row.getAttribute("data-sco");
    if (!sco) return;
    const tgt = parseFloat(row.querySelector(".input-col-tgt")?.value) || 0;
    const ach = parseFloat(row.querySelector(".input-col-ach")?.value) || 0;
    payload[sco] = { target: tgt, realisasi: ach, actual: ach };
  });

  try {
    const res = await fetch("/api/visit/save-collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Gagal menyimpan collection");

    alert("Berhasil menyimpan Target & Realisasi Collection!\nFile Excel KPI_SCO.xlsx telah otomatis diperbarui.");
    closeCollectionModal();

    _kpiScoData = data;
    renderKpiScoSummary(data);
    renderKpiScoTable(data.kpi || [], data.totals || {});
  } catch (err) {
    console.error("[Visit] Error saving collection:", err);
    alert("Gagal menyimpan data collection: " + err.message);
  }
}
window.saveCollectionData = saveCollectionData;

/**
 * Upload Laporan Kunjungan Excel Baru
 */
async function handleVisitFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!confirm(`Unggah dan proses file laporan kunjungan:\n"${file.name}"?`)) {
    event.target.value = "";
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    if (typeof showEngineLoader === "function") showEngineLoader();

    const res = await fetch("/api/visit/upload", {
      method: "POST",
      body: formData
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Gagal mengolah file laporan kunjungan");

    alert(`Berhasil mengolah laporan kunjungan!\nTotal Kunjungan: ${formatNum(data.kpi?.total_score || 0)} / ${formatNum(data.kpi?.total_target || 0)} (${data.kpi?.overall_pct || 0}%)`);
    
    _visitData = data;
    renderVisitSummary(data);

    // Refresh Tab 2 & Tab 3 jika sudah dimuat
    if (_pjpClaimData) loadPjpClaimData(true);
    if (_kpiScoData) loadKpiScoData(true);
  } catch (err) {
    console.error("[Visit] Upload error:", err);
    alert("Gagal mengunggah file laporan: " + err.message);
  } finally {
    if (typeof hideEngineLoader === "function") hideEngineLoader();
    event.target.value = "";
  }
}
window.handleVisitFileUpload = handleVisitFileUpload;

// ── HELPER FUNCTIONS ──────────────────────────────────────────────────────────

function formatNum(val) {
  if (val === null || val === undefined || isNaN(val)) return "0";
  return new Intl.NumberFormat("id-ID").format(Math.round(val));
}

function formatRate(val, decimals = 2) {
  if (val === null || val === undefined || isNaN(val)) return "0.00";
  return Number(val).toLocaleString("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatRupiah(val) {
  if (val === null || val === undefined || isNaN(val)) return "Rp 0";
  return "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(val));
}

function formatCollection(val) {
  if (val === null || val === undefined || isNaN(val)) return "0";
  if (val >= 1000000) return formatRupiah(val);
  return formatNum(val) + " Jt";
}

function formatDateHeader(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const day = parts[2];
  const month = parts[1];

  // Hitung nama hari
  const d = new Date(dateStr);
  const daysId = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const dayName = daysId[d.getDay()] || "";

  return `${day}/${month} (${dayName})`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
