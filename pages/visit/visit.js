/**
 * pages/visit/visit.js — Target Kunjungan SCO vs Realisasi
 * Standar Arsitektur: Blueprint #YoY (Hukum 10 GEMINI.md) & Anti-AI Slop (Lucide Vector SVG)
 */

let _visitData = null;
let _currentTab = "leaderboard";
let _chartVisitSco = null;
let _rawAuditRecords = [];

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

  // 5. Tab 2: Schedule & Telemetry
  renderScheduleSection(jadwalBreakdown, leaderboard, kpi);

  // 6. Tab 3: Setup filter options & initial audit load
  setupAuditFilterOptions(leaderboard, dates);
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

/**
 * Render Tab 2: Jadwal Siklus Cards, Telemetri, dan Chart
 */
function renderScheduleSection(jadwalBreakdown, leaderboard, kpi) {
  // 1. Siklus Cards
  const gridCards = document.getElementById("grid-siklus-cards");
  if (gridCards && jadwalBreakdown) {
    let cardsHtml = "";
    const colorMap = {
      "Senin,Kamis": "#0284c7",
      "Selasa,Jum'at": "#10b981",
      "Rabu,Sabtu": "#8b5cf6"
    };

    jadwalBreakdown.forEach(item => {
      const color = colorMap[item.jadwal] || "var(--primary)";
      cardsHtml += `
        <div class="visit-kpi-card" style="border-left: 4px solid ${color};">
          <div class="visit-kpi-label">
            <span>Siklus ${escapeHtml(item.jadwal)}</span>
            <span class="pill-badge" style="background: rgba(2, 132, 199, 0.08); color: ${color};">${item.achievement_pct.toFixed(1)}% HIT</span>
          </div>
          <div class="visit-kpi-val" style="color: ${color};">${formatNum(item.realisasi)} <span style="font-size: 15px; color: var(--text-muted); font-weight: 400;">/ ${formatNum(item.target)}</span></div>
          <div class="visit-kpi-sub">
            <span style="color: #ef4444; font-weight: 700;">${formatNum(item.missed)} Toko Terlewat</span>
            <span>&bull;</span>
            <span>${(item.target / 4).toFixed(0)} Toko / Hari Siklus</span>
          </div>
        </div>
      `;
    });
    gridCards.innerHTML = cardsHtml;
  }

  // 2. Telemetri
  const teleOn = document.getElementById("tele-on-schedule");
  if (teleOn) teleOn.textContent = formatNum(kpi.total_score || 0);

  const teleOff = document.getElementById("tele-off-schedule");
  if (teleOff) teleOff.textContent = formatNum(kpi.off_target_visits || 0);

  const teleTotal = document.getElementById("tele-total-input");
  if (teleTotal) teleTotal.textContent = formatNum(kpi.total_physical_visits || 0);

  // 3. Chart.js Bar Chart
  renderVisitChart(leaderboard);
}

/**
 * Render Chart.js Bar Chart: Target vs Realisasi Per SCO
 */
function renderVisitChart(leaderboard) {
  const canvas = document.getElementById("chartVisitSco");
  if (!canvas) return;

  if (typeof Chart === "undefined") {
    console.warn("[Visit] Chart.js belum tersedia di window");
    return;
  }

  if (_chartVisitSco) {
    _chartVisitSco.destroy();
    _chartVisitSco = null;
  }

  const labels = leaderboard.map(row => row.sco);
  const targets = leaderboard.map(row => row.target);
  const realizations = leaderboard.map(row => row.realisasi);

  const ctx = canvas.getContext("2d");
  _chartVisitSco = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Target Kunjungan",
          data: targets,
          backgroundColor: "rgba(2, 132, 199, 0.4)",
          borderColor: "#0284c7",
          borderWidth: 1.5,
          borderRadius: 4
        },
        {
          label: "Realisasi Kunjungan (Score = 1)",
          data: realizations,
          backgroundColor: "rgba(16, 185, 129, 0.75)",
          borderColor: "#10b981",
          borderWidth: 1.5,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: {
            font: { size: 12, weight: 600 },
            color: "var(--text-main)",
            boxWidth: 14
          }
        },
        tooltip: {
          callbacks: {
            afterBody: function(context) {
              const idx = context[0].dataIndex;
              const t = targets[idx];
              const r = realizations[idx];
              const pct = t > 0 ? ((r / t) * 100).toFixed(1) : 0;
              return `Pencapaian: ${pct}% (Terlewat: ${t - r})`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "var(--text-muted)", font: { weight: 600 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(148, 163, 184, 0.15)" },
          ticks: { color: "var(--text-muted)", precision: 0 }
        }
      }
    }
  });
}

/**
 * Tab Navigation Switcher
 */
function switchVisitTab(tabName) {
  _currentTab = tabName;

  // Buttons
  document.getElementById("tab-btn-leaderboard")?.classList.toggle("active", tabName === "leaderboard");
  document.getElementById("tab-btn-schedule")?.classList.toggle("active", tabName === "schedule");
  document.getElementById("tab-btn-audit")?.classList.toggle("active", tabName === "audit");

  // Panels
  const viewLeaderboard = document.getElementById("view-visit-leaderboard");
  const viewSchedule = document.getElementById("view-visit-schedule");
  const viewAudit = document.getElementById("view-visit-audit");

  if (viewLeaderboard) viewLeaderboard.style.display = tabName === "leaderboard" ? "flex" : "none";
  if (viewSchedule) viewSchedule.style.display = tabName === "schedule" ? "flex" : "none";
  if (viewAudit) viewAudit.style.display = tabName === "audit" ? "flex" : "none";

  if (tabName === "schedule" && _visitData) {
    setTimeout(() => {
      renderVisitChart(_visitData.leaderboard || []);
    }, 50);
  }

  if (tabName === "audit" && _rawAuditRecords.length === 0) {
    applyAuditFilters();
  }
}
window.switchVisitTab = switchVisitTab;

/**
 * Setup options untuk filter Tab 3
 */
function setupAuditFilterOptions(leaderboard, dates) {
  const selSco = document.getElementById("filter-audit-sco");
  if (selSco && selSco.children.length <= 1) {
    leaderboard.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.sco;
      opt.textContent = `${item.sco} (${item.cabang})`;
      selSco.appendChild(opt);
    });
  }

  const selDate = document.getElementById("filter-audit-date");
  if (selDate && selDate.children.length <= 1) {
    dates.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = `${formatDateHeader(d)} - ${d}`;
      selDate.appendChild(opt);
    });
  }
}

/**
 * Filter dan load detail audit dari server
 */
async function applyAuditFilters() {
  const scoVal = document.getElementById("filter-audit-sco")?.value || "ALL";
  const dateVal = document.getElementById("filter-audit-date")?.value || "ALL";
  const statusVal = document.getElementById("filter-audit-status")?.value || "MISSED";

  const tbody = document.getElementById("tbody-visit-audit");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 24px; color: var(--text-muted);">Memuat rincian kunjungan...</td></tr>`;
  }

  try {
    const params = new URLSearchParams();
    if (scoVal !== "ALL") params.append("sco", scoVal);
    if (dateVal !== "ALL") params.append("date", dateVal);
    if (statusVal !== "ALL") params.append("status", statusVal);
    params.append("limit", "1000");

    const res = await fetch(`/api/visit/detail?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Gagal mengambil detail");

    _rawAuditRecords = data.data || [];
    renderAuditRows(_rawAuditRecords);
  } catch (err) {
    console.error("[Visit] Error loading detail:", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 24px; color: #ef4444;">Gagal memuat detail audit: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}
window.applyAuditFilters = applyAuditFilters;

/**
 * Search di sisi client untuk filter toko/AR
 */
function applyAuditSearch() {
  const query = (document.getElementById("filter-audit-search")?.value || "").trim().toLowerCase();
  if (!query) {
    renderAuditRows(_rawAuditRecords);
    return;
  }

  const filtered = _rawAuditRecords.filter(row => {
    return (row.agen_id || "").toLowerCase().includes(query) ||
           (row.nama_agen || "").toLowerCase().includes(query) ||
           (row.sco || "").toLowerCase().includes(query) ||
           (row.catatan || "").toLowerCase().includes(query);
  });

  renderAuditRows(filtered);
}
window.applyAuditSearch = applyAuditSearch;

/**
 * Render baris audit ke tbody
 */
function renderAuditRows(records) {
  const tbody = document.getElementById("tbody-visit-audit");
  const countEl = document.getElementById("audit-filter-count");
  if (!tbody) return;

  if (countEl) {
    countEl.textContent = `Menampilkan ${formatNum(records.length)} baris`;
  }

  if (!records || records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 24px; color: var(--text-muted);">Tidak ada rekaman kunjungan sesuai filter</td></tr>`;
    return;
  }

  let html = "";
  records.forEach(row => {
    const isVisited = row.score === 1;
    const isIzin = row.is_izin === 1 || row.status_visit === 'IZIN';
    let statusPill = "";
    if (isIzin) {
      statusPill = `<span class="pill-badge pill-izin">IZIN</span>`;
    } else if (isVisited) {
      statusPill = `<span class="pill-badge" style="background: rgba(16, 185, 129, 0.12); color: #10b981;">DIKUNJUNGI</span>`;
    } else {
      statusPill = `<span class="pill-badge" style="background: rgba(239, 68, 68, 0.12); color: #ef4444;">TERLEWAT</span>`;
    }

    html += `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 11.5px;">${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.hari || '')}</td>
        <td style="font-weight: 700;">${escapeHtml(row.sco)}</td>
        <td><span class="pill-badge" style="background: var(--surface-bg); border: 1px solid var(--surface-border); color: var(--text-muted); font-size: 11px;">${escapeHtml(row.cabang)}</span></td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--primary);">${escapeHtml(row.agen_id)}</td>
        <td style="font-weight: 600;">${escapeHtml(row.nama_agen)}</td>
        <td style="color: var(--text-muted);">${escapeHtml(row.tipe_agen || '-')}</td>
        <td style="color: var(--text-muted);">${escapeHtml(row.jadwal || '-')}</td>
        <td class="text-center">${statusPill}</td>
        <td style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">${escapeHtml(row.waktu || '-')}</td>
        <td style="font-size: 11.5px; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(row.catatan || '-')}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

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
    _rawAuditRecords = [];
    applyAuditFilters();
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
