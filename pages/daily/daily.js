// daily.js — Controller untuk Daily Summary Report sesuai spesifikasi DEPAS

let dailyBrand = "ASTAGA";
let dailyCurrPeriod = "";
let dailyPrevPeriod = "";
let dailyChartInstance = null;

function formatInt(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Number(num).toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatFloat(num, dec = 2) {
  if (num === null || num === undefined || isNaN(num)) return "0.00";
  return Number(num).toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
}

function renderDiffBadge(diff, dec = 0) {
  if (diff === null || diff === undefined || isNaN(diff)) return "";
  const isPos = diff > 0;
  const isZero = diff === 0;
  const cls = isZero ? "diff-zero" : (isPos ? "diff-pos" : "diff-neg");
  const sign = isPos ? "+" : (diff < 0 ? "-" : "");
  const numStr = dec > 0 ? Number(Math.abs(diff)).toFixed(dec) : Number(Math.abs(diff)).toLocaleString("id-ID");
  return `<span class="diff-badge ${cls}">(${sign}${numStr})</span>`;
}

function renderSuksesBadge(diff) {
  if (diff === null || diff === undefined || isNaN(diff)) return "";
  const isPos = diff > 0;
  const isZero = diff === 0;
  const cls = isZero ? "diff-zero" : (isPos ? "diff-pos" : "diff-neg");
  const arrow = isPos ? "▲+" : (diff < 0 ? "▼-" : "");
  return `<span class="delta-pill ${cls}">${arrow}${Math.abs(diff).toFixed(1)}%</span>`;
}

function renderSpeedBadge(diffSec) {
  if (diffSec === null || diffSec === undefined || isNaN(diffSec)) return "";
  const isPos = diffSec > 0;
  const isZero = diffSec === 0;
  const cls = isZero ? "diff-zero" : "diff-speed";
  const sign = isPos ? "+" : (diffSec < 0 ? "-" : "");
  return `<span class="delta-pill ${cls}">${sign}${Math.abs(diffSec)}s</span>`;
}

function updatePill(id, diff, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  const isPos = diff >= 0;
  const prefix = isPos ? "+" : "";
  const cls = isPos ? "positive" : "negative";
  el.className = `pill ${cls}`;
  el.textContent = `${prefix}${formatInt(diff)} (${prefix}${Number(pct).toFixed(2)}%)`;
}

async function loadDailyPeriods() {
  try {
    const res = await fetch(`/api/daily/periods?brand=${dailyBrand}`);
    const json = await res.json();
    const select = document.getElementById("daily-period-select");
    if (!select) return;

    select.innerHTML = "";
    const periods = json.periods || [];
    periods.forEach(p => {
      const opt = document.createElement("option");
      opt.value = `${p.curr}|${p.prev}`;
      opt.textContent = `${p.curr} (vs ${p.prev})`;
      select.appendChild(opt);
    });

    if (periods.length > 0) {
      dailyCurrPeriod = periods[0].curr;
      dailyPrevPeriod = periods[0].prev;
      select.value = `${dailyCurrPeriod}|${dailyPrevPeriod}`;
      loadDailyData();
    }
  } catch (err) {
    console.error("Gagal memuat periode daily:", err);
  }
}

async function loadDailyData() {
  if (!dailyCurrPeriod || !dailyPrevPeriod) return;

  try {
    const url = `/api/daily?brand=${dailyBrand}&curr=${dailyCurrPeriod}&prev=${dailyPrevPeriod}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok || !json.data) throw new Error(json.error || "Gagal mengambil data");

    const d = json.data;
    const kpi = d.kpi;
    const isOki = dailyBrand === "OKIPAY";
    const brandColor = isOki ? "#dc2626" : "#0284c7";

    // Header badge & subtitle
    const badgeEl = document.getElementById("daily-updated-badge");
    if (badgeEl) {
      badgeEl.textContent = `Updated s/d tgl ${d.curr_month} (${d.days_curr} hari)`;
    }
    const subtitleEl = document.getElementById("daily-period-subtitle");
    if (subtitleEl) {
      subtitleEl.textContent = `Periode: ${d.prev_month} (Bulan Lalu) — ${d.curr_month} (Bulan Ini)`;
    }
    const logoEl = document.getElementById("daily-brand-logo");
    if (logoEl) {
      logoEl.src = isOki ? "/static/img/logo_okipay.png" : "/static/img/logo_myastaga.png";
      logoEl.alt = isOki ? "Logo OKIPAY" : "Logo ASTAGA";
    }
    const footerEl = document.getElementById("daily-footer-timestamp");
    if (footerEl) {
      const now = new Date();
      footerEl.textContent = `Generated: ${now.toLocaleDateString("id-ID")} ${now.toLocaleTimeString("id-ID")}`;
    }

    // 1. KPI CARDS
    document.getElementById("kpi-val-trx").textContent = formatInt(kpi.avg_trx_curr);
    updatePill("kpi-growth-trx", kpi.diff_trx, kpi.growth_trx_pct);
    document.getElementById("kpi-prev-trx").textContent = `BL: ${formatInt(kpi.avg_trx_prev)}`;
    document.getElementById("kpi-mtd-trx").textContent = `Total MTD: ${formatInt(kpi.total_mtd_trx)}`;

    document.getElementById("kpi-val-mem").textContent = formatInt(kpi.avg_mem_curr);
    updatePill("kpi-growth-mem", kpi.diff_mem, kpi.growth_mem_pct);
    document.getElementById("kpi-prev-mem").textContent = `BL: ${formatInt(kpi.avg_mem_prev)}`;

    document.getElementById("kpi-val-tpm").textContent = formatFloat(kpi.tpm_curr, 2);
    const elTpm = document.getElementById("kpi-growth-tpm");
    if (elTpm) {
      const isPos = kpi.diff_tpm >= 0;
      elTpm.className = `pill ${isPos ? 'positive' : 'negative'}`;
      elTpm.textContent = `${isPos ? '+' : ''}${formatFloat(kpi.diff_tpm, 2)} (${kpi.growth_tpm_pct >= 0 ? '+' : ''}${kpi.growth_tpm_pct.toFixed(1)}%)`;
    }
    document.getElementById("kpi-prev-tpm").textContent = `BL: ${formatFloat(kpi.tpm_prev, 2)}`;

    document.getElementById("kpi-val-sukses").textContent = `${kpi.sukses_pct_curr.toFixed(1)}%`;
    const elSukses = document.getElementById("kpi-growth-sukses");
    if (elSukses) {
      const diffSuksesCls = kpi.diff_sukses >= 0 ? "positive" : "negative";
      const diffSuksesSign = kpi.diff_sukses >= 0 ? "+" : "";
      elSukses.className = `pill ${diffSuksesCls}`;
      elSukses.textContent = `${diffSuksesSign}${kpi.diff_sukses.toFixed(1)}% vs BL`;
    }
    document.getElementById("kpi-val-dur").textContent = `Avg Dur: ${kpi.avg_dur_curr_str}`;
    document.getElementById("kpi-prev-dur").textContent = `BL: ${kpi.avg_dur_prev_str}`;

    // 2. TREN HARIAN CHART
    renderTrendChart(d.daily_chart, brandColor);

    // 3. PERFORMANSI CABANG
    renderBranches(d.branches, d.total_branch, brandColor);

    // 4. PERFORMANSI PRODUK (Sesuai Hirarki Gambar DEPAS)
    renderProducts(d.products, d.grand_total_prod, brandColor);

  } catch (err) {
    console.error("Error loading daily report:", err);
  }
}

function renderTrendChart(chartData, brandColor) {
  const canvas = document.getElementById("chart-daily-trend");
  if (!canvas) return;

  if (dailyChartInstance) {
    dailyChartInstance.destroy();
  }

  const labels = chartData.map(c => c.label || `Tgl ${c.day}`);
  const trxData = chartData.map(c => c.trx);
  const memData = chartData.map(c => c.member);

  dailyChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Daily Trx",
          data: trxData,
          backgroundColor: brandColor,
          borderRadius: 4,
          yAxisID: "y"
        },
        {
          label: "Daily Member",
          data: memData,
          type: "line",
          borderColor: "#d97706",
          backgroundColor: "#d97706",
          borderWidth: 2,
          pointRadius: 4,
          fill: false,
          yAxisID: "y1"
        }
      ]
    },
    plugins: [
      {
        id: "barValueLabels",
        afterDatasetsDraw(chart) {
          const ctx = chart.ctx;
          const meta = chart.getDatasetMeta(0);
          if (!meta || meta.hidden) return;

          ctx.save();
          ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
          ctx.fillStyle = "#0f172a";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";

          meta.data.forEach((bar, index) => {
            const val = trxData[index];
            if (val !== null && val !== undefined && val > 0) {
              const formatted = Number(Math.round(val)).toLocaleString("id-ID");
              ctx.fillText(formatted, bar.x, bar.y - 4);
            }
          });
          ctx.restore();
        }
      }
    ],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { font: { size: 12, family: "inherit" }, usePointStyle: true }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Trx" },
          grace: "10%" // Memberi ruang ekstra di atas bar tertinggi agar angka tidak terpotong
        },
        y1: {
          type: "linear",
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Member" }
        }
      }
    }
  });
}

function renderBranches(branches, totalBranch, brandColor) {
  const container = document.getElementById("daily-branch-container");
  if (!container) return;

  if (!branches || branches.length === 0) {
    container.innerHTML = `<div class="loader">Tidak ada data cabang</div>`;
    return;
  }

  let html = "";
  branches.forEach(b => {
    html += `
      <div class="h-bar-row">
        <div style="font-weight: 700; display: flex; align-items: center; gap: 6px;">
          <span style="color: #0284c7; font-size: 10px;">●</span>
          <span>${b.cabang}</span>
          <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">(${b.share_pct}%)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="h-bar-bg" style="flex: 1;">
            <div class="h-bar-fill" style="width: ${b.bar_pct}%; background: ${brandColor};"></div>
          </div>
          <div style="min-width: 90px; text-align: right; font-weight: 700;">
            ${formatInt(b.daily_curr)} ${renderDiffBadge(b.diff_trx)}
          </div>
        </div>
        <div style="text-align: right; font-weight: 700;">
          ${formatInt(b.daily_mem_curr)} ${renderDiffBadge(b.diff_mem)}
        </div>
        <div style="text-align: right; font-weight: 700;">
          ${formatFloat(b.tpm_curr, 2)} ${renderDiffBadge(b.diff_tpm, 2)}
        </div>
      </div>
    `;
  });

  if (totalBranch) {
    html += `
      <div class="h-bar-row total-branch-strip" style="background: var(--table-header); border: 1px solid var(--surface-border); font-weight: 800; margin-top: 4px;">
        <div style="display: flex; align-items: center; gap: 6px; color: #0284c7;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          <span>TOTAL CABANG</span>
          <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">(100%)</span>
        </div>
        <div style="text-align: right; font-weight: 800;">
          ${formatInt(totalBranch.daily_curr)} ${renderDiffBadge(totalBranch.diff_trx)}
        </div>
        <div style="text-align: right; font-weight: 800;">
          ${formatInt(totalBranch.daily_mem_curr)} ${renderDiffBadge(totalBranch.diff_mem)}
        </div>
        <div style="text-align: right; font-weight: 800;">
          ${formatFloat(totalBranch.tpm_curr, 2)} ${renderDiffBadge(totalBranch.diff_tpm, 2)}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderProducts(products, grandTotal, brandColor) {
  const container = document.getElementById("daily-product-container");
  if (!container) return;

  if (!products || products.length === 0) {
    container.innerHTML = `<div class="loader">Tidak ada data produk</div>`;
    return;
  }

  let html = "";
  products.forEach(p => {
    const isOp = p.level === 1;
    const namePrefix = isOp
      ? `<span style="color: var(--text-muted); margin-left: 12px; margin-right: 6px;">↳</span>`
      : `<span style="color: #0284c7; font-size: 10px; margin-right: 6px;">●</span>`;
    const nameWeight = isOp ? "500" : "700";
    const nameSize = isOp ? "13px" : "13.5px";

    html += `
      <div class="h-bar-row-prod" style="${isOp ? 'background: transparent; border-color: transparent; padding-top: 6px; padding-bottom: 6px;' : ''}">
        <div style="font-weight: ${nameWeight}; font-size: ${nameSize}; display: flex; align-items: center;">
          ${namePrefix}<span>${p.name}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="h-bar-bg" style="flex: 1;">
            <div class="h-bar-fill" style="width: ${p.bar_pct}%; background: ${brandColor}; opacity: ${isOp ? 0.75 : 1};"></div>
          </div>
          <div style="min-width: 90px; text-align: right; font-weight: 700;">
            ${formatInt(p.daily_curr)} ${renderDiffBadge(p.diff_trx)}
          </div>
        </div>
        <div style="text-align: right; font-weight: 700;">
          ${p.sukses_curr.toFixed(1)}% ${renderSuksesBadge(p.diff_sukses)}
        </div>
        <div style="text-align: right; font-weight: 700;">
          ${p.dur_curr_str} ${renderSpeedBadge(p.diff_dur_sec)}
        </div>
        <div style="text-align: right; font-weight: 700; white-space: nowrap;">
          Rp ${formatInt(p.arpu_curr)} ${renderDiffBadge(p.diff_arpu)}
        </div>
      </div>
    `;
  });

  if (grandTotal) {
    html += `
      <div class="h-bar-row-prod" style="background: var(--table-header); border: 1px solid var(--surface-border); font-weight: 800; margin-top: 6px;">
        <div style="display: flex; align-items: center; gap: 6px; color: #0284c7;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          <span>GRAND TOTAL</span>
        </div>
        <div style="text-align: right; font-weight: 800;">
          ${formatInt(grandTotal.daily_curr)} ${renderDiffBadge(grandTotal.diff_trx)}
        </div>
        <div style="text-align: right; font-weight: 800;">
          ${grandTotal.sukses_curr.toFixed(1)}% ${renderSuksesBadge(grandTotal.diff_sukses)}
        </div>
        <div style="text-align: right; font-weight: 800;">
          ${grandTotal.dur_curr_str} ${renderSpeedBadge(grandTotal.diff_dur_sec)}
        </div>
        <div style="text-align: right; font-weight: 800; white-space: nowrap;">
          Rp ${formatInt(grandTotal.arpu_curr)} ${renderDiffBadge(grandTotal.diff_arpu)}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function switchDailyBrand(brand) {
  dailyBrand = brand;
  const btnAstaga = document.getElementById("btn-brand-astaga");
  const btnOki = document.getElementById("btn-brand-oki");

  const activeBtn = brand === "ASTAGA" ? btnAstaga : btnOki;
  if (brand === "ASTAGA") {
    if (btnAstaga) btnAstaga.classList.add("active");
    if (btnOki) btnOki.classList.remove("active");
  } else {
    if (btnAstaga) btnAstaga.classList.remove("active");
    if (btnOki) btnOki.classList.add("active");
  }

  if (window.triggerBrandSwitchVisual) {
    window.triggerBrandSwitchVisual(brand, activeBtn, "daily-report-capture");
  }

  loadDailyPeriods();
}

function onDailyPeriodChange(val) {
  if (!val) return;
  const [curr, prev] = val.split("|");
  dailyCurrPeriod = curr;
  dailyPrevPeriod = prev;
  loadDailyData();
}

async function downloadDailyPNG() {
  const target = document.getElementById("daily-report-capture");
  const btn = document.getElementById("btn-download-png");
  if (!target) return;

  const origHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-flex; align-items:center; animation:spin 1s linear infinite;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg></span> Memproses HD PNG...`;
  }

  try {
    // scale: 2 produces crystal clear high-DPI image suitable for management reports & WhatsApp/email
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false
    });

    const brandStr = dailyBrand.toUpperCase();
    const periodStr = (dailyCurrPeriod || "daily").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `Daily_Report_${brandStr}_${periodStr}.png`;
    const dataUrl = canvas.toDataURL("image/png");

    if (typeof window.saveFileSmart === "function") {
      await window.saveFileSmart(filename, dataUrl, "image/png");
    } else {
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    }
  } catch (err) {
    console.error("Gagal export PNG:", err);
    alert("Gagal mendownload gambar PNG: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

// Global exports
window.loadDaily = function() {
  loadDailyPeriods();
};
window.switchDailyBrand = switchDailyBrand;
window.onDailyPeriodChange = onDailyPeriodChange;
window.downloadDailyPNG = downloadDailyPNG;

