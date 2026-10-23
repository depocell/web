// pages/admin/admin_financial.js — Executive Financial & Profit Controller (Admin Portal)
// Sesuai Standard GEMINI.md: Net Profit Server = (Jual - Markup) - Beli, Exclude Akun Internal ASTAGA

let _adminFinChart = null;
let _adminFinProfitCache = {};
let _lastAdminPivotData = null;

const adminFinState = {
  brand: "ASTAGA",
  subTab: "dashboard", // 'dashboard' | 'pivot'
  dashYear: "2026",
  dashMonth: "", // '' means all months or current MTD
  pivotYear: "2026",
  pivotMonth: "ALL",
  pivotRowDim: "kategori",
  pivotColDim: "none",
  pivotMetric: "margin_sum",
  pivotStatus: "ALL",
  pivotCabang: "ALL",
  pivotKategori: "ALL",
  pivotOperator: "ALL",
  pivotLimit: 100,
  optionsLoaded: false
};

// ─── Number & Currency Formatters ───────────────────────────────────────────
function finFormatRp(num, withDecimals = false) {
  if (num === null || num === undefined || isNaN(num)) return "Rp 0";
  const opts = withDecimals
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
  return "Rp " + Number(num).toLocaleString("id-ID", opts);
}

function finFormatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Number(num).toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function finEscapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── Initialize & Sub-Tab Switcher ──────────────────────────────────────────
async function initAdminFinancial() {
  // Sync brand with admin global brand
  if (typeof adminActiveBrand !== "undefined") {
    adminFinState.brand = adminActiveBrand;
  }
  switchAdminFinSubTab(adminFinState.subTab);
}

function switchAdminFinSubTab(tab) {
  adminFinState.subTab = tab;

  const btnDash = document.getElementById("admin-fin-subtab-dash");
  const btnPiv = document.getElementById("admin-fin-subtab-piv");
  const secDash = document.getElementById("admin-fin-section-dash");
  const secPiv = document.getElementById("admin-fin-section-piv");

  if (tab === "pivot") {
    if (btnDash) btnDash.classList.remove("active");
    if (btnPiv) btnPiv.classList.add("active");
    if (secDash) secDash.style.display = "none";
    if (secPiv) secPiv.style.display = "flex";

    if (!adminFinState.optionsLoaded) {
      loadAdminFinancialPivotOptions();
    } else {
      runAdminFinancialPivot();
    }
  } else {
    // Default: 'dashboard'
    if (btnDash) btnDash.classList.add("active");
    if (btnPiv) btnPiv.classList.remove("active");
    if (secDash) secDash.style.display = "flex";
    if (secPiv) secPiv.style.display = "none";

    loadAdminFinancialDashboard();
  }
}

function onAdminFinancialBrandChanged(brand) {
  adminFinState.brand = brand;
  _adminFinProfitCache = {}; // Invalidate frontend cache on brand change
  adminFinState.optionsLoaded = false;

  if (adminFinState.subTab === "pivot") {
    loadAdminFinancialPivotOptions();
  } else {
    loadAdminFinancialDashboard();
  }
}

// ─── PART 1: DASHBOARD ANALISA REVENUE & NET PROFIT ─────────────────────────
async function loadAdminFinancialDashboard(forceRefresh = false) {
  const brand = adminFinState.brand || "ASTAGA";
  const yearSel = document.getElementById("admin-fin-dash-year");
  const monthSel = document.getElementById("admin-fin-dash-month");

  const year = yearSel ? yearSel.value : (adminFinState.dashYear || "2026");
  const month = monthSel ? monthSel.value : (adminFinState.dashMonth || "");

  adminFinState.dashYear = year;
  adminFinState.dashMonth = month;

  const cacheKey = `${brand}_${year}_${month || "ALL"}`;
  if (!forceRefresh && _adminFinProfitCache[cacheKey]) {
    renderAdminFinancialDashboard(_adminFinProfitCache[cacheKey]);
    return;
  }

  const catTbody = document.getElementById("table-admin-profit-cat-body");
  if (catTbody) {
    catTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">Memuat kalkulasi laba bersih server ${finEscapeHtml(brand)} (${finEscapeHtml(month || year)})...</td></tr>`;
  }

  try {
    let url = `/api/analisa/profit?brand=${encodeURIComponent(brand)}&year=${encodeURIComponent(year)}`;
    if (month && month !== "ALL") {
      url += `&month=${encodeURIComponent(month)}`;
    }

    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok || !json.data) {
      if (catTbody) {
        catTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: #dc2626;">Gagal memuat data profit: ${finEscapeHtml(json.error || "Terjadi kesalahan")}</td></tr>`;
      }
      return;
    }

    const data = json.data;
    _adminFinProfitCache[cacheKey] = data;

    // Populate month options if not already filled
    if (monthSel && monthSel.options.length <= 1 && data.monthly_trend) {
      const prevVal = monthSel.value;
      monthSel.innerHTML = `<option value="">Semua Bulan (${year})</option>`;
      data.monthly_trend.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.ym;
        opt.textContent = m.ym;
        monthSel.appendChild(opt);
      });
      if (prevVal) monthSel.value = prevVal;
    }

    renderAdminFinancialDashboard(data);
  } catch (err) {
    console.error("Error loading admin profit data:", err);
    if (catTbody) {
      catTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: #dc2626;">Koneksi error: ${finEscapeHtml(err.message)}</td></tr>`;
    }
  }
}

function renderAdminFinancialDashboard(data) {
  try {
    const kpi = data.kpi || {};

    // 1. KPI Cards
    const elRev = document.getElementById("admin-profit-kpi-revenue");
    const elDRev = document.getElementById("admin-profit-kpi-daily-rev");
    const elMod = document.getElementById("admin-profit-kpi-modal");
    const elGross = document.getElementById("admin-profit-kpi-gross");
    const elGMarg = document.getElementById("admin-profit-kpi-gross-margin");
    const elMk = document.getElementById("admin-profit-kpi-markup");
    const elNet = document.getElementById("admin-profit-kpi-net");
    const elNMarg = document.getElementById("admin-profit-kpi-net-margin");
    const elYield = document.getElementById("admin-profit-kpi-yield");
    const elDNet = document.getElementById("admin-profit-kpi-daily-net");

    if (elRev) {
      elRev.textContent = finFormatRp(kpi.gross_revenue || 0);
      elRev.title = finFormatRp(kpi.gross_revenue || 0);
    }
    if (elDRev) elDRev.textContent = `${finFormatRp(kpi.daily_revenue || 0)} / hari`;

    if (elMod) {
      elMod.textContent = finFormatRp(kpi.total_modal || 0);
      elMod.title = finFormatRp(kpi.total_modal || 0);
    }

    if (elGross) {
      elGross.textContent = finFormatRp(kpi.gross_profit || 0);
      elGross.title = finFormatRp(kpi.gross_profit || 0);
    }
    if (elGMarg) elGMarg.textContent = `Margin: ${kpi.margin_gross_pct || 0}%`;

    if (elMk) {
      elMk.textContent = finFormatRp(kpi.komisi_upline || 0);
      elMk.title = finFormatRp(kpi.komisi_upline || 0);
    }

    if (elNet) {
      elNet.textContent = finFormatRp(kpi.net_profit || 0);
      elNet.title = finFormatRp(kpi.net_profit || 0);
    }
    if (elNMarg) elNMarg.textContent = `Margin: ${kpi.margin_net_pct || 0}%`;

    if (elYield) {
      elYield.textContent = `${finFormatRp(kpi.yield_per_trx || 0, true)} / trx`;
      elYield.title = `${finFormatRp(kpi.yield_per_trx || 0, true)} per Transaksi Sukses`;
    }
    if (elDNet) elDNet.textContent = `${finFormatRp(kpi.daily_net_profit || 0)} / hari`;

    // 2. Chart Tren Bulanan
    const ctx = document.getElementById("chart-admin-profit-monthly");
    if (ctx && data.monthly_trend) {
      if (_adminFinChart) {
        _adminFinChart.destroy();
        _adminFinChart = null;
      }

      const labels = data.monthly_trend.map(m => {
        const parts = m.ym.split("-");
        const monthNum = parts[1];
        const mNames = { "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun", "07": "Jul", "08": "Agu", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des" };
        return mNames[monthNum] || parts[1];
      });

      const netProfits = data.monthly_trend.map(m => m.net_profit);
      const markups = data.monthly_trend.map(m => m.komisi_upline);
      const yields = data.monthly_trend.map(m => m.yield_per_trx);

      _adminFinChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Net Profit Server (Rp)",
              data: netProfits,
              backgroundColor: "rgba(16, 185, 129, 0.8)",
              borderColor: "#10b981",
              borderWidth: 1,
              borderRadius: 4,
              order: 2,
              yAxisID: "y"
            },
            {
              label: "Komisi Upline (Markup)",
              data: markups,
              backgroundColor: "rgba(245, 158, 11, 0.7)",
              borderColor: "#f59e0b",
              borderWidth: 1,
              borderRadius: 4,
              order: 3,
              yAxisID: "y"
            },
            {
              label: "Yield Laba / Trx (Rp)",
              data: yields,
              type: "line",
              borderColor: "#7c3aed",
              backgroundColor: "#7c3aed",
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: "#7c3aed",
              order: 1,
              yAxisID: "y1"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "top",
              labels: { font: { family: "'Inter', sans-serif", size: 12, weight: 600 } }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  let val = context.parsed.y;
                  return `${context.dataset.label}: ${finFormatRp(val)}`;
                }
              }
            }
          },
          scales: {
            y: {
              position: "left",
              grid: { color: "rgba(0, 0, 0, 0.05)" },
              ticks: {
                callback: function (v) {
                  if (v >= 1000000000) return (v / 1000000000).toFixed(1) + " M";
                  if (v >= 1000000) return (v / 1000000).toFixed(0) + " Jt";
                  return v;
                }
              }
            },
            y1: {
              position: "right",
              grid: { drawOnChartArea: false },
              ticks: {
                callback: function (v) { return "Rp " + v; }
              }
            }
          }
        }
      });
    }

    // 3. Category Breakdown Table
    const catTbody = document.getElementById("table-admin-profit-cat-body");
    if (catTbody && data.category_breakdown) {
      if (data.category_breakdown.length === 0) {
        catTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">Tidak ada transaksi pada periode ini (Nol Data)</td></tr>`;
      } else {
        catTbody.innerHTML = data.category_breakdown.map(c => `
          <tr style="border-bottom: 1px solid var(--surface-border);">
            <td style="padding: 10px 14px; font-weight: 700; color: var(--text-main);">${finEscapeHtml(c.category)}</td>
            <td style="padding: 10px 14px; text-align: right;">${finFormatNum(c.total_trx)}</td>
            <td style="padding: 10px 14px; text-align: right; color: var(--text-muted);">${c.pct_trx}%</td>
            <td style="padding: 10px 14px; text-align: right;">${finFormatRp(c.gross_revenue)}</td>
            <td style="padding: 10px 14px; text-align: right; color: var(--text-muted);">${finFormatRp(c.total_modal)}</td>
            <td style="padding: 10px 14px; text-align: right; color: #b45309; font-weight: 600;">${finFormatRp(c.komisi_upline)}</td>
            <td style="padding: 10px 14px; text-align: right; color: #059669; font-weight: 700;">${finFormatRp(c.net_profit)}</td>
            <td style="padding: 10px 14px; text-align: right; font-weight: 600;">${c.pct_profit}%</td>
            <td style="padding: 10px 14px; text-align: right; color: #7c3aed; font-weight: 700;">${finFormatRp(c.yield_per_trx)}</td>
          </tr>
        `).join("");
      }
    }

    // 4. Top 10 Products Table
    const prodTbody = document.getElementById("table-admin-top-products-body");
    if (prodTbody && data.top_products) {
      if (data.top_products.length === 0) {
        prodTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12.5px;">Tidak ada data produk (Nol Data)</td></tr>`;
      } else {
        prodTbody.innerHTML = data.top_products.map(p => `
          <tr style="border-bottom: 1px solid var(--surface-border);">
            <td style="padding: 8px 10px;">
              <div style="font-weight: 700; color: var(--text-main); font-size: 12.5px;">${finEscapeHtml(p.product_name)}</div>
              <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${finEscapeHtml(p.product_id)} • ${finEscapeHtml(p.kategori)}</div>
            </td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 600;">${finFormatNum(p.total_trx)}</td>
            <td style="padding: 8px 10px; text-align: right; color: #059669; font-weight: 700;">${finFormatRp(p.net_profit)}</td>
            <td style="padding: 8px 10px; text-align: right; color: #7c3aed; font-weight: 600;">${finFormatRp(p.yield_per_trx)}</td>
          </tr>
        `).join("");
      }
    }

    // 5. Top 10 Resellers Table
    const resTbody = document.getElementById("table-admin-top-resellers-body");
    if (resTbody && data.top_resellers) {
      if (data.top_resellers.length === 0) {
        resTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12.5px;">Tidak ada data reseller (Nol Data)</td></tr>`;
      } else {
        resTbody.innerHTML = data.top_resellers.map(r => `
          <tr style="border-bottom: 1px solid var(--surface-border);">
            <td style="padding: 8px 10px;">
              <div style="font-weight: 700; color: var(--text-main); font-size: 12.5px;">${finEscapeHtml(r.nama_reseller)}</div>
              <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${finEscapeHtml(r.kode_reseller)}</div>
            </td>
            <td style="padding: 8px 10px;"><span class="badge" style="font-size: 10.5px;">${finEscapeHtml(r.cabang || "-")}</span></td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 600;">${finFormatNum(r.total_trx)}</td>
            <td style="padding: 8px 10px; text-align: right; color: #059669; font-weight: 700;">${finFormatRp(r.net_profit)}</td>
            <td style="padding: 8px 10px; text-align: right; color: #7c3aed; font-weight: 600;">${finFormatRp(r.yield_per_trx)}</td>
          </tr>
        `).join("");
      }
    }
  } catch (err) {
    console.error("Error in renderAdminFinancialDashboard:", err);
  }
}

// ─── PART 2: PIVOT FINANSIAL & MARGIN SERVER ────────────────────────────────
async function loadAdminFinancialPivotOptions() {
  const brand = adminFinState.brand || "ASTAGA";
  const yearSel = document.getElementById("fin-piv-year");
  const yearVal = yearSel ? yearSel.value : (adminFinState.pivotYear || "2026");

  try {
    const res = await fetch(`/api/pivot/options?brand=${encodeURIComponent(brand)}&year=${encodeURIComponent(yearVal)}&type=product&mode=financial`);
    const json = await res.json();
    if (!json.ok || !json.data) return;

    const d = json.data;

    // 0. Populate Years
    if (yearSel && d.years && d.years.length > 0) {
      const prevYear = yearSel.value || "2026";
      yearSel.innerHTML = "";
      d.years.forEach(y => {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        yearSel.appendChild(opt);
      });
      if (d.years.includes(prevYear)) yearSel.value = prevYear;
    }

    // 1. Populate Row Dimension
    const rowSel = document.getElementById("fin-piv-row-dim");
    if (rowSel && d.dimensions) {
      const prevRow = rowSel.value || "kategori";
      rowSel.innerHTML = "";
      d.dimensions.forEach(dim => {
        const opt = document.createElement("option");
        opt.value = dim.id;
        opt.textContent = dim.label;
        rowSel.appendChild(opt);
      });
      if (prevRow) rowSel.value = prevRow;
    }

    // 2. Populate Column Dimension
    const colSel = document.getElementById("fin-piv-col-dim");
    if (colSel && d.column_dimensions) {
      const prevCol = colSel.value || "none";
      colSel.innerHTML = "";
      d.column_dimensions.forEach(dim => {
        const opt = document.createElement("option");
        opt.value = dim.id;
        opt.textContent = dim.label;
        colSel.appendChild(opt);
      });
      if (prevCol) colSel.value = prevCol;
    }

    // 3. Populate Metrics (Lengkap dengan Metrik Finansial!)
    const metSel = document.getElementById("fin-piv-metric");
    if (metSel && d.metrics) {
      const prevMet = metSel.value || "margin_sum";
      metSel.innerHTML = "";
      d.metrics.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.label;
        metSel.appendChild(opt);
      });
      if (prevMet) metSel.value = prevMet;
    }

    // 4. Populate Months
    const monthSel = document.getElementById("fin-piv-month");
    if (monthSel && d.months) {
      const prevMonth = monthSel.value || "ALL";
      monthSel.innerHTML = '<option value="ALL">Semua Bulan</option>';
      d.months.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        monthSel.appendChild(opt);
      });
      if (prevMonth) monthSel.value = prevMonth;
    }

    // 5. Populate Status
    const statusSel = document.getElementById("fin-piv-status");
    if (statusSel && d.statuses) {
      const prevStat = statusSel.value || "ALL";
      statusSel.innerHTML = '<option value="ALL">Semua Status</option>';
      d.statuses.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        statusSel.appendChild(opt);
      });
      if (prevStat) statusSel.value = prevStat;
    }

    // 6. Populate Cabang
    const cabangSel = document.getElementById("fin-piv-cabang");
    if (cabangSel && d.cabangs) {
      const prevCab = cabangSel.value || "ALL";
      cabangSel.innerHTML = '<option value="ALL">Semua Cabang</option>';
      d.cabangs.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        cabangSel.appendChild(opt);
      });
      if (prevCab) cabangSel.value = prevCab;
    }

    // 7. Populate Kategori
    const katSel = document.getElementById("fin-piv-kategori");
    if (katSel && d.kategoris) {
      const prevKat = katSel.value || "ALL";
      katSel.innerHTML = '<option value="ALL">Semua Kategori</option>';
      d.kategoris.forEach(k => {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = k;
        katSel.appendChild(opt);
      });
      if (prevKat) katSel.value = prevKat;
    }

    // 8. Populate Operator
    const opSel = document.getElementById("fin-piv-operator");
    if (opSel && d.operators) {
      const prevOp = opSel.value || "ALL";
      opSel.innerHTML = '<option value="ALL">Semua Operator</option>';
      d.operators.forEach(o => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        opSel.appendChild(opt);
      });
      if (prevOp) opSel.value = prevOp;
    }

    adminFinState.optionsLoaded = true;
    runAdminFinancialPivot();
  } catch (err) {
    console.error("Error loading admin pivot options:", err);
  }
}

async function runAdminFinancialPivot() {
  const brand = adminFinState.brand || "ASTAGA";
  const rowDim = document.getElementById("fin-piv-row-dim")?.value || "kategori";
  const colDim = document.getElementById("fin-piv-col-dim")?.value || "none";
  const metric = document.getElementById("fin-piv-metric")?.value || "margin_sum";
  const year = document.getElementById("fin-piv-year")?.value || "2026";
  const month = document.getElementById("fin-piv-month")?.value || "ALL";
  const status = document.getElementById("fin-piv-status")?.value || "ALL";
  const cabang = document.getElementById("fin-piv-cabang")?.value || "ALL";
  const kategori = document.getElementById("fin-piv-kategori")?.value || "ALL";
  const operator = document.getElementById("fin-piv-operator")?.value || "ALL";
  const limit = document.getElementById("fin-piv-limit")?.value || "100";

  const container = document.getElementById("fin-piv-table-container");
  const summaryStrip = document.getElementById("fin-piv-summary-strip");

  if (container) {
    container.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">
        <div class="loader" style="margin: 0 auto 12px auto;"></div>
        <div>Menghitung kalkulasi pivot finansial...</div>
      </div>
    `;
  }

  const payload = {
    brand: brand,
    year: year,
    row_dim: rowDim,
    col_dim: colDim,
    metric: metric,
    month_filter: month,
    status_filter: status,
    cabang_filter: cabang,
    kategori_filter: kategori,
    operator_filter: operator,
    top_limit: parseInt(limit, 10),
    mode: "financial" // WAJIB mode=financial
  };

  try {
    const res = await fetch("/api/pivot/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json.ok || !json.data) {
      if (container) {
        container.innerHTML = `<div class="card-box" style="padding: 24px; color: #dc2626; text-align: center;">Gagal memuat pivot: ${finEscapeHtml(json.error || "Terjadi kesalahan")}</div>`;
      }
      return;
    }

    _lastAdminPivotData = json.data;
    _finPivSortCol = null;
    renderAdminFinancialPivotTable(json.data);
  } catch (err) {
    console.error("Error executing financial pivot:", err);
    if (container) {
      container.innerHTML = `<div class="card-box" style="padding: 24px; color: #dc2626; text-align: center;">Koneksi error: ${finEscapeHtml(err.message)}</div>`;
    }
  }
}

let _finPivSortCol = null;
let _finPivSortAsc = true;

function sortAdminFinancialPivotClient(colKey) {
  if (!_lastAdminPivotData || !_lastAdminPivotData.rows || _lastAdminPivotData.rows.length === 0) return;
  if (_finPivSortCol === colKey) {
    _finPivSortAsc = !_finPivSortAsc;
  } else {
    _finPivSortCol = colKey;
    _finPivSortAsc = (colKey === "_row_label");
  }

  _lastAdminPivotData.rows.sort((a, b) => {
    let va = a[colKey];
    let vb = b[colKey];
    if (va === undefined || va === null) va = 0;
    if (vb === undefined || vb === null) vb = 0;
    if (typeof va === "string" || typeof vb === "string") {
      return _finPivSortAsc
        ? String(va).localeCompare(String(vb), undefined, { numeric: true })
        : String(vb).localeCompare(String(va), undefined, { numeric: true });
    }
    return _finPivSortAsc ? (Number(va) - Number(vb)) : (Number(vb) - Number(va));
  });

  renderAdminFinancialPivotTable(_lastAdminPivotData);
}

function getFinSortSvg(colKey) {
  if (_finPivSortCol !== colKey) {
    return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.25; vertical-align: middle; margin-left: 4px;"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>`;
  }
  return _finPivSortAsc
    ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: middle; margin-left: 4px; color: #059669;"><path d="M18 15l-6-6-6 6"/></svg>`
    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: middle; margin-left: 4px; color: #059669;"><path d="M6 9l6 6 6-6"/></svg>`;
}

function renderAdminFinancialPivotTable(data) {
  const container = document.getElementById("fin-piv-table-container");
  const summaryStrip = document.getElementById("fin-piv-summary-strip");
  if (!container) return;

  const rowOption = document.getElementById("fin-piv-row-dim")?.selectedOptions?.[0];
  const rowLabelText = rowOption ? rowOption.text : "Baris";

  const metric = document.getElementById("fin-piv-metric")?.value || "margin_sum";
  const metricOption = document.getElementById("fin-piv-metric")?.selectedOptions?.[0];
  const metricLabelText = metricOption ? metricOption.text : "Net Profit Server";

  const formatVal = (mId, v) => {
    if (v === null || v === undefined || isNaN(v)) return "-";
    if (mId.includes("pct")) return Number(v).toFixed(2) + "%";
    if (mId.includes("sum") || mId.includes("price") || mId.includes("arpu") || mId.includes("margin") || mId.includes("jual") || mId.includes("beli")) {
      return finFormatRp(v);
    }
    if (mId === "daily_trx") return finFormatNum(Math.round(v));
    return finFormatNum(v);
  };

  // 1. Update Summary Strip
  if (summaryStrip) {
    const totalRows = (data.rows || []).length;
    const durStr = data.elapsed_ms ? `Selesai dalam ${data.elapsed_ms} ms` : "";
    let grandTotalHtml = "";
    if (data.is_2d && data.total_row) {
      grandTotalHtml = `Grand Total: <strong style="color: #059669; font-family: var(--font-mono); font-size: 13.5px;">${formatVal(metric, data.total_row["TOTAL"])}</strong>`;
    } else if (!data.is_2d && data.total_row) {
      grandTotalHtml = `Total Net Profit: <strong style="color: #059669; font-family: var(--font-mono); font-size: 13.5px;">${finFormatRp(data.total_row.margin_sum || 0)}</strong>`;
    }
    summaryStrip.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--text-muted); padding: 10px 14px; background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span>Menampilkan <strong>${finFormatNum(totalRows)}</strong> baris (${finEscapeHtml(rowLabelText)})</span>
          <span>•</span>
          <span>Metrik: <strong style="color: #059669;">${finEscapeHtml(metricLabelText)}</strong></span>
          ${durStr ? `<span>•</span><em>${durStr}</em>` : ""}
        </div>
        ${grandTotalHtml ? `
          <div style="background: rgba(5,150,105,0.08); border: 1px solid rgba(5,150,105,0.2); color: #059669; padding: 4px 12px; border-radius: 6px; font-size: 13px;">
            ${grandTotalHtml}
          </div>
        ` : ""}
      </div>
    `;
  }

  // 2. Build Table
  let html = "";

  if (data.is_2d) {
    // 2D Matrix Pivot
    const cols = data.columns || [];
    html = `
      <div style="overflow-x: auto; max-height: 600px; border: 1px solid var(--surface-border); border-radius: 8px;">
        <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px; text-align: left;">
          <thead style="background: var(--surface-card); position: sticky; top: 0; z-index: 2; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <tr>
              <th onclick="sortAdminFinancialPivotClient('_row_label')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); position: sticky; left: 0; background: var(--surface-card); z-index: 3;" title="Klik untuk mengurutkan">
                ${finEscapeHtml(rowLabelText)} ${getFinSortSvg('_row_label')}
              </th>
    `;
    cols.forEach(c => {
      const isTot = (c === "TOTAL");
      html += `
        <th onclick="sortAdminFinancialPivotClient('${c}')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; text-align: right; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; ${isTot ? 'color: #059669;' : ''}" title="Klik untuk mengurutkan">
          ${finEscapeHtml(c)} ${getFinSortSvg(c)}
        </th>
      `;
    });
    html += `
            </tr>
          </thead>
          <tbody>
    `;

    if (!data.rows || data.rows.length === 0) {
      html += `
        <tr>
          <td colspan="${cols.length + 1}" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Tidak ada data transaksi yang cocok dengan kombinasi filter ini.
          </td>
        </tr>
      `;
    } else {
      data.rows.forEach(r => {
        html += `
          <tr style="border-bottom: 1px solid var(--surface-border);">
            <td style="padding: 8px 14px; font-weight: 600; color: var(--text-main); border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); position: sticky; left: 0; background: var(--surface); z-index: 1; white-space: nowrap;">
              ${finEscapeHtml(r._row_label)}
            </td>
        `;
        cols.forEach(c => {
          const val = r[c] !== undefined ? r[c] : 0;
          const isTot = (c === "TOTAL");
          html += `
            <td style="padding: 8px 14px; text-align: right; border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px; ${isTot ? 'font-weight: 700; color: #059669;' : ''}">
              ${formatVal(metric, val)}
            </td>
          `;
        });
        html += `</tr>`;
      });

      if (data.total_row) {
        html += `
          <tr style="background: var(--surface-card); font-weight: 700; position: sticky; bottom: 0; z-index: 2; box-shadow: 0 -1px 2px rgba(0,0,0,0.05);">
            <td style="padding: 10px 14px; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); position: sticky; left: 0; background: var(--surface-card); z-index: 3;">
              TOTAL
            </td>
        `;
        cols.forEach(c => {
          const totVal = data.total_row[c] !== undefined ? data.total_row[c] : 0;
          html += `
            <td style="padding: 10px 14px; text-align: right; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px; color: #059669;">
              ${formatVal(metric, totVal)}
            </td>
          `;
        });
        html += `</tr>`;
      }
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

  } else {
    // 1D Comprehensive Financial Breakdown Table
    html = `
      <div style="overflow-x: auto; max-height: 600px; border: 1px solid var(--surface-border); border-radius: 8px;">
        <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px; text-align: left;">
          <thead style="background: var(--surface-card); position: sticky; top: 0; z-index: 2; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <tr>
              <th onclick="sortAdminFinancialPivotClient('_row_label')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); position: sticky; left: 0; background: var(--surface-card); z-index: 3;" title="Klik untuk mengurutkan">
                ${finEscapeHtml(rowLabelText)} ${getFinSortSvg('_row_label')}
              </th>
              <th onclick="sortAdminFinancialPivotClient('trx_count')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; text-align: right; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap;" title="Klik untuk mengurutkan">Total Trx ${getFinSortSvg('trx_count')}</th>
              <th onclick="sortAdminFinancialPivotClient('daily_trx')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; text-align: right; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; color: #2563eb;" title="Klik untuk mengurutkan">Daily Trx ${getFinSortSvg('daily_trx')}</th>
              <th onclick="sortAdminFinancialPivotClient('jual_sum')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; text-align: right; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap;" title="Klik untuk mengurutkan">Omzet Jual Kotor ${getFinSortSvg('jual_sum')}</th>
              <th onclick="sortAdminFinancialPivotClient('base_price_sum')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; text-align: right; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap;" title="Klik untuk mengurutkan">Harga Dasar Server ${getFinSortSvg('base_price_sum')}</th>
              <th onclick="sortAdminFinancialPivotClient('beli_sum')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; text-align: right; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap;" title="Klik untuk mengurutkan">Modal Beli ${getFinSortSvg('beli_sum')}</th>
              <th onclick="sortAdminFinancialPivotClient('margin_sum')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; text-align: right; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; color: #059669;" title="Klik untuk mengurutkan">Net Profit Server ${getFinSortSvg('margin_sum')}</th>
              <th onclick="sortAdminFinancialPivotClient('margin_pct')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; text-align: right; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap;" title="Klik untuk mengurutkan">Net Margin % ${getFinSortSvg('margin_pct')}</th>
              <th onclick="sortAdminFinancialPivotClient('net_arpu')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; text-align: right; border-bottom: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap;" title="Klik untuk mengurutkan">Net ARPU ${getFinSortSvg('net_arpu')}</th>
              <th onclick="sortAdminFinancialPivotClient('sukses_pct')" style="cursor: pointer; user-select: none; padding: 10px 14px; font-weight: 700; text-align: right; border-bottom: 2px solid var(--surface-border); white-space: nowrap;" title="Klik untuk mengurutkan">% Sukses ${getFinSortSvg('sukses_pct')}</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (!data.rows || data.rows.length === 0) {
      html += `
        <tr>
          <td colspan="10" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Tidak ada data transaksi yang cocok dengan kombinasi filter ini.
          </td>
        </tr>
      `;
    } else {
      data.rows.forEach(r => {
        html += `
          <tr style="border-bottom: 1px solid var(--surface-border);">
            <td style="padding: 8px 14px; font-weight: 600; color: var(--text-main); border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); position: sticky; left: 0; background: var(--surface); z-index: 1; white-space: nowrap;">
              ${finEscapeHtml(r._row_label)}
            </td>
            <td style="padding: 8px 14px; text-align: right; border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px;">
              ${finFormatNum(r.trx_count)}
            </td>
            <td style="padding: 8px 14px; text-align: right; border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px; color: #2563eb; font-weight: 600;">
              ${finFormatNum(Math.round(r.daily_trx || 0))}
            </td>
            <td style="padding: 8px 14px; text-align: right; border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px;">
              ${finFormatRp(r.jual_sum)}
            </td>
            <td style="padding: 8px 14px; text-align: right; border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px;">
              ${finFormatRp(r.base_price_sum)}
            </td>
            <td style="padding: 8px 14px; text-align: right; border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px;">
              ${finFormatRp(r.beli_sum)}
            </td>
            <td style="padding: 8px 14px; text-align: right; border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: #059669;">
              ${finFormatRp(r.margin_sum)}
            </td>
            <td style="padding: 8px 14px; text-align: right; border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px; font-weight: 600;">
              ${(r.margin_pct || 0).toFixed(2)}%
            </td>
            <td style="padding: 8px 14px; text-align: right; border-bottom: 1px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px;">
              ${finFormatRp(r.net_arpu)}
            </td>
            <td style="padding: 8px 14px; text-align: right; border-bottom: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px; font-weight: 600;">
              ${(r.sukses_pct || 0).toFixed(1)}%
            </td>
          </tr>
        `;
      });

      if (data.total_row) {
        const tot = data.total_row;
        html += `
          <tr style="background: var(--surface-card); font-weight: 700; position: sticky; bottom: 0; z-index: 2; box-shadow: 0 -1px 2px rgba(0,0,0,0.05);">
            <td style="padding: 10px 14px; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); position: sticky; left: 0; background: var(--surface-card); z-index: 3;">
              TOTAL
            </td>
            <td style="padding: 10px 14px; text-align: right; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px;">
              ${finFormatNum(tot.trx_count)}
            </td>
            <td style="padding: 10px 14px; text-align: right; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px; color: #2563eb; font-weight: 700;">
              ${finFormatNum(Math.round(tot.daily_trx || 0))}
            </td>
            <td style="padding: 10px 14px; text-align: right; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px;">
              ${finFormatRp(tot.jual_sum)}
            </td>
            <td style="padding: 10px 14px; text-align: right; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px;">
              ${finFormatRp(tot.base_price_sum)}
            </td>
            <td style="padding: 10px 14px; text-align: right; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px;">
              ${finFormatRp(tot.beli_sum)}
            </td>
            <td style="padding: 10px 14px; text-align: right; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px; font-weight: 800; color: #059669;">
              ${finFormatRp(tot.margin_sum)}
            </td>
            <td style="padding: 10px 14px; text-align: right; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px; font-weight: 700;">
              ${(tot.margin_pct || 0).toFixed(2)}%
            </td>
            <td style="padding: 10px 14px; text-align: right; border-top: 2px solid var(--surface-border); border-right: 1px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px;">
              ${finFormatRp(tot.net_arpu)}
            </td>
            <td style="padding: 10px 14px; text-align: right; border-top: 2px solid var(--surface-border); white-space: nowrap; font-family: var(--font-mono); font-size: 12px; font-weight: 700;">
              ${(tot.sukses_pct || 0).toFixed(1)}%
            </td>
          </tr>
        `;
      }
    }

    html += `
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = html;
}

function exportAdminFinancialPivotExcel() {
  if (!_lastAdminPivotData || !_lastAdminPivotData.rows || _lastAdminPivotData.rows.length === 0) {
    alert("Tidak ada data pivot yang dapat diexport.");
    return;
  }
  if (typeof XLSX === "undefined") {
    alert("Library XLSX belum siap. Silakan refresh halaman.");
    return;
  }

  const d = _lastAdminPivotData;
  const rowOption = document.getElementById("fin-piv-row-dim")?.selectedOptions?.[0];
  const rowLabelText = rowOption ? rowOption.text : "Baris";
  const brand = adminFinState.brand || "ASTAGA";
  const metric = document.getElementById("fin-piv-metric")?.value || "margin_sum";
  const dateStr = new Date().toISOString().slice(0, 10);

  let tableData = [];

  if (d.is_2d) {
    const cols = d.columns || [];
    tableData.push([rowLabelText, ...cols]);
    (d.rows || []).forEach(r => {
      const rowArr = [r._row_label];
      cols.forEach(c => rowArr.push(r[c] !== undefined ? r[c] : 0));
      tableData.push(rowArr);
    });
    if (d.total_row) {
      const totArr = ["TOTAL"];
      cols.forEach(c => totArr.push(d.total_row[c] !== undefined ? d.total_row[c] : 0));
      tableData.push(totArr);
    }
  } else {
    const headers = [rowLabelText, "Total Trx", "Daily Trx", "Omzet Jual Kotor", "Revenue Bersih Server", "Modal Beli", "Net Profit Server", "Net Margin %", "Net ARPU", "% Sukses"];
    tableData.push(headers);
    (d.rows || []).forEach(r => {
      tableData.push([
        r._row_label,
        r.trx_count || 0,
        r.daily_trx || 0,
        r.jual_sum || 0,
        r.base_price_sum || 0,
        r.beli_sum || 0,
        r.margin_sum || 0,
        r.margin_pct || 0,
        r.net_arpu || 0,
        r.sukses_pct || 0
      ]);
    });
    if (d.total_row) {
      const tot = d.total_row;
      tableData.push([
        "TOTAL",
        tot.trx_count || 0,
        tot.daily_trx || 0,
        tot.jual_sum || 0,
        tot.base_price_sum || 0,
        tot.beli_sum || 0,
        tot.margin_sum || 0,
        tot.margin_pct || 0,
        tot.net_arpu || 0,
        tot.sukses_pct || 0
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(tableData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Financial_Pivot");
  XLSX.writeFile(wb, `Financial_Pivot_${brand}_${metric}_${dateStr}.xlsx`);
}
