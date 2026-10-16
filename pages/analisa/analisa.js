// pages/analisa/analisa.js — Controller Dashboard Analisa (Chart Only, Tren Daily Trx Berbasis Cut-off Bulan)

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
window.escapeHtml = escapeHtml;

const activeFilters = {
  brand: "ASTAGA",
  year: "ALL",
  month: "ALL",
  kategori: "ALL",
  operator: "ALL",
  tipe: "ALL"
};

// Struktur hierarki produk { brand: { kategori: { operator: [paket, ...] } } } bersumber dari SQLite MASTER/master_data.db
let PRODUCT_HIERARCHY = {
  "ASTAGA": {
    "EWALLET": {
      "DANA": ["BEBAS NOMINAL", "NOMINAL"],
      "EMONEY": ["NOMINAL"],
      "GOPAY": ["BEBAS NOMINAL", "NOMINAL"],
      "GRAB": ["NOMINAL"],
      "LINKAJA": ["BEBAS NOMINAL", "NOMINAL"],
      "MAXIM": ["NOMINAL"],
      "OVO": ["BEBAS NOMINAL", "NOMINAL"],
      "SHOPEEPAY": ["BEBAS NOMINAL", "NOMINAL"]
    },
    "PPOB": {
      "PPOB": ["PPOB"]
    },
    "TELCO": {
      "INDOSAT": ["DATA", "REGULER"],
      "SMARTFREN": ["DATA", "REGULER"],
      "TELKOMSEL": ["DATA", "REGULER"],
      "TRI": ["DATA", "REGULER"],
      "XL - AXIS": ["DATA", "REGULER"]
    },
    "TOKEN PLN": {
      "TOKEN PLN": ["NOMINAL"]
    },
    "TRANSFER STOK": {
      "TRANSFER STOK": ["BEBAS NOMINAL", "NOMINAL"]
    },
    "VOUCHER GAME": {
      "VOUCHER GAME": ["NOMINAL"]
    }
  },
  "OKIPAY": {
    "EWALLET": {
      "DANA": ["BEBAS NOMINAL", "NOMINAL"],
      "EMONEY": ["NOMINAL"],
      "GOPAY": ["BEBAS NOMINAL", "NOMINAL"],
      "GRAB": ["NOMINAL"],
      "LINKAJA": ["BEBAS NOMINAL", "NOMINAL"],
      "MAXIM": ["NOMINAL"],
      "OVO": ["BEBAS NOMINAL", "NOMINAL"],
      "SHOPEEPAY": ["NOMINAL"],
      "TIX": ["NOMINAL"]
    },
    "PPOB": {
      "PPOB": ["PPOB"]
    },
    "TELCO": {
      "INDOSAT": ["DATA", "REGULER"],
      "SMARTFREN": ["DATA", "REGULER"],
      "TELKOMSEL": ["DATA", "REGULER"],
      "TRI": ["DATA", "REGULER"],
      "XL - AXIS": ["DATA", "REGULER"]
    },
    "TOKEN PLN": {
      "TOKEN PLN": ["NOMINAL"]
    },
    "VOUCHER GAME": {
      "VOUCHER GAME": ["NOMINAL"]
    }
  }
};

function getCategoryForOperator(op) {
  if (!op) return "";
  const uOp = op.toUpperCase().trim();
  for (const b of ["ASTAGA", "OKIPAY"]) {
    const brandMap = PRODUCT_HIERARCHY[b] || {};
    for (const [cat, opMap] of Object.entries(brandMap)) {
      if (Object.keys(opMap).some(o => o.toUpperCase() === uOp)) return cat;
    }
  }
  if (uOp.includes("PLN")) return "TOKEN PLN";
  if (uOp.includes("GAME")) return "VOUCHER GAME";
  if (uOp.includes("TELKOMSEL") || uOp.includes("INDOSAT") || uOp.includes("AXIS") || uOp.includes("XL") || uOp.includes("TRI") || uOp.includes("SMARTFREN")) return "TELCO";
  return "LAINNYA";
}

let currentAnalisaTab = "distribusi";
let cachedAnalisaData = null;
let rawGoldData = null;

// Registry chart instances untuk pembersihan memori (destroy on re-render)
const chartInstances = {};

function destroyChart(name) {
  if (chartInstances[name]) {
    chartInstances[name].destroy();
    chartInstances[name] = null;
  }
}

// ── PILL FILTER HANDLERS ──
function setPillFilter(filterType, value) {
  // Guard khusus: jika tab service aktif dan filter yang diubah adalah year, paksa tetap 2026
  if (currentAnalisaTab === "service" && filterType === "year") {
    value = "2026";
  }

  activeFilters[filterType] = value;

  // Update visual active pill
  const group = document.getElementById(`pills-${filterType}`);
  if (group) {
    group.querySelectorAll(".filter-pill").forEach(btn => {
      const btnVal = btn.getAttribute(`data-${filterType}`);
      if (btnVal === value) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  if (filterType === "brand") {
    updateProductFilterDropdowns();
    if (window.triggerBrandSwitchVisual && group) {
      const activeBtn = group.querySelector(`.filter-pill[data-brand="${value}"]`);
      window.triggerBrandSwitchVisual(value, activeBtn, "analisa-view-container");
    }
  }

  fetchAndRenderAnalisa();
}

// ── MASTER PRODUK FILTER HANDLERS (KATEGORI, OPERATOR, TIPE) ──
function updateProductFilterDropdowns() {
  const brandKey = activeFilters.brand === "OKIPAY" ? "OKIPAY" : "ASTAGA";
  const opSelect = document.getElementById("filter-prod-operator");
  const tipSelect = document.getElementById("filter-prod-tipe");

  // Tentukan brand sasaran
  const targetBrands = (activeFilters.brand === "ALL" || activeFilters.brand === "GABUNGAN")
    ? ["ASTAGA", "OKIPAY"]
    : [brandKey];

  // 1. Dapatkan daftar Operator berdasarkan Kategori yang aktif
  const opSet = new Set();
  targetBrands.forEach(b => {
    const bCats = PRODUCT_HIERARCHY[b] || {};
    if (activeFilters.kategori !== "ALL") {
      const catOps = bCats[activeFilters.kategori] || {};
      Object.keys(catOps).forEach(o => opSet.add(o));
    } else {
      Object.values(bCats).forEach(catOps => {
        Object.keys(catOps).forEach(o => opSet.add(o));
      });
    }
  });
  const ops = Array.from(opSet).sort();

  // Validasi operator yang sedang aktif
  if (activeFilters.operator !== "ALL" && !ops.includes(activeFilters.operator)) {
    activeFilters.operator = "ALL";
  }

  if (opSelect) {
    opSelect.innerHTML = `<option value="ALL">Semua Operator</option>` +
      ops.map(o => `<option value="${o}" ${o === activeFilters.operator ? "selected" : ""}>${o}</option>`).join("");
  }

  // 2. Dapatkan daftar Tipe / Paket secara dinamis sesuai Kategori dan Operator yang dipilih
  const tipSet = new Set();
  targetBrands.forEach(b => {
    const bCats = PRODUCT_HIERARCHY[b] || {};
    Object.entries(bCats).forEach(([cat, catOps]) => {
      if (activeFilters.kategori !== "ALL" && cat !== activeFilters.kategori) return;
      Object.entries(catOps).forEach(([op, pktList]) => {
        if (activeFilters.operator !== "ALL" && op !== activeFilters.operator) return;
        (pktList || []).forEach(pkt => tipSet.add(pkt));
      });
    });
  });
  const tips = Array.from(tipSet).sort();

  // Validasi tipe yang sedang aktif
  if (activeFilters.tipe !== "ALL" && !tips.includes(activeFilters.tipe)) {
    activeFilters.tipe = "ALL";
  }

  if (tipSelect) {
    tipSelect.innerHTML = `<option value="ALL">Semua Tipe</option>` +
      tips.map(t => `<option value="${t}" ${t === activeFilters.tipe ? "selected" : ""}>${t}</option>`).join("");
  }

  const resetBtn = document.getElementById("btn-reset-prod-filter");
  if (resetBtn) {
    const hasFilter = activeFilters.kategori !== "ALL" || activeFilters.operator !== "ALL" || activeFilters.tipe !== "ALL";
    resetBtn.style.display = hasFilter ? "inline-block" : "none";
  }
}

function setProductFilter(type, value) {
  activeFilters[type] = value;

  if (type === "kategori") {
    const group = document.getElementById("pills-kategori");
    if (group) {
      group.querySelectorAll(".filter-pill").forEach(btn => {
        if (btn.getAttribute("data-kategori") === value) btn.classList.add("active");
        else btn.classList.remove("active");
      });
    }
    // Reset operator & tipe saat kategori berganti
    activeFilters.operator = "ALL";
    activeFilters.tipe = "ALL";
    updateProductFilterDropdowns();
  } else if (type === "operator") {
    // Reset tipe saat operator berganti agar hanya menampilkan paket yang sah untuk operator tsb
    activeFilters.tipe = "ALL";
    updateProductFilterDropdowns();
  } else {
    updateProductFilterDropdowns();
  }

  fetchAndRenderAnalisa();
}

function resetProductFilters() {
  activeFilters.kategori = "ALL";
  activeFilters.operator = "ALL";
  activeFilters.tipe = "ALL";

  const group = document.getElementById("pills-kategori");
  if (group) {
    group.querySelectorAll(".filter-pill").forEach(btn => {
      if (btn.getAttribute("data-kategori") === "ALL") btn.classList.add("active");
      else btn.classList.remove("active");
    });
  }

  updateProductFilterDropdowns();
  fetchAndRenderAnalisa();
}

// ── KONTROL VISIBILITAS FILTER TAHUN & MASTER PRODUK BERDASARKAN TAB ──
function updateYearPillsVisibility(tabName) {
  const pillsYear = document.getElementById("pills-year");
  if (!pillsYear) return;

  const allYearBtns = pillsYear.querySelectorAll(".filter-pill");

  if (tabName === "service" || tabName === "supplier" || tabName === "profit") {
    allYearBtns.forEach(btn => {
      const yr = btn.getAttribute("data-year");
      if (yr === "2026") {
        btn.style.display = "";
        btn.classList.add("active");
      } else {
        btn.style.display = "none";
        btn.classList.remove("active");
      }
    });
    // Kunci active filter ke 2026 jika sebelumnya bukan 2026
    if (activeFilters.year !== "2026") {
      activeFilters.year = "2026";
    }
  } else {
    // Tab Distribusi & Lain: Kembalikan semua tombol tahun (ALL, 2026, 2025, 2024, 2023)
    allYearBtns.forEach(btn => {
      btn.style.display = "";
      if (btn.getAttribute("data-year") === activeFilters.year) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }
}

// ── TAB SWITCHER HANDLER ──
function switchAnalisaTab(tabName) {
  currentAnalisaTab = tabName;

  // Sinkronisasi status sub-tab ke URL tanpa reload
  try {
    history.replaceState(null, null, "#analisa?tab=" + tabName);
  } catch (e) { }

  // Sesuaikan tombol filter tahun sesuai kapabilitas data tab
  updateYearPillsVisibility(tabName);

  // Kontrol visibilitas baris filter Master Produk (aktif di tab service dan supplier)
  const prodFilterRow = document.getElementById("filter-master-produk-container");
  if (prodFilterRow) {
    prodFilterRow.style.display = (tabName === "service" || tabName === "supplier") ? "flex" : "none";
  }

  // Kontrol visibilitas Tipe / Paket (hanya relevan di tab service)
  const tipeFilterWrap = document.getElementById("filter-prod-tipe-wrap");
  if (tipeFilterWrap) {
    tipeFilterWrap.style.display = (tabName === "service") ? "flex" : "none";
  }

  // Update tab buttons
  ["distribusi", "service", "supplier", "profit", "lain"].forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const sec = document.getElementById(`section-analisa-${t}`);
    if (btn) {
      if (t === tabName) btn.classList.add("active");
      else btn.classList.remove("active");
    }
    if (sec) {
      sec.style.display = (t === tabName) ? "flex" : "none";
    }
  });

  // Re-fetch dan render data agar filter tab langsung teraplikasi
  fetchAndRenderAnalisa();
}

// ── PROFIT & REVENUE ANALYTICS FETCHER ──
const _FRONTEND_PROFIT_CACHE = {};

async function fetchAndRenderProfitAnalisa() {
  const brand = activeFilters.brand === "ALL" ? "ALL" : (activeFilters.brand === "OKIPAY" ? "OKIPAY" : "ASTAGA");
  const year = activeFilters.year === "ALL" ? "2026" : activeFilters.year;
  const month = activeFilters.month === "ALL" ? "" : `${year}-${activeFilters.month}`;
  const cacheKey = `${brand}_${year}_${month || 'ALL'}`;

  // 1. Jika data sudah ada di frontend cache, render instan tanpa loading
  if (_FRONTEND_PROFIT_CACHE[cacheKey]) {
    renderProfitDataUI(_FRONTEND_PROFIT_CACHE[cacheKey]);
    return;
  }

  const catTbody = document.getElementById("table-profit-category-body");
  if (catTbody) {
    catTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">Memuat data analisa profit ${escapeHtml(brand)} (${escapeHtml(month || year)})...</td></tr>`;
  }

  try {
    let url = `/api/analisa/profit?brand=${brand}&year=${year}`;
    if (month) url += `&month=${encodeURIComponent(month)}`;

    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok || !json.data) {
      console.error("Gagal memuat analisa profit:", json.error);
      if (catTbody) {
        catTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: #dc2626;">Gagal memuat data profit: ${escapeHtml(json.error || 'Terjadi kesalahan')}</td></tr>`;
      }
      return;
    }

    const data = json.data;
    _FRONTEND_PROFIT_CACHE[cacheKey] = data;
    renderProfitDataUI(data);
  } catch (err) {
    console.error("Error fetching profit data:", err);
    if (catTbody) {
      catTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: #dc2626;">Terjadi kesalahan koneksi saat memuat profit</td></tr>`;
    }
  }
}

function renderProfitDataUI(data) {
    const kpi = data.kpi || {};

    // 1. KPI Cards
    const elRev = document.getElementById("profit-kpi-revenue");
    const elDRev = document.getElementById("profit-kpi-daily-rev");
    const elMod = document.getElementById("profit-kpi-modal");
    const elGross = document.getElementById("profit-kpi-gross");
    const elGMarg = document.getElementById("profit-kpi-gross-margin");
    const elMk = document.getElementById("profit-kpi-markup");
    const elNet = document.getElementById("profit-kpi-net");
    const elNMarg = document.getElementById("profit-kpi-net-margin");
    const elYield = document.getElementById("profit-kpi-yield");
    const elDNet = document.getElementById("profit-kpi-daily-net");

    if (elRev) {
      elRev.textContent = `Rp ${Number(kpi.gross_revenue || 0).toLocaleString("id-ID")}`;
      elRev.title = `Rp ${Number(kpi.gross_revenue || 0).toLocaleString("id-ID")}`;
    }
    if (elDRev) elDRev.textContent = `Rp ${Number(kpi.daily_revenue || 0).toLocaleString("id-ID")} / hari`;
    if (elMod) {
      elMod.textContent = `Rp ${Number(kpi.total_modal || 0).toLocaleString("id-ID")}`;
      elMod.title = `Rp ${Number(kpi.total_modal || 0).toLocaleString("id-ID")}`;
    }
    if (elGross) {
      elGross.textContent = `Rp ${Number(kpi.gross_profit || 0).toLocaleString("id-ID")}`;
      elGross.title = `Rp ${Number(kpi.gross_profit || 0).toLocaleString("id-ID")}`;
    }
    if (elGMarg) elGMarg.textContent = `Margin: ${kpi.margin_gross_pct || 0}%`;
    if (elMk) {
      elMk.textContent = `Rp ${Number(kpi.komisi_upline || 0).toLocaleString("id-ID")}`;
      elMk.title = `Rp ${Number(kpi.komisi_upline || 0).toLocaleString("id-ID")}`;
    }
    if (elNet) {
      elNet.textContent = `Rp ${Number(kpi.net_profit || 0).toLocaleString("id-ID")}`;
      elNet.title = `Rp ${Number(kpi.net_profit || 0).toLocaleString("id-ID")}`;
    }
    if (elNMarg) elNMarg.textContent = `Margin: ${kpi.margin_net_pct || 0}%`;
    if (elYield) {
      const yVal = Number(kpi.yield_per_trx || 0);
      elYield.textContent = `Rp ${yVal.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / trx`;
      elYield.title = `Rp ${yVal.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per Transaksi Sukses`;
    }
    if (elDNet) elDNet.textContent = `Rp ${Number(kpi.daily_net_profit || 0).toLocaleString("id-ID")} / hari`;

    // 2. Chart Tren Bulanan
    const ctx = document.getElementById("chart-profit-monthly");
    if (ctx && data.monthly_trend) {
      destroyChart("profit_monthly");
      const labels = data.monthly_trend.map(m => {
        const parts = m.ym.split("-");
        const monthNum = parts[1];
        const mNames = { "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun", "07": "Jul", "08": "Agu", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des" };
        return mNames[monthNum] || parts[1];
      });

      const netProfits = data.monthly_trend.map(m => m.net_profit);
      const markups = data.monthly_trend.map(m => m.komisi_upline);
      const yields = data.monthly_trend.map(m => m.yield_per_trx);

      chartInstances["profit_monthly"] = new Chart(ctx, {
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
              labels: { font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 600 } }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  let val = context.parsed.y;
                  if (context.dataset.yAxisID === "y1") {
                    return `${context.dataset.label}: Rp ${Number(val).toLocaleString("id-ID")}`;
                  }
                  return `${context.dataset.label}: Rp ${Number(val).toLocaleString("id-ID")}`;
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
    const catTbody = document.getElementById("table-profit-category-body");
    if (catTbody && data.category_breakdown) {
      if (data.category_breakdown.length === 0) {
        catTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">Tidak ada transaksi pada periode ini (Nol Data)</td></tr>`;
      } else {
        catTbody.innerHTML = data.category_breakdown.map(c => `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 10px 14px; font-weight: 700; color: var(--text-main);">${escapeHtml(c.category)}</td>
            <td style="padding: 10px 14px; text-align: right;">${Number(c.total_trx).toLocaleString("id-ID")}</td>
            <td style="padding: 10px 14px; text-align: right; color: var(--text-muted);">${c.pct_trx}%</td>
            <td style="padding: 10px 14px; text-align: right;">Rp ${Number(c.gross_revenue).toLocaleString("id-ID")}</td>
            <td style="padding: 10px 14px; text-align: right; color: var(--text-muted);">Rp ${Number(c.total_modal).toLocaleString("id-ID")}</td>
            <td style="padding: 10px 14px; text-align: right; color: #b45309; font-weight: 600;">Rp ${Number(c.komisi_upline).toLocaleString("id-ID")}</td>
            <td style="padding: 10px 14px; text-align: right; color: #059669; font-weight: 700;">Rp ${Number(c.net_profit).toLocaleString("id-ID")}</td>
            <td style="padding: 10px 14px; text-align: right; font-weight: 600;">${c.pct_profit}%</td>
            <td style="padding: 10px 14px; text-align: right; color: #7c3aed; font-weight: 700;">Rp ${Number(c.yield_per_trx).toLocaleString("id-ID")}</td>
          </tr>
        `).join("");
      }
    }

    // 4. Top 10 Products Table
    const prodTbody = document.getElementById("table-top-products-body");
    if (prodTbody && data.top_products) {
      if (data.top_products.length === 0) {
        prodTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12.5px;">Tidak ada data produk (Nol Data)</td></tr>`;
      } else {
        prodTbody.innerHTML = data.top_products.map(p => `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 8px 10px;">
              <div style="font-weight: 700; color: var(--text-main); font-size: 12.5px;">${escapeHtml(p.product_name)}</div>
              <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeHtml(p.product_id)} • ${escapeHtml(p.kategori)}</div>
            </td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 600;">${Number(p.total_trx).toLocaleString("id-ID")}</td>
            <td style="padding: 8px 10px; text-align: right; color: #059669; font-weight: 700;">Rp ${Number(p.net_profit).toLocaleString("id-ID")}</td>
            <td style="padding: 8px 10px; text-align: right; color: #7c3aed; font-weight: 600;">Rp ${Number(p.yield_per_trx).toLocaleString("id-ID")}</td>
          </tr>
        `).join("");
      }
    }

    // 5. Top 10 Resellers Table
    const resTbody = document.getElementById("table-top-resellers-body");
    if (resTbody && data.top_resellers) {
      if (data.top_resellers.length === 0) {
        resTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12.5px;">Tidak ada data reseller (Nol Data)</td></tr>`;
      } else {
        resTbody.innerHTML = data.top_resellers.map(r => `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 8px 10px;">
              <div style="font-weight: 700; color: var(--text-main); font-size: 12.5px;">${escapeHtml(r.nama_reseller)}</div>
              <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeHtml(r.kode_reseller)}</div>
            </td>
            <td style="padding: 8px 10px;"><span class="badge" style="font-size: 10.5px;">${escapeHtml(r.cabang || '-')}</span></td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 600;">${Number(r.total_trx).toLocaleString("id-ID")}</td>
            <td style="padding: 8px 10px; text-align: right; color: #059669; font-weight: 700;">Rp ${Number(r.net_profit).toLocaleString("id-ID")}</td>
            <td style="padding: 8px 10px; text-align: right; color: #7c3aed; font-weight: 600;">Rp ${Number(r.yield_per_trx).toLocaleString("id-ID")}</td>
          </tr>
        `).join("");
      }
    }

  } catch (err) {
    console.error("Error in fetchAndRenderProfitAnalisa:", err);
  }
}

// ── DATA FETCHING (API DENGAN GOLD STATIC OLAP ENGINE) ──
async function fetchAndRenderAnalisa() {
  if (currentAnalisaTab === "profit") {
    await fetchAndRenderProfitAnalisa();
    return;
  }

  const isStaticHost = window.location.hostname.includes("github.io") || 
                       window.location.protocol === "file:" ||
                       window.location.port === "5500";

  // 1. Coba fetch dari backend endpoint API jika live server lokal
  if (!isStaticHost) {
    try {
      let url = `/api/analisa/data?brand=${activeFilters.brand}&year=${activeFilters.year}&month=${activeFilters.month}`;
      if (activeFilters.kategori !== "ALL") url += `&kategori=${encodeURIComponent(activeFilters.kategori)}`;
      if (activeFilters.operator !== "ALL") url += `&operator=${encodeURIComponent(activeFilters.operator)}`;
      if (activeFilters.tipe !== "ALL") url += `&tipe=${encodeURIComponent(activeFilters.tipe)}`;

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json && json.ok) {
          if (json.product_hierarchy && Object.keys(json.product_hierarchy).length > 0) {
            PRODUCT_HIERARCHY = json.product_hierarchy;
            updateProductFilterDropdowns();
          }
          cachedAnalisaData = json;
          renderCurrentTabCharts(json);
          return;
        }
      }
    } catch (e) {
      // API endpoint gagal / offline, lanjut ke Gold Static OLAP Engine
    }
  }

  // 2. Gold OLAP Engine Client-Side (100% Offline / GitHub Pages)
  try {
    if (!rawGoldData) {
      const dataUrl = isStaticHost ? "./pages/analisa/data.json" : "/pages/analisa/data.json";
      const fRes = await fetch(dataUrl);
      rawGoldData = await fRes.json();
    }
    const processed = filterGoldDataLocal(rawGoldData, activeFilters.brand, activeFilters.year, activeFilters.month, activeFilters.kategori, activeFilters.operator, activeFilters.tipe);
    cachedAnalisaData = processed;
    renderCurrentTabCharts(processed);
  } catch (err) {
    console.error("Error loading gold data:", err);
  }
}

// Helper format durasi detik ke mm:ss
function formatDurationSec(sec) {
  if (sec == null || isNaN(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Helper klasifikasi SLA modul client-side (sesuai SOP GEMINI.md)
function classifySlaStatusClient(suksesPct, avgSpeedSec) {
  const sPct = Number(suksesPct || 0);
  const speed = Number(avgSpeedSec || 0);
  if (sPct < 95.0 || speed > 30.0) return "KURANG";
  if (sPct >= 98.0 && speed < 15.0) return "BAIK";
  return "CUKUP";
}

// Helper agregasi modul scorecard client-side (100% identik dengan analisa_engine.py)
function _aggregateModulesScorecardClient(targetBrands, targetYms, dataAll, filterTipe = "ALL", filterKategori = "ALL", filterOperator = "ALL") {
  const aggregated = {};

  targetBrands.forEach(b => {
    const bData = dataAll[b] || {};
    targetYms.forEach(ym => {
      const ymData = bData[ym] || {};
      const modules = ymData.modules || [];
      modules.forEach(m => {
        const mid = String(m.modul_id || "").trim();
        if (!mid || ["none", "nan", "<null>", "null", "-", ""].includes(mid.toLowerCase())) return;
        if (!aggregated[mid]) {
          aggregated[mid] = {
            modul_id: mid,
            nama_modul: m.nama_modul || mid,
            tipe: m.tipe || "H2H",
            brand: m.brand || b,
            kategori: m.kategori || "-",
            trx: 0,
            sukses: 0,
            gagal: 0,
            weighted_speed_sum: 0.0,
            operators: {},
            categories: {},
            tipes: {}
          };
        }
        aggregated[mid].trx += (m.trx || 0);
        aggregated[mid].sukses += (m.sukses || 0);
        aggregated[mid].gagal += (m.gagal || 0);
        aggregated[mid].weighted_speed_sum += ((m.avg_speed || 0.0) * (m.sukses || 0));

        const mOp = m.operator;
        if (mOp && !["-", "LAINNYA", ""].includes(mOp)) {
          aggregated[mid].operators[mOp] = (aggregated[mid].operators[mOp] || 0) + (m.trx || 0);
        }

        const mKat = m.kategori;
        if (mKat && !["-", "LAINNYA", ""].includes(mKat)) {
          aggregated[mid].categories[mKat] = (aggregated[mid].categories[mKat] || 0) + (m.trx || 0);
        }

        const mTipes = m.tipes || {};
        Object.entries(mTipes).forEach(([tName, tCnt]) => {
          if (tName && !["-", ""].includes(tName)) {
            aggregated[mid].tipes[tName] = (aggregated[mid].tipes[tName] || 0) + tCnt;
          }
        });
        const mTipeProd = m.tipe_produk;
        if (mTipeProd && !["-", ""].includes(mTipeProd)) {
          aggregated[mid].tipes[mTipeProd] = (aggregated[mid].tipes[mTipeProd] || 0) + (m.trx || 0);
        }
      });
    });
  });

  const normFilterTipe = (filterTipe && filterTipe !== "ALL") ? filterTipe.toUpperCase().trim() : null;
  const normFilterOp = (filterOperator && filterOperator !== "ALL") ? filterOperator.toUpperCase().trim() : null;
  const normFilterKat = (filterKategori && filterKategori !== "ALL") ? filterKategori.toUpperCase().trim() : null;

  const scorecard = [];
  Object.entries(aggregated).forEach(([mid, item]) => {
    if (normFilterTipe) {
      if (["CHIP", "H2H"].includes(normFilterTipe)) {
        if ((item.tipe || "").toUpperCase() !== normFilterTipe) return;
      } else {
        const modTipes = Object.keys(item.tipes || {}).map(t => t.toUpperCase());
        if (!modTipes.includes(normFilterTipe) && (item.tipe_produk || "").toUpperCase() !== normFilterTipe) return;
      }
    }

    let topOp = "-";
    if (item.operators && Object.keys(item.operators).length > 0) {
      topOp = Object.entries(item.operators).sort((a, b) => b[1] - a[1])[0][0];
    }

    let topKat = item.kategori || "-";
    if (item.categories && Object.keys(item.categories).length > 0) {
      topKat = Object.entries(item.categories).sort((a, b) => b[1] - a[1])[0][0];
    }
    if (["-", "", "LAINNYA"].includes(topKat)) {
      topKat = getCategoryForOperator(topOp) || "LAINNYA";
    }

    if (normFilterOp) {
      const modOps = Object.keys(item.operators || {}).map(o => o.toUpperCase());
      if (topOp.toUpperCase() !== normFilterOp && !modOps.includes(normFilterOp)) return;
    }

    if (normFilterKat) {
      const checkKatMatch = () => {
        const mCats = [topKat.toUpperCase()];
        const opK = getCategoryForOperator(topOp);
        if (opK) mCats.push(opK.toUpperCase());
        Object.keys(item.operators || {}).forEach(op => {
          const k = getCategoryForOperator(op);
          if (k) mCats.push(k.toUpperCase());
        });
        for (const c of mCats) {
          if (c === normFilterKat) return true;
          if (["GAME", "VOUCHER GAME"].includes(normFilterKat) && ["GAME", "VOUCHER GAME"].includes(c)) return true;
          if (["PLN", "TOKEN PLN"].includes(normFilterKat) && ["PLN", "TOKEN PLN"].includes(c)) return true;
        }
        return false;
      };
      if (!checkKatMatch()) return;
    }

    const tot = item.trx;
    const suk = item.sukses;
    const gagal = item.gagal;
    const pct = tot > 0 ? Number((suk / tot * 100).toFixed(1)) : 0.0;
    const avgSpeed = suk > 0 ? Number((item.weighted_speed_sum / suk).toFixed(1)) : 0.0;
    const status = classifySlaStatusClient(pct, avgSpeed);

    let topTipeProd = "-";
    if (item.tipes && Object.keys(item.tipes).length > 0) {
      topTipeProd = Object.entries(item.tipes).sort((a, b) => b[1] - a[1])[0][0];
    }

    scorecard.push({
      modul_id: mid,
      nama_modul: item.nama_modul,
      tipe: item.tipe,
      tipe_produk: topTipeProd,
      tipes: item.tipes,
      operator: topOp,
      kategori: topKat,
      brand: item.brand,
      trx: tot,
      sukses: suk,
      gagal: gagal,
      sukses_pct: pct,
      avg_speed: avgSpeed,
      dur_str: formatDurationSec(avgSpeed),
      status: status,
      operators: item.operators
    });
  });

  scorecard.sort((a, b) => b.trx - a.trx);

  // Top 3 Failing Modules (Sukses Rate Terendah, min trx >= 10 jika ada)
  let failingCands = scorecard.filter(m => m.gagal > 0 && m.trx >= 10);
  if (failingCands.length < 3) failingCands = scorecard.filter(m => m.gagal > 0);
  failingCands.sort((a, b) => (a.sukses_pct - b.sukses_pct) || (b.gagal - a.gagal));
  let topFailing = failingCands.slice(0, 3);
  if (topFailing.length < 3) {
    const extra = scorecard.filter(m => !topFailing.includes(m)).sort((a, b) => (a.sukses_pct - b.sukses_pct) || (b.gagal - a.gagal));
    topFailing = topFailing.concat(extra.slice(0, 3 - topFailing.length));
  }

  // Top 3 Slowest Modules (Avg Speed Terlama, min trx >= 5 jika ada)
  let slowCands = scorecard.filter(m => m.sukses > 0 && m.trx >= 5);
  if (slowCands.length < 3) slowCands = scorecard.filter(m => m.sukses > 0);
  slowCands.sort((a, b) => b.avg_speed - a.avg_speed);
  let topSlowest = slowCands.slice(0, 3);

  const baikCnt = scorecard.filter(m => m.status === "BAIK" || m.status === "PRIMA").length;
  const cukupCnt = scorecard.filter(m => m.status === "CUKUP" || m.status === "WASPADA").length;
  const kurangCnt = scorecard.filter(m => m.status === "KURANG" || m.status === "GANGGUAN").length;
  const chipCnt = scorecard.filter(m => m.tipe === "CHIP").length;
  const h2hCnt = scorecard.filter(m => m.tipe === "H2H").length;

  return {
    scorecard,
    top_failing: topFailing,
    top_slowest: topSlowest,
    summary: {
      total_modules: scorecard.length,
      baik_count: baikCnt,
      cukup_count: cukupCnt,
      kurang_count: kurangCnt,
      prima_count: baikCnt,
      waspada_count: cukupCnt,
      gangguan_count: kurangCnt,
      chip_count: chipCnt,
      h2h_count: h2hCnt
    }
  };
}

// ── FALLBACK ENGINE CLIENT-SIDE (Sama persis dengan analisa_engine.py) ──
function filterGoldDataLocal(dataAll, brand, year, month, kategori = "ALL", operator = "ALL", tipe = "ALL") {
  const brandUpper = (brand || "ALL").toUpperCase();
  const targetBrands = (brandUpper === "ALL" || brandUpper === "GABUNGAN") ? ["ASTAGA", "OKIPAY"] : [brandUpper];

  const allYms = Object.keys(dataAll["ASTAGA"] || {}).sort();

  const MONTH_NAMES = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "Mei", "06": "Jun", "07": "Jul", "08": "Agu",
    "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
  };

  const MONTH_FULL = {
    "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
    "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
    "09": "September", "10": "Oktober", "11": "November", "12": "Desember"
  };

  // 1. GRANULARITAS HARIAN (DAILY: TGL 1 s/d 30/31)
  if (year !== "ALL" && month !== "ALL") {
    const targetYm = `${year}-${month.padStart(2, "0")}`;
    const sampleItem = (dataAll[targetBrands[0]] && dataAll[targetBrands[0]][targetYm]) ? dataAll[targetBrands[0]][targetYm] : {};
    const sampleDaily = sampleItem.daily || [];
    const isMtd = sampleItem.is_mtd || false;
    const activeDays = sampleItem.active_days || sampleDaily.length;

    const modulesData = _aggregateModulesScorecardClient(targetBrands, [targetYm], dataAll, tipe, kategori, operator);

    const timeline = [];
    let totTrx = 0;
    let totSukses = 0;
    let totCustSum = 0;
    const categoriesTotal = {};
    const branchesTotal = {};

    let monthSuksesRate = 0.0;
    let monthDurSec = 0.0;
    let monthDurStr = "00:00";

    if (sampleDaily.length > 0) {
      monthSuksesRate = Number((targetBrands.reduce((acc, b) => {
        const it = (dataAll[b] && dataAll[b][targetYm]) ? dataAll[b][targetYm] : {};
        return acc + (it.sukses_pct || 98.0);
      }, 0) / targetBrands.length).toFixed(1));

      monthDurSec = Number((targetBrands.reduce((acc, b) => {
        const it = (dataAll[b] && dataAll[b][targetYm]) ? dataAll[b][targetYm] : {};
        return acc + (it.avg_dur_sec || 21.0);
      }, 0) / targetBrands.length).toFixed(1));
      monthDurStr = sampleItem.avg_dur_str || formatDurationSec(monthDurSec);

      sampleDaily.forEach((dObj, dIdx) => {
        const dayNum = dObj.day;
        const dLabel = `Tgl ${dayNum}`;
        let dayTrx = 0;
        let dayTrxSukses = 0;
        let dayCust = 0;

        targetBrands.forEach(b => {
          const bItem = (dataAll[b] && dataAll[b][targetYm]) ? dataAll[b][targetYm] : {};
          const bDaily = bItem.daily || [];
          if (dIdx < bDaily.length) {
            const bD = bDaily[dIdx];
            dayTrx += bD.trx || 0;
            dayTrxSukses += bD.trx_sukses != null ? bD.trx_sukses : (bD.trx || 0);
            dayCust += bD.cust || 0;
          }
        });

        const tpm = dayCust > 0 ? Number((dayTrxSukses / dayCust).toFixed(2)) : 0;
        totTrx += dayTrx;
        totSukses += dayTrxSukses;
        totCustSum += dayCust;

        const dayRatio = sampleItem.trx_count > 0 ? dayTrx / sampleItem.trx_count : 0;
        const dayCats = {};
        const dayBranches = {};

        targetBrands.forEach(b => {
          const bItem = (dataAll[b] && dataAll[b][targetYm]) ? dataAll[b][targetYm] : {};
          Object.entries(bItem.categories || {}).forEach(([cat, cVal]) => {
            const cDay = Math.round(cVal * dayRatio);
            dayCats[cat] = (dayCats[cat] || 0) + cDay;
            categoriesTotal[cat] = (categoriesTotal[cat] || 0) + cDay;
          });
          Object.entries(bItem.branches || {}).forEach(([br, brVal]) => {
            const bDay = Math.round(brVal * dayRatio);
            dayBranches[br] = (dayBranches[br] || 0) + bDay;
            branchesTotal[br] = (branchesTotal[br] || 0) + bDay;
          });
        });

        timeline.push({
          day: dayNum,
          date: dObj.date || `${targetYm}-${String(dayNum).padStart(2, "0")}`,
          label: dLabel,
          trx: dayTrx,
          daily_trx: dayTrxSukses,
          customers: dayCust,
          tpm: tpm,
          sukses_pct: monthSuksesRate,
          dur_sec: monthDurSec,
          dur_str: monthDurStr,
          categories: dayCats,
          branches: dayBranches
        });
      });
    }

    const countPts = timeline.length;
    let avgDailyTrx = 0;
    let avgDailyCust = 0;
    let avgTpm = 0.0;
    let totalRealTrx = 0;
    let gagalTot = 0.0;
    let hourlyDistribution = [];
    let weekdayDistribution = [];

    if (countPts === 0) {
      const hourlyHours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
      hourlyDistribution = hourlyHours.map(h => ({ hour: h, trx: 0 }));
      const weekdayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
      weekdayDistribution = weekdayNames.map(d => ({ day: d, trx: 0 }));
    } else {
      avgDailyTrx = Math.round(totSukses / countPts);
      avgDailyCust = Math.round(totCustSum / countPts);
      avgTpm = Number((timeline.reduce((acc, t) => acc + t.tpm, 0) / countPts).toFixed(2));

      totalRealTrx = targetBrands.reduce((acc, b) => {
        const it = (dataAll[b] && dataAll[b][targetYm]) ? dataAll[b][targetYm] : {};
        return acc + (it.trx_count || totTrx);
      }, 0);

      const hourlyHours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
      const hourlyWeights = [
        0.012, 0.008, 0.005, 0.004, 0.006, 0.018, 0.035, 0.062, 0.078, 0.082, 0.085, 0.087,
        0.081, 0.076, 0.075, 0.079, 0.086, 0.092, 0.098, 0.102, 0.094, 0.072, 0.045, 0.022
      ];
      hourlyDistribution = hourlyHours.map((h, i) => ({
        hour: h,
        trx: Math.round(avgDailyTrx * hourlyWeights[i])
      }));

      const weekdayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
      const weekdayWeights = [0.142, 0.144, 0.141, 0.146, 0.155, 0.158, 0.114];
      weekdayDistribution = weekdayNames.map((d, i) => ({
        day: d,
        trx: Math.round((totTrx / 4.3) * weekdayWeights[i])
      }));

      gagalTot = Math.max(0, Number((100 - monthSuksesRate).toFixed(1)));
    }

    const topCategory = Object.keys(categoriesTotal).length > 0
      ? Object.entries(categoriesTotal).sort((a, b) => b[1] - a[1])[0][0] : "EWALLET";
    const topBranch = Object.keys(branchesTotal).length > 0
      ? Object.entries(branchesTotal).sort((a, b) => b[1] - a[1])[0][0] : "BSD";

    const granLabel = countPts === 0
      ? `Harian (${MONTH_FULL[month.padStart(2, "0")] || month} ${year}) • Nol Data`
      : `Harian (${MONTH_FULL[month.padStart(2, "0")] || month} ${year})` + (isMtd ? ` • MTD ${activeDays} Hari` : "");

    return _applyProductFiltersClient({
      ok: true,
      brand: brandUpper,
      year, month,
      granularity: "daily",
      is_mtd: isMtd,
      active_days: activeDays,
      summary: {
        total_trx: totalRealTrx,
        total_sukses: totSukses,
        daily_trx_avg: avgDailyTrx,
        avg_monthly_trx: avgDailyTrx,
        avg_monthly_cust: avgDailyCust,
        avg_tpm: avgTpm,
        avg_sukses_pct: monthSuksesRate,
        avg_sukses_str: monthSuksesRate.toFixed(1) + "%",
        avg_dur_sec: monthDurSec,
        avg_dur_str: monthDurStr,
        total_points: countPts,
        granularity_label: granLabel,
        top_category: topCategory,
        top_branch: topBranch
      },
      timeline,
      categories_total: categoriesTotal,
      branches_total: branchesTotal,
      hourly_distribution: hourlyDistribution,
      weekday_distribution: weekdayDistribution,
      status_breakdown: {
        "Sukses": monthSuksesRate,
        "Gagal Nomor": Number((gagalTot * 0.55).toFixed(1)),
        "Gagal Saldo": Number((gagalTot * 0.25).toFixed(1)),
        "Timeout Provider": Number((gagalTot * 0.20).toFixed(1))
      },
      segments: (dataAll[targetBrands[0]] && dataAll[targetBrands[0]][targetYm]) ? (dataAll[targetBrands[0]][targetYm].segments || {}) : {},
      modules_scorecard: modulesData.scorecard,
      top_failing_modules: modulesData.top_failing,
      top_slowest_modules: modulesData.top_slowest,
      modules_summary: modulesData.summary
    }, kategori, operator, tipe, targetBrands, [targetYm], dataAll);
  }

  // 2. GRANULARITAS TAHUNAN (4 TAHUN: 2023 - 2026)
  if (year === "ALL" && month === "ALL") {
    const years = ["2023", "2024", "2025", "2026"];
    const modulesData = _aggregateModulesScorecardClient(targetBrands, allYms, dataAll, tipe, kategori, operator);

    const timeline = [];
    let totTrx = 0;
    let totCustSum = 0;
    let totDaysAll = 0;
    const categoriesTotal = {};
    const branchesTotal = {};

    years.forEach(y => {
      const yYms = allYms.filter(ym => ym.startsWith(`${y}-`));
      let yTrx = 0;
      let yCustDailySum = 0;
      let ySuksesSum = 0;
      let yDurSum = 0;
      let yDays = 0;
      const yCats = {};
      const yBranches = {};

      yYms.forEach(ym => {
        targetBrands.forEach(b => {
          const item = (dataAll[b] && dataAll[b][ym]) ? dataAll[b][ym] : null;
          if (!item) return;
          yTrx += item.trx_count || 0;

          // Ambil rata-rata customer aktif harian per bulan
          const bDaily = item.daily || [];
          const bDayCust = bDaily.length > 0
            ? (bDaily.reduce((acc, d) => acc + (d.cust || 0), 0) / bDaily.length)
            : (item.daily_customers || 1200);
          yCustDailySum += bDayCust;
          ySuksesSum += item.sukses_pct || 98.4;
          yDurSum += item.avg_dur_sec || 23.0;

          Object.entries(item.categories || {}).forEach(([cat, cVal]) => {
            yCats[cat] = (yCats[cat] || 0) + cVal;
            categoriesTotal[cat] = (categoriesTotal[cat] || 0) + cVal;
          });

          Object.entries(item.branches || {}).forEach(([br, brVal]) => {
            yBranches[br] = (yBranches[br] || 0) + brVal;
            branchesTotal[br] = (branchesTotal[br] || 0) + brVal;
          });
        });

        const sampleB = dataAll[targetBrands[0]] && dataAll[targetBrands[0]][ym];
        yDays += (sampleB && sampleB.days_count) ? sampleB.days_count : 30;
      });

      const mCount = yYms.length || 1;
      const yAvgCust = Math.round(yCustDailySum / (mCount * targetBrands.length));
      const yDailyTrx = yDays > 0 ? Math.round(yTrx / yDays) : 0;
      const yTpm = yAvgCust > 0 ? Number((yDailyTrx / yAvgCust).toFixed(2)) : 0;
      const ySukses = Number((ySuksesSum / (mCount * targetBrands.length)).toFixed(1));
      const yDurSec = Number((yDurSum / (mCount * targetBrands.length)).toFixed(1));

      totTrx += yTrx;
      totCustSum += yAvgCust;
      totDaysAll += yDays;

      timeline.push({
        year: y,
        label: `Tahun ${y}` + (y === "2026" ? " (YTD/MTD)" : ""),
        trx: yTrx,
        daily_trx: yDailyTrx,
        days_count: yDays,
        customers: yAvgCust,
        tpm: yTpm,
        sukses_pct: ySukses,
        dur_sec: yDurSec,
        dur_str: formatDurationSec(yDurSec),
        categories: yCats,
        branches: yBranches
      });
    });

    const countPts = timeline.length || 1;
    const avgYearlyTrx = Math.round(totTrx / countPts);
    const avgYearlyCust = Math.round(totCustSum / countPts);
    const overallDailyTrx = totDaysAll > 0 ? Math.round(totTrx / totDaysAll) : 0;
    const avgTpm = avgYearlyCust > 0 ? Number((overallDailyTrx / avgYearlyCust).toFixed(2)) : 0;

    const overallSuksesPct = Number((timeline.reduce((acc, t) => acc + (t.sukses_pct || 98.0), 0) / countPts).toFixed(1));
    const overallDurSec = Number((timeline.reduce((acc, t) => acc + (t.dur_sec || 23.0), 0) / countPts).toFixed(1));
    const overallDurStr = formatDurationSec(overallDurSec);

    const hourlyHours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
    const hourlyWeights = [
      0.012, 0.008, 0.005, 0.004, 0.006, 0.018, 0.035, 0.062, 0.078, 0.082, 0.085, 0.087,
      0.081, 0.076, 0.075, 0.079, 0.086, 0.092, 0.098, 0.102, 0.094, 0.072, 0.045, 0.022
    ];
    const hourlyDistribution = hourlyHours.map((h, i) => ({
      hour: h,
      trx: Math.round(overallDailyTrx * hourlyWeights[i])
    }));

    const weekdayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    const weekdayWeights = [0.142, 0.144, 0.141, 0.146, 0.155, 0.158, 0.114];
    const weekdayDistribution = weekdayNames.map((d, i) => ({
      day: d,
      trx: Math.round((totTrx / 52) * weekdayWeights[i])
    }));

    const topCategory = Object.keys(categoriesTotal).length > 0
      ? Object.entries(categoriesTotal).sort((a, b) => b[1] - a[1])[0][0] : "EWALLET";
    const topBranch = Object.keys(branchesTotal).length > 0
      ? Object.entries(branchesTotal).sort((a, b) => b[1] - a[1])[0][0] : "BSD";

    const gagalTot = Math.max(0, Number((100 - overallSuksesPct).toFixed(1)));

    return _applyProductFiltersClient({
      ok: true,
      brand: brandUpper,
      year: "ALL",
      month: "ALL",
      granularity: "yearly",
      is_mtd: false,
      summary: {
        total_trx: totTrx,
        daily_trx_avg: overallDailyTrx,
        avg_monthly_trx: avgYearlyTrx,
        avg_monthly_cust: avgYearlyCust,
        avg_tpm: avgTpm,
        avg_sukses_pct: overallSuksesPct,
        avg_sukses_str: overallSuksesPct.toFixed(1) + "%",
        avg_dur_sec: overallDurSec,
        avg_dur_str: overallDurStr,
        total_points: countPts,
        granularity_label: "Komparasi Tahunan (2023 - 2026)",
        top_category: topCategory,
        top_branch: topBranch
      },
      timeline,
      categories_total: categoriesTotal,
      branches_total: branchesTotal,
      hourly_distribution: hourlyDistribution,
      weekday_distribution: weekdayDistribution,
      status_breakdown: {
        "Sukses": overallSuksesPct,
        "Gagal Nomor": Number((gagalTot * 0.55).toFixed(1)),
        "Gagal Saldo": Number((gagalTot * 0.25).toFixed(1)),
        "Timeout Provider": Number((gagalTot * 0.20).toFixed(1))
      },
      segments: (dataAll[targetBrands[0]] && allYms.length > 0 && dataAll[targetBrands[0]][allYms[allYms.length - 1]]) ? (dataAll[targetBrands[0]][allYms[allYms.length - 1]].segments || {}) : {},
      modules_scorecard: modulesData.scorecard,
      top_failing_modules: modulesData.top_failing,
      top_slowest_modules: modulesData.top_slowest,
      modules_summary: modulesData.summary
    }, kategori, operator, tipe, targetBrands, allYms, dataAll);
  }

  // 3. GRANULARITAS 12 BULAN DI 1 TAHUN (User pilih Tahun spesifik dan Bulan = 'ALL')
  const filteredYms = allYms.filter(ym => {
    const [y, m] = ym.split("-");
    if (year !== "ALL" && y !== year) return false;
    if (month !== "ALL" && m !== month) return false;
    return true;
  });

  const modulesData = _aggregateModulesScorecardClient(targetBrands, filteredYms, dataAll, tipe, kategori, operator);

  const timeline = [];
  let totTrx = 0;
  let totCust = 0;
  let totTpmSum = 0;
  let totDaysSum = 0;
  const categoriesTotal = {};
  const branchesTotal = {};

  filteredYms.forEach(ym => {
    const [y, m] = ym.split("-");
    const mName = MONTH_NAMES[m] || m;
    const sampleItem = (dataAll[targetBrands[0]] && dataAll[targetBrands[0]][ym]) ? dataAll[targetBrands[0]][ym] : null;
    const isCurMtd = sampleItem ? sampleItem.is_mtd : (ym === "2026-10");
    const numDays = sampleItem ? (sampleItem.active_days || sampleItem.days_count || (sampleItem.daily && sampleItem.daily.length) || 13) : 13;
    const label = isCurMtd ? `${mName} (MTD-${numDays}h)` : mName;

    let ymTrx = 0;
    let ymCust = 0;
    let ymSuksesSum = 0;
    let ymDurSum = 0;
    let ymDailyCust = 0;
    const ymCats = {};
    const ymBranches = {};

    targetBrands.forEach(b => {
      const item = (dataAll[b] && dataAll[b][ym]) ? dataAll[b][ym] : null;
      if (!item) return;

      ymTrx += item.trx_count || 0;
      ymCust += item.active_customers || 0;

      const bDaily = item.daily || [];
      const bDayCust = bDaily.length > 0
        ? (bDaily.reduce((acc, d) => acc + (d.cust || 0), 0) / bDaily.length)
        : (item.daily_customers || 1200);
      ymDailyCust += bDayCust;

      ymSuksesSum += item.sukses_pct || 98.4;
      ymDurSum += item.avg_dur_sec || 23.0;

      Object.entries(item.categories || {}).forEach(([cat, cVal]) => {
        ymCats[cat] = (ymCats[cat] || 0) + cVal;
        categoriesTotal[cat] = (categoriesTotal[cat] || 0) + cVal;
      });

      Object.entries(item.branches || {}).forEach(([br, bVal]) => {
        ymBranches[br] = (ymBranches[br] || 0) + bVal;
        branchesTotal[br] = (branchesTotal[br] || 0) + bVal;
      });
    });

    const dailyTrx = numDays > 0 ? Math.round(ymTrx / numDays) : 0;
    const avgDayCust = Math.round(ymDailyCust / targetBrands.length);
    // TPM Harian = Rata-rata Trx / Hari dibagi Rata-rata Customer / Hari (standar modul #daily)
    const tpm = avgDayCust > 0 ? Number((dailyTrx / avgDayCust).toFixed(2)) : 0;
    const avgSukses = Number((ymSuksesSum / targetBrands.length).toFixed(1));
    const avgDur = Number((ymDurSum / targetBrands.length).toFixed(1));

    totTrx += ymTrx;
    totCust += avgDayCust;
    totTpmSum += tpm;
    totDaysSum += numDays;

    timeline.push({
      ym, year: y, month: m, label,
      is_mtd: isCurMtd,
      days_count: numDays,
      trx: ymTrx,
      daily_trx: dailyTrx,
      customers: avgDayCust,
      tpm: tpm,
      sukses_pct: avgSukses,
      dur_sec: avgDur,
      dur_str: formatDurationSec(avgDur),
      categories: ymCats,
      branches: ymBranches
    });
  });

  const countPts = timeline.length || 1;
  const avgMonthlyTrx = Math.round(totTrx / countPts);
  const avgMonthlyCust = Math.round(totCust / countPts);
  const overallDailyTrx = totDaysSum > 0 ? Math.round(totTrx / totDaysSum) : 0;
  const avgTpm = avgMonthlyCust > 0 ? Number((overallDailyTrx / avgMonthlyCust).toFixed(2)) : 0;

  const overallSuksesPct = Number((timeline.reduce((acc, t) => acc + (t.sukses_pct || 98.0), 0) / countPts).toFixed(1));
  const overallDurSec = Number((timeline.reduce((acc, t) => acc + (t.dur_sec || 23.0), 0) / countPts).toFixed(1));
  const overallDurStr = formatDurationSec(overallDurSec);

  const hourlyHours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
  const hourlyWeights = [
    0.012, 0.008, 0.005, 0.004, 0.006, 0.018, 0.035, 0.062, 0.078, 0.082, 0.085, 0.087,
    0.081, 0.076, 0.075, 0.079, 0.086, 0.092, 0.098, 0.102, 0.094, 0.072, 0.045, 0.022
  ];
  const hourlyDistribution = hourlyHours.map((h, i) => ({
    hour: h,
    trx: Math.round(overallDailyTrx * hourlyWeights[i])
  }));

  const weekdayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const weekdayWeights = [0.142, 0.144, 0.141, 0.146, 0.155, 0.158, 0.114];
  const weekdayDistribution = weekdayNames.map((d, i) => ({
    day: d,
    trx: Math.round((avgMonthlyTrx / 4.3) * weekdayWeights[i])
  }));

  const topCategory = Object.keys(categoriesTotal).length > 0
    ? Object.entries(categoriesTotal).sort((a, b) => b[1] - a[1])[0][0] : "EWALLET";
  const topBranch = Object.keys(branchesTotal).length > 0
    ? Object.entries(branchesTotal).sort((a, b) => b[1] - a[1])[0][0] : "BSD";

  const gagalTot = Math.max(0, Number((100 - overallSuksesPct).toFixed(1)));

  return _applyProductFiltersClient({
    ok: true,
    brand: brandUpper,
    year, month,
    granularity: "monthly",
    is_mtd: false,
    summary: {
      total_trx: totTrx,
      daily_trx_avg: overallDailyTrx,
      avg_monthly_trx: avgMonthlyTrx,
      avg_monthly_cust: avgMonthlyCust,
      avg_tpm: avgTpm,
      avg_sukses_pct: overallSuksesPct,
      avg_sukses_str: overallSuksesPct.toFixed(1) + "%",
      avg_dur_sec: overallDurSec,
      avg_dur_str: overallDurStr,
      total_points: countPts,
      granularity_label: `Tren 12 Bulan (Tahun ${year})`,
      top_category: topCategory,
      top_branch: topBranch
    },
    timeline,
    categories_total: categoriesTotal,
    branches_total: branchesTotal,
    hourly_distribution: hourlyDistribution,
    weekday_distribution: weekdayDistribution,
    status_breakdown: {
      "Sukses": overallSuksesPct,
      "Gagal Nomor": Number((gagalTot * 0.55).toFixed(1)),
      "Gagal Saldo": Number((gagalTot * 0.25).toFixed(1)),
      "Timeout Provider": Number((gagalTot * 0.20).toFixed(1))
    },
    segments: (dataAll[targetBrands[0]] && filteredYms.length > 0 && dataAll[targetBrands[0]][filteredYms[filteredYms.length - 1]]) ? (dataAll[targetBrands[0]][filteredYms[filteredYms.length - 1]].segments || {}) : {},
    modules_scorecard: modulesData.scorecard,
    top_failing_modules: modulesData.top_failing,
    top_slowest_modules: modulesData.top_slowest,
    modules_summary: modulesData.summary
  }, kategori, operator, tipe, targetBrands, filteredYms, dataAll);
}

// ── ENGINE FILTER PRODUK CLIENT-SIDE ──
function _applyProductFiltersClient(res, kategori = "ALL", operator = "ALL", tipe = "ALL", targetBrands = [], targetYms = [], dataAll = {}) {
  if (kategori === "ALL" && operator === "ALL" && tipe === "ALL") return res;

  const summary = res.summary || {};
  const timeline = res.timeline || [];
  const categoriesTotal = res.categories_total || {};
  const granularity = res.granularity || "monthly";

  const targetCat = (kategori && kategori !== "ALL") ? kategori.toUpperCase().trim() : null;
  const targetOp = (operator && operator !== "ALL") ? operator.toUpperCase().trim() : null;
  const targetTipe = (tipe && tipe !== "ALL") ? tipe.toUpperCase().trim() : null;

  let perfKey = null;
  let targetVal = null;
  if (targetTipe) {
    perfKey = "tipes_perf";
    targetVal = targetTipe;
  } else if (targetOp) {
    perfKey = "operators_perf";
    targetVal = targetOp;
  } else if (targetCat) {
    perfKey = "categories_perf";
    targetVal = targetCat;
  }

  const lblParts = [];
  if (targetCat) {
    lblParts.push(`Kat: ${targetCat}`);
    summary.top_category = targetCat;
  }
  if (targetOp) lblParts.push(`Op: ${targetOp}`);
  if (targetTipe) lblParts.push(`Tipe: ${targetTipe}`);
  if (lblParts.length > 0) {
    summary.granularity_label = (summary.granularity_label || "") + " • " + lblParts.join(" • ");
  }


  let filtTrx = 0;
  let filtSukses = 0;
  let filtWeightedDur = 0.0;
  let hasPerfData = false;

  if (perfKey && targetVal) {
    targetBrands.forEach(b => {
      targetYms.forEach(ym => {
        const ymData = (dataAll[b] && dataAll[b][ym]) || {};
        const perfDict = ymData[perfKey] || {};
        let matched = null;
        for (const [k, v] of Object.entries(perfDict)) {
          if (k.toUpperCase() === targetVal || (perfKey === "categories_perf" && k.toUpperCase().includes(targetVal)) || (perfKey === "tipes_perf" && (k.toUpperCase().includes(targetVal) || targetVal.includes(k.toUpperCase())))) {
            matched = v;
            break;
          }
        }
        if (matched) {
          hasPerfData = true;
          const tCount = matched.trx || 0;
          const sCount = matched.trx_sukses || 0;
          const avgDur = matched.avg_dur_sec || 0.0;
          filtTrx += tCount;
          filtSukses += sCount;
          filtWeightedDur += (avgDur * sCount);
        }
      });
    });
  }

  if (!hasPerfData && targetCat && categoriesTotal[targetCat]) {
    filtTrx = categoriesTotal[targetCat];
    filtSukses = filtTrx;
    hasPerfData = true;
  }

  if (hasPerfData && filtTrx > 0) {
    const filtSukPct = Number((filtSukses / filtTrx * 100).toFixed(1));
    const filtAvgDur = filtSukses > 0 ? Number((filtWeightedDur / filtSukses).toFixed(1)) : (summary.avg_dur_sec || 21.0);

    summary.total_trx = filtTrx;
    summary.total_sukses = filtSukses;
    const countPts = timeline.length || 1;
    summary.daily_trx_avg = Math.round(filtSukses / countPts);
    summary.avg_monthly_trx = Math.round(filtTrx / countPts);
    summary.avg_sukses_pct = filtSukPct;
    summary.avg_sukses_str = `${filtSukPct.toFixed(1)}%`;
    summary.avg_dur_sec = filtAvgDur;
    summary.avg_dur_str = formatDurationSec(filtAvgDur);

    const gagalTot = Math.max(0, Number((100 - filtSukPct).toFixed(1)));
    res.status_breakdown = {
      "Sukses": filtSukPct,
      "Gagal Nomor": Number((gagalTot * 0.55).toFixed(1)),
      "Gagal Saldo": Number((gagalTot * 0.25).toFixed(1)),
      "Timeout Provider": Number((gagalTot * 0.20).toFixed(1))
    };
  }

  if (granularity === "daily" && perfKey && targetVal) {
    const targetYm = targetYms[0] || `${res.year || "2026"}-${String(res.month || "10").padStart(2, "0")}`;
    timeline.forEach(t => {
      const dNum = String(t.day || 1);
      let dTrx = 0;
      let dSuk = 0;
      let dDurSum = 0.0;
      let dFound = false;

      targetBrands.forEach(b => {
        const ymData = (dataAll[b] && dataAll[b][targetYm]) || {};
        const perfDict = ymData[perfKey] || {};
        for (const [k, v] of Object.entries(perfDict)) {
          if (k.toUpperCase() === targetVal || (perfKey === "categories_perf" && k.toUpperCase().includes(targetVal)) || (perfKey === "tipes_perf" && (k.toUpperCase().includes(targetVal) || targetVal.includes(k.toUpperCase())))) {
            const dMap = v.daily || {};
            const dInfo = dMap[dNum] || dMap[parseInt(dNum, 10)];
            if (dInfo) {
              dFound = true;
              dTrx += dInfo.trx || 0;
              dSuk += dInfo.trx_sukses || 0;
              dDurSum += ((dInfo.dur_sec || 0.0) * (dInfo.trx_sukses || 0));
            }
            break;
          }
        }
      });

      if (dFound && dTrx > 0) {
        t.trx = dTrx;
        t.daily_trx = dSuk;
        t.sukses_pct = Number((dSuk / dTrx * 100).toFixed(1));
        const dSec = dSuk > 0 ? Number((dDurSum / dSuk).toFixed(1)) : (summary.avg_dur_sec || 21.0);
        t.dur_sec = dSec;
        t.dur_str = formatDurationSec(dSec);
      } else if (targetCat) {
        const cVal = (t.categories && t.categories[targetCat]) || 0;
        t.trx = cVal;
        t.daily_trx = cVal;
      }
    });
  } else if (granularity === "monthly" && perfKey && targetVal) {
    timeline.forEach(t => {
      const ym = t.ym;
      let mTrx = 0;
      let mSuk = 0;
      let mDurSum = 0.0;
      let mFound = false;

      targetBrands.forEach(b => {
        const ymData = (dataAll[b] && dataAll[b][ym]) || {};
        const perfDict = ymData[perfKey] || {};
        for (const [k, v] of Object.entries(perfDict)) {
          if (k.toUpperCase() === targetVal || (perfKey === "categories_perf" && k.toUpperCase().includes(targetVal)) || (perfKey === "tipes_perf" && (k.toUpperCase().includes(targetVal) || targetVal.includes(k.toUpperCase())))) {
            mFound = true;
            mTrx += v.trx || 0;
            mSuk += v.trx_sukses || 0;
            mDurSum += ((v.avg_dur_sec || 0.0) * (v.trx_sukses || 0));
            break;
          }
        }
      });

      if (mFound && mTrx > 0) {
        t.trx = mTrx;
        t.trx_sukses = mSuk;
        const numDays = t.days_count || 30;
        t.daily_trx = Math.round(mSuk / numDays);
        t.sukses_pct = Number((mSuk / mTrx * 100).toFixed(1));
        const dSec = mSuk > 0 ? Number((mDurSum / mSuk).toFixed(1)) : (summary.avg_dur_sec || 21.0);
        t.dur_sec = dSec;
        t.dur_str = formatDurationSec(dSec);
      } else if (targetCat) {
        const cVal = (t.categories && t.categories[targetCat]) || 0;
        t.trx = cVal;
        const numDays = t.days_count || 30;
        t.daily_trx = Math.round(cVal / numDays);
      }
    });
  }

  return res;
}

function renderCurrentTabCharts(data) {
  if (currentAnalisaTab === "distribusi") {
    renderDistribusiTab(data);
  } else if (currentAnalisaTab === "service") {
    renderServiceTab(data);
  } else if (currentAnalisaTab === "supplier") {
    renderSupplierTab(data);
  } else if (currentAnalisaTab === "lain") {
    renderLainTab(data);
  }
}

// ── ENTRY POINTS DARI ROUTER ──
function loadAnalisa() {
  updateProductFilterDropdowns();
  const hash = window.location.hash || "#analisa";
  if (hash.includes("tab=service") || hash === "#analisa-service") {
    switchAnalisaTab("service");
  } else if (hash.includes("tab=supplier") || hash === "#analisa-supplier") {
    switchAnalisaTab("supplier");
  } else if (hash.includes("tab=profit") || hash === "#analisa-profit") {
    switchAnalisaTab("profit");
  } else if (hash.includes("tab=lain") || hash === "#analisa-lain") {
    switchAnalisaTab("lain");
  } else {
    switchAnalisaTab("distribusi");
  }
}

function loadAnalisaDistribusi() {
  switchAnalisaTab("distribusi");
}

function loadAnalisaService() {
  switchAnalisaTab("service");
}

function loadAnalisaSupplier() {
  switchAnalisaTab("supplier");
}

function loadAnalisaProfit() {
  switchAnalisaTab("profit");
}

function loadAnalisaLain() {
  switchAnalisaTab("lain");
}

// =============================================================================
// 1. TAB: ANALISA DISTRIBUSI (DAILY TRX BERBASIS CUT-OFF BULAN)
// =============================================================================
function renderDistribusiTab(data) {
  const summary = data.summary || {};
  const timeline = data.timeline || [];
  const brandColor = activeFilters.brand === "OKIPAY" ? "#dc2626" : (activeFilters.brand === "ALL" ? "#4f46e5" : "#0284c7");
  const isDaily = data.granularity === "daily";
  const isYearly = data.granularity === "yearly";

  // 1. Update KPI Card Values (Roboto Mono)
  // KPI Card 1: Rata-rata Daily Trx (Cut-off Days)
  const elTrx = document.getElementById("dist-stat-trx");
  if (elTrx) elTrx.textContent = (summary.daily_trx_avg || summary.avg_monthly_trx || 0).toLocaleString("id-ID");

  const elSubTrx = document.getElementById("dist-stat-trx-sub");
  if (elSubTrx) {
    if (isDaily) {
      elSubTrx.textContent = "Total Sebulan (" + (summary.total_trx || 0).toLocaleString("id-ID") + " Total)";
    } else if (isYearly) {
      elSubTrx.textContent = "Total Semua (" + (summary.total_trx || 0).toLocaleString("id-ID") + " Total)";
    } else {
      elSubTrx.textContent = "Total Setahun (" + (summary.total_trx || 0).toLocaleString("id-ID") + " Total Trx)";
    }
  }

  // KPI Card 2: Customer Aktif Rata-rata per Hari
  const elCust = document.getElementById("dist-stat-member");
  if (elCust) elCust.textContent = (summary.avg_monthly_cust || 0).toLocaleString("id-ID");

  const elSubCust = document.getElementById("dist-stat-member-sub");
  if (elSubCust) {
    elSubCust.textContent = "Customer Aktif / Hari";
  }

  // KPI Card 3: TPM Harian (Trx per Hari per Customer)
  const elTpm = document.getElementById("dist-stat-tpm");
  if (elTpm) elTpm.textContent = (summary.avg_tpm || 0).toFixed(2);

  const elSubTpm = document.getElementById("dist-stat-tpm-sub");
  if (elSubTpm) {
    elSubTpm.textContent = "Daily Trx / Member (Trx/Hari)";
  }

  // KPI Card 4: Top Cabang
  const elCabang = document.getElementById("dist-stat-top-cabang");
  if (elCabang) elCabang.textContent = summary.top_branch || "-";

  // Update Dynamic Chart Title (D1)
  const elTitle = document.getElementById("dist-trend-title");
  if (elTitle) {
    if (isDaily) {
      elTitle.textContent = `Tren Harian: Volume Transaksi vs Customer Aktif (${summary.granularity_label})`;
    } else if (isYearly) {
      elTitle.textContent = `Tren Daily Trx Tahunan: Trx / Hari vs Customer Aktif (2023 - 2026)`;
    } else {
      elTitle.textContent = `Tren Daily Trx Bulanan: Total Trx / Hari Cut-off (Tahun ${data.year})`;
    }
  }

  // 2. Chart D1: Tren Transaksi (Daily Trx) vs Customer (Combo Bar + Line)
  renderDistTrendChart(timeline, brandColor, isDaily);

  // 3. Chart D2: Kontribusi per Cabang / Channel (Horizontal Bar)
  renderDistCabangChart(data.branches_total || {}, brandColor);

  // 4. Chart D3: Tren TPM (Produktivitas per Customer)
  renderDistTpmChart(timeline, isDaily);

  // 5. Chart D4: Segmentasi Retensi Customer (Doughnut)
  renderDistSegmentChart(data.segments || {});
}

function renderDistTrendChart(timeline, brandColor, isDaily) {
  const ctx = document.getElementById("chart-dist-trend");
  if (!ctx) return;
  destroyChart("distTrend");

  const labels = timeline.map(t => t.label);
  // Gunakan daily_trx (Total Trx / Hari Cut-off) agar tren per bulan adil & Oktober 2026 tidak anjlok
  const trxData = timeline.map(t => isDaily ? t.trx : t.daily_trx);
  const custData = timeline.map(t => t.customers);

  const barLabel = isDaily
    ? "Transaksi Harian (Trx)"
    : "Daily Trx (Total Trx / Hari Cut-off)";

  chartInstances["distTrend"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: barLabel,
          data: trxData,
          backgroundColor: brandColor,
          borderRadius: 4,
          yAxisID: "y"
        },
        {
          label: isDaily ? "Customer Aktif / Hari" : "Customer Aktif",
          data: custData,
          type: "line",
          borderColor: "#f59e0b",
          backgroundColor: "#f59e0b",
          borderWidth: 2.5,
          pointRadius: timeline.length > 20 ? 3 : 4.5,
          pointHoverRadius: 6,
          fill: false,
          yAxisID: "y1"
        }
      ]
    },
    plugins: [{
      id: "barValueLabels",
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        if (!meta || meta.hidden) return;
        ctx.save();
        ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
        const theme = document.documentElement.getAttribute('data-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        ctx.fillStyle = theme === 'dark' ? "#ffffff" : "#0f172a";
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
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, font: { family: "inherit", size: 12 } } },
        tooltip: {
          callbacks: {
            label: context => {
              const val = Math.round(context.parsed.y).toLocaleString("id-ID");
              if (context.datasetIndex === 0 && !isDaily) {
                const item = timeline[context.dataIndex];
                const rawTotal = (item && item.trx) ? item.trx.toLocaleString("id-ID") : val;
                const days = (item && item.days_count) ? item.days_count : 30;
                return ` Daily Trx: ${val} trx/hari (Total: ${rawTotal} trx / ${days} hari)`;
              }
              return ` ${context.dataset.label}: ${val}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0 } },
        y: {
          type: "linear",
          position: "left",
          title: { display: true, text: isDaily ? "Jumlah Transaksi" : "Daily Trx (Trx / Hari)" },
          ticks: { callback: v => Number(v).toLocaleString("id-ID") }
        },
        y1: {
          type: "linear",
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Customer Aktif" },
          ticks: { callback: v => Number(v).toLocaleString("id-ID") }
        }
      }
    }
  });
}

function renderDistCabangChart(branchesTotal, brandColor) {
  const ctx = document.getElementById("chart-dist-cabang");
  if (!ctx) return;
  destroyChart("distCabang");

  const sortedPairs = Object.entries(branchesTotal).sort((a, b) => b[1] - a[1]);
  const labels = sortedPairs.map(p => p[0]);
  const values = sortedPairs.map(p => p[1]);

  chartInstances["distCabang"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Volume Transaksi",
          data: values,
          backgroundColor: brandColor,
          borderRadius: 4
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` Total: ${Number(context.parsed.x).toLocaleString("id-ID")} trx`
          }
        }
      },
      scales: {
        x: { ticks: { callback: v => Number(v).toLocaleString("id-ID") } }
      }
    }
  });
}

function renderDistTpmChart(timeline, isDaily) {
  const ctx = document.getElementById("chart-dist-tpm");
  if (!ctx) return;
  destroyChart("distTpm");

  const labels = timeline.map(t => t.label);
  const tpmData = timeline.map(t => t.tpm);

  chartInstances["distTpm"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Daily Trx / Member (TPM Harian)",
          data: tpmData,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.12)",
          borderWidth: 2.5,
          pointRadius: timeline.length > 20 ? 3 : 4,
          fill: true,
          tension: 0.3
        }
      ]
    },
    plugins: [{
      id: "lineValueLabels",
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        if (!meta || meta.hidden) return;
        ctx.save();
        ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
        const theme = document.documentElement.getAttribute('data-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        ctx.fillStyle = theme === 'dark' ? "#ffffff" : "#0f172a";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        meta.data.forEach((point, index) => {
          const val = tpmData[index];
          if (val !== null && val !== undefined) {
            const formatted = typeof val === "number" ? val.toFixed(1) : val;
            ctx.fillText(formatted, point.x, point.y - 6);
          }
        });
        ctx.restore();
      }
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` Daily Trx/Member: ${context.parsed.y.toFixed(2)} trx/hari`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          title: { display: true, text: "Trx / Hari per Member" }
        }
      }
    }
  });
}

function renderDistSegmentChart(segments = {}) {
  const ctx = document.getElementById("chart-dist-segment");
  if (!ctx) return;
  destroyChart("distSegment");

  const tot = segments.total_active || ((segments.retained || 0) + (segments.new_active || 0) + (segments.reactivated || 0)) || 0;
  const retained = segments.retained || 0;
  const baru = segments.new_active || 0;
  const reactivated = segments.reactivated || 0;
  const churnRes = segments.churn_reseller || 0;
  const churnAg = segments.churn_agen || 0;

  const retPct = tot > 0 ? ((retained / tot) * 100).toFixed(2) : (segments.retained_pct != null ? Number(segments.retained_pct).toFixed(2) : "0.00");
  const baruPct = tot > 0 ? ((baru / tot) * 100).toFixed(2) : (segments.baru_pct != null ? Number(segments.baru_pct).toFixed(2) : "0.00");
  const reacPct = tot > 0 ? ((reactivated / tot) * 100).toFixed(2) : (segments.reactivated_pct != null ? Number(segments.reactivated_pct).toFixed(2) : "0.00");

  // Update DOM Badges / Stat Pills
  const elTotBadge = document.getElementById("dist-seg-total-badge");
  if (elTotBadge) {
    elTotBadge.textContent = `${Number(tot).toLocaleString("id-ID")} Reseller Aktif`;
  }

  const elValRutin = document.getElementById("seg-val-rutin");
  if (elValRutin) elValRutin.textContent = Number(retained).toLocaleString("id-ID");
  const elPctRutin = document.getElementById("seg-pct-rutin");
  if (elPctRutin) elPctRutin.textContent = `${retPct}%`;

  const elValBaru = document.getElementById("seg-val-baru");
  if (elValBaru) elValBaru.textContent = Number(baru).toLocaleString("id-ID");
  const elPctBaru = document.getElementById("seg-pct-baru");
  if (elPctBaru) elPctBaru.textContent = `${baruPct}%`;

  const elValReac = document.getElementById("seg-val-reaktivasi");
  if (elValReac) elValReac.textContent = Number(reactivated).toLocaleString("id-ID");
  const elPctReac = document.getElementById("seg-pct-reaktivasi");
  if (elPctReac) elPctReac.textContent = `${reacPct}%`;

  const elValChurn = document.getElementById("seg-val-churn");
  if (elValChurn) elValChurn.textContent = Number(churnRes).toLocaleString("id-ID");
  const elSubChurn = document.getElementById("seg-sub-churn");
  if (elSubChurn) {
    elSubChurn.textContent = churnAg > 0 ? `(${Number(churnAg).toLocaleString("id-ID")} Agen)` : "";
  }

  // Active Cohort Slices (Total 100% of Active Base)
  const chartData = [retained, baru, reactivated];
  const chartLabels = ["Aktif Rutin", "Member Baru", "Reaktivasi"];
  const chartPcts = [retPct, baruPct, reacPct];

  chartInstances["distSegment"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: chartLabels,
      datasets: [
        {
          data: chartData,
          backgroundColor: ["#16a34a", "#2563eb", "#d97706"],
          borderColor: "var(--card-bg, #ffffff)",
          borderWidth: 2,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            font: { family: "inherit", size: 12 },
            generateLabels: chart => {
              const orig = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
              return orig.map((item, idx) => {
                const count = chartData[idx] || 0;
                const pct = chartPcts[idx] || "0.00";
                item.text = `${chartLabels[idx]}: ${Number(count).toLocaleString("id-ID")} (${pct}%)`;
                return item;
              });
            }
          }
        },
        tooltip: {
          callbacks: {
            label: context => {
              const idx = context.dataIndex;
              const count = Number(context.parsed).toLocaleString("id-ID");
              const pct = chartPcts[idx] || "0.00";
              return ` ${context.label}: ${count} Reseller (${pct}%)`;
            }
          }
        }
      },
      cutout: "68%"
    }
  });
}

// =============================================================================
// 2. TAB: ANALISA SERVICE (RELASI TRX & PRODUCT)
// =============================================================================
function renderServiceTab(data) {
  const summary = data.summary || {};
  const timeline = data.timeline || [];
  const categoriesTotal = data.categories_total || {};
  const isDaily = data.granularity === "daily";
  const isYearly = data.granularity === "yearly";

  // 1. KPI Cards
  const elSukses = document.getElementById("serv-stat-sukses");
  if (elSukses) {
    if (summary.avg_sukses_str) {
      elSukses.textContent = summary.avg_sukses_str;
    } else if (summary.avg_sukses_pct != null) {
      elSukses.textContent = `${Number(summary.avg_sukses_pct).toFixed(1)}%`;
    } else if (timeline.length > 0 && timeline[0].sukses_pct != null) {
      elSukses.textContent = `${Number(timeline[0].sukses_pct).toFixed(1)}%`;
    } else {
      elSukses.textContent = "98.0%";
    }
  }

  const elDurasi = document.getElementById("serv-stat-durasi");
  if (elDurasi) {
    if (summary.avg_dur_str) {
      elDurasi.textContent = summary.avg_dur_str;
    } else if (summary.avg_dur_sec != null) {
      elDurasi.textContent = formatDurationSec(summary.avg_dur_sec);
    } else if (timeline.length > 0 && timeline[0].dur_str) {
      elDurasi.textContent = timeline[0].dur_str;
    } else if (timeline.length > 0 && timeline[0].dur_sec != null) {
      elDurasi.textContent = formatDurationSec(timeline[0].dur_sec);
    } else {
      elDurasi.textContent = "00:21";
    }
  }

  const elKategori = document.getElementById("serv-stat-kategori");
  if (elKategori) {
    if (activeFilters.tipe !== "ALL" && activeFilters.operator !== "ALL") {
      elKategori.textContent = `${activeFilters.operator} (${activeFilters.tipe})`;
    } else if (activeFilters.tipe !== "ALL") {
      elKategori.textContent = activeFilters.tipe;
    } else if (activeFilters.operator !== "ALL") {
      elKategori.textContent = activeFilters.operator;
    } else if (activeFilters.kategori !== "ALL") {
      elKategori.textContent = activeFilters.kategori;
    } else {
      elKategori.textContent = summary.top_category || "EWALLET";
    }
  }

  const elTotal = document.getElementById("serv-stat-total");
  if (elTotal) {
    elTotal.textContent = (summary.total_trx || 0).toLocaleString("id-ID");
  }

  const elSubTotal = document.getElementById("serv-stat-total-sub");
  if (elSubTotal) {
    if (activeFilters.tipe !== "ALL" && activeFilters.operator !== "ALL") {
      elSubTotal.textContent = `Volume ${activeFilters.operator} (${activeFilters.tipe}) Terfilter`;
    } else if (activeFilters.tipe !== "ALL") {
      elSubTotal.textContent = `Volume ${activeFilters.tipe} Terfilter`;
    } else if (activeFilters.operator !== "ALL") {
      elSubTotal.textContent = `Volume ${activeFilters.operator} Terfilter`;
    } else if (activeFilters.kategori !== "ALL") {
      elSubTotal.textContent = `Volume ${activeFilters.kategori} Terfilter`;
    } else {
      elSubTotal.textContent = summary.granularity_label || "Akumulasi Periode Terpilih";
    }
  }

  // Update Dynamic Chart Title
  const elTitle = document.getElementById("serv-trend-title");
  if (elTitle) {
    let filterLabel = "Kategori Produk";
    if (activeFilters.tipe !== "ALL" && activeFilters.operator !== "ALL") {
      filterLabel = `${activeFilters.operator} (${activeFilters.tipe})`;
    } else if (activeFilters.tipe !== "ALL") {
      filterLabel = `Tipe ${activeFilters.tipe}`;
    } else if (activeFilters.operator !== "ALL") {
      filterLabel = `Operator ${activeFilters.operator}`;
    } else if (activeFilters.kategori !== "ALL") {
      filterLabel = `Kategori ${activeFilters.kategori}`;
    }
    if (isDaily) {
      elTitle.textContent = `Tren Volume ${filterLabel} Harian (${summary.granularity_label || ""})`;
    } else if (isYearly) {
      elTitle.textContent = `Tren Volume ${filterLabel} Tahunan (2023 - 2026)`;
    } else {
      elTitle.textContent = `Tren 12 Bulan Volume ${filterLabel} (Tahun ${data.year})`;
    }
  }

  // 1. Chart S1: Tren Kualitas Sukses Layanan (% Sukses Rate) — Full-width memanjang di bawah KPI Card
  renderServSuksesRateChart(timeline);

  // 2. Chart S2: Tren Rata-rata Durasi Kecepatan (Sukses Only) — Chart Baru Full-width memanjang
  renderServDurasiChart(timeline);

  // 3. Chart S3: Tren Penjualan per Kategori Produk
  renderServTrendChart(timeline);
}

function renderServSuksesRateChart(timeline) {
  const ctx = document.getElementById("chart-serv-sukses-rate");
  if (!ctx) return;
  destroyChart("servSuksesRate");

  const labels = timeline.map(t => t.label);
  const rates = timeline.map(t => t.sukses_pct != null ? t.sukses_pct : 0.0);
  const allZeroRates = rates.length === 0 || rates.every(r => Number(r) === 0);
  const minRate = rates.length && !allZeroRates ? Math.min(...rates.filter(r => r > 0)) : 95;
  const yMin = allZeroRates ? 0 : Math.max(70, Math.floor(minRate - 2));

  chartInstances["servSuksesRate"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "% Sukses Rate",
          data: rates,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.12)",
          borderWidth: 2.5,
          pointRadius: timeline.length > 20 ? 3 : 5,
          pointHoverRadius: 7,
          pointBackgroundColor: "#10b981",
          fill: true,
          tension: 0.3
        }
      ]
    },
    plugins: [{
      id: "suksesRateLabels",
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        if (!meta || meta.hidden) return;
        ctx.save();
        ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
        const theme = document.documentElement.getAttribute('data-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        ctx.fillStyle = theme === 'dark' ? "#ffffff" : "#0f172a";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        meta.data.forEach((point, index) => {
          const val = rates[index];
          if (val !== null && val !== undefined) {
            const formatted = `${Number(val).toFixed(1)}%`;
            ctx.fillText(formatted, point.x, point.y - 6);
          }
        });
        ctx.restore();
      }
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` Success Rate: ${context.parsed.y.toFixed(1)}%`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          min: yMin,
          max: 100,
          ticks: { callback: v => `${v}%` },
          title: { display: true, text: "% Sukses Rate" }
        }
      }
    }
  });
}

function renderServDurasiChart(timeline) {
  const ctx = document.getElementById("chart-serv-durasi");
  if (!ctx) return;
  destroyChart("servDurasi");

  const labels = timeline.map(t => t.label);
  const durValues = timeline.map(t => {
    if (t.dur_sec != null && !isNaN(t.dur_sec)) {
      return Number(Number(t.dur_sec).toFixed(1));
    }
    return 0.0;
  });

  const allZeroDur = durValues.length === 0 || durValues.every(d => Number(d) === 0);
  const minDur = durValues.length && !allZeroDur ? Math.min(...durValues.filter(d => d > 0)) : 15;
  const maxDur = durValues.length && !allZeroDur ? Math.max(...durValues) : 30;
  const yMin = allZeroDur ? 0 : Math.max(0, Math.floor(minDur - 3));
  const yMax = allZeroDur ? 30 : Math.ceil(maxDur + 3);

  chartInstances["servDurasi"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Avg Durasi Kecepatan (Detik)",
          data: durValues,
          borderColor: "#06b6d4",
          backgroundColor: "rgba(6, 182, 212, 0.12)",
          borderWidth: 2.5,
          pointRadius: timeline.length > 20 ? 3 : 5,
          pointHoverRadius: 7,
          pointBackgroundColor: "#06b6d4",
          fill: true,
          tension: 0.35
        }
      ]
    },
    plugins: [{
      id: "durasiLabels",
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        if (!meta || meta.hidden) return;
        ctx.save();
        ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
        const theme = document.documentElement.getAttribute('data-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        ctx.fillStyle = theme === 'dark' ? "#ffffff" : "#0f172a";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        meta.data.forEach((point, index) => {
          const val = durValues[index];
          if (val !== null && val !== undefined) {
            const formatted = `${Number(val).toFixed(1)}s`;
            ctx.fillText(formatted, point.x, point.y - 6);
          }
        });
        ctx.restore();
      }
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => {
              const sec = context.parsed.y;
              return ` Avg Durasi: ${sec.toFixed(1)} detik (${formatDurationSec(sec)})`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          min: yMin,
          max: yMax,
          ticks: { callback: v => `${v}s` },
          title: { display: true, text: "Durasi (Detik)" }
        }
      }
    }
  });
}

function renderServTrendChart(timeline) {
  const ctx = document.getElementById("chart-serv-trend");
  if (!ctx) return;
  destroyChart("servTrend");

  const labels = timeline.map(t => t.label);

  const hasTipe = activeFilters.tipe !== "ALL";
  const hasOp = activeFilters.operator !== "ALL";
  const hasCat = activeFilters.kategori !== "ALL";

  if (hasTipe || hasOp || hasCat) {
    let label = "Volume Terfilter";
    let color = "#2563eb";
    if (hasTipe && hasOp) {
      label = `Volume ${activeFilters.operator} (${activeFilters.tipe})`;
      color = "#8b5cf6";
    } else if (hasTipe) {
      label = `Volume ${activeFilters.tipe}`;
      const tipeColors = {
        "DATA": "#06b6d4",
        "MOBILE DATA": "#06b6d4",
        "INJECT": "#f59e0b",
        "NOMINAL": "#10b981",
        "BEBAS NOMINAL": "#3b82f6",
        "REGULER": "#64748b"
      };
      color = tipeColors[activeFilters.tipe] || "#0ea5e9";
    } else if (hasOp) {
      label = `Volume ${activeFilters.operator}`;
      color = "#3b82f6";
    } else if (hasCat) {
      const cat = activeFilters.kategori;
      label = `Volume ${cat}`;
      const catColors = {
        "EWALLET": "#0284c7",
        "TELCO": "#10b981",
        "TOKEN PLN": "#8b5cf6",
        "PPOB": "#f59e0b",
        "VOUCHER GAME": "#ec4899",
        "TRANSFER STOK": "#64748b"
      };
      color = catColors[cat] || "#2563eb";
    }

    const dataValues = timeline.map(t => (t.daily_trx != null ? t.daily_trx : (t.trx || 0)));

    chartInstances["servTrend"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: label,
            data: dataValues,
            backgroundColor: color,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { usePointStyle: true, font: { family: "inherit", size: 12 } } },
          tooltip: {
            callbacks: {
              label: context => ` ${context.dataset.label}: ${Math.round(context.parsed.y).toLocaleString("id-ID")} trx`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            ticks: { callback: v => Number(v).toLocaleString("id-ID") },
            title: { display: true, text: "Jumlah Transaksi" }
          }
        }
      }
    });
    return;
  }

  const ewData = timeline.map(t => (t.categories && t.categories["EWALLET"]) || 0);
  const telData = timeline.map(t => (t.categories && t.categories["TELCO"]) || 0);
  const plnData = timeline.map(t => (t.categories && (t.categories["PLN"] || t.categories["TOKEN PLN"])) || 0);
  const ppData = timeline.map(t => (t.categories && t.categories["PPOB"]) || 0);
  const gmData = timeline.map(t => (t.categories && (t.categories["GAME"] || t.categories["VOUCHER GAME"])) || 0);

  chartInstances["servTrend"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        { label: "E-Wallet", data: ewData, backgroundColor: "#0284c7" },
        { label: "Telco", data: telData, backgroundColor: "#10b981" },
        { label: "PLN Token", data: plnData, backgroundColor: "#8b5cf6" },
        { label: "PPOB", data: ppData, backgroundColor: "#f59e0b" },
        { label: "Game", data: gmData, backgroundColor: "#ec4899" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, font: { family: "inherit", size: 12 } } },
        tooltip: {
          callbacks: {
            label: context => ` ${context.dataset.label}: ${Math.round(context.parsed.y).toLocaleString("id-ID")} trx`
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          ticks: { callback: v => Number(v).toLocaleString("id-ID") },
          title: { display: true, text: "Jumlah Transaksi" }
        }
      }
    }
  });
}

// =============================================================================
// 3. TAB: ANALISA SUPPLIER (EVALUASI VENDOR H2H & MODEM POOL CHIP)
// =============================================================================
function renderSupplierTab(data) {
  const summary = data.modules_summary || {};
  const scorecard = data.modules_scorecard || [];

  // Update Mini KPI Cards khusus Supplier
  const elTotal = document.getElementById("supp-stat-total");
  if (elTotal) elTotal.textContent = `${summary.total_modules || scorecard.length} Modul`;

  const elPrima = document.getElementById("supp-stat-prima");
  if (elPrima) elPrima.textContent = `${summary.baik_count != null ? summary.baik_count : (summary.prima_count || 0)} Modul`;

  const elWaspada = document.getElementById("supp-stat-waspada");
  if (elWaspada) elWaspada.textContent = `${summary.cukup_count != null ? summary.cukup_count : (summary.waspada_count || 0)} Modul`;

  const elGangguan = document.getElementById("supp-stat-gangguan");
  if (elGangguan) elGangguan.textContent = `${summary.kurang_count != null ? summary.kurang_count : (summary.gangguan_count || 0)} Modul`;

  // Render Quadrant Top 3 & Tabel Scorecard
  renderServModuleEvaluation(data);
}

// =============================================================================
// 4. TAB: ANALISA LAIN LAIN (PEAK HOURS, STATUS, DLL)
// =============================================================================
function renderLainTab(data) {
  const hourly = data.hourly_distribution || [];
  const statusBreakdown = data.status_breakdown || {};
  const weekday = data.weekday_distribution || [];
  const summary = data.summary || {};

  const totalTrx = Number(summary.total_trx || 0);
  const totalSukses = Number(summary.total_sukses || 0);

  // 1. Update Mini KPI Cards
  const elPeak = document.getElementById("lain-stat-peak");
  const elSubPeak = document.getElementById("lain-sub-peak");
  const elSukses = document.getElementById("lain-stat-sukses-rate");
  const elSubSukses = document.getElementById("lain-sub-sukses");
  const elGagal = document.getElementById("lain-stat-gagal-rate");
  const elSubGagal = document.getElementById("lain-sub-gagal");
  const elHari = document.getElementById("lain-stat-hari");
  const elSubHari = document.getElementById("lain-sub-hari");

  if (totalTrx === 0) {
    if (elPeak) elPeak.textContent = "Nol Data";
    if (elSubPeak) elSubPeak.textContent = "Tidak ada transaksi pada periode ini";

    if (elSukses) elSukses.textContent = "0.0%";
    if (elSubSukses) elSubSukses.textContent = "0 Transaksi Sukses";

    if (elGagal) elGagal.textContent = "0.0%";
    if (elSubGagal) elSubGagal.textContent = "0 Transaksi Gagal";

    if (elHari) elHari.textContent = "Nol Data";
    if (elSubHari) elSubHari.textContent = "Tidak ada transaksi pada periode ini";
  } else {
    // A. Peak Hours
    if (elPeak) {
      if (hourly.length > 0) {
        const sortedHours = [...hourly].sort((a, b) => (b.trx || 0) - (a.trx || 0));
        const topHour = sortedHours[0];
        if (topHour && (topHour.trx || 0) > 0) {
          const startH = parseInt(topHour.hour.split(":")[0], 10);
          const endH = (startH + 2) % 24;
          elPeak.textContent = `${String(startH).padStart(2, "0")}:00 - ${String(endH).padStart(2, "0")}:00`;
        } else {
          elPeak.textContent = "-";
        }
      } else {
        elPeak.textContent = "-";
      }
    }
    if (elSubPeak) elSubPeak.textContent = "Jam Puncak Transaksi Terpadat";

    // B. Sukses Rate
    const sukPct = statusBreakdown["Sukses"] != null ? Number(statusBreakdown["Sukses"]) : (summary.avg_sukses_pct || 0);
    if (elSukses) elSukses.textContent = `${sukPct.toFixed(1)}%`;
    if (elSubSukses) elSubSukses.textContent = `${totalSukses.toLocaleString("id-ID")} Transaksi Sukses`;

    // C. Gagal / Reject Rate
    const gagalPct = Math.max(0.0, +(100.0 - sukPct).toFixed(1));
    const totalGagal = Math.max(0, totalTrx - totalSukses);
    if (elGagal) elGagal.textContent = `${gagalPct.toFixed(1)}%`;
    if (elSubGagal) elSubGagal.textContent = `${totalGagal.toLocaleString("id-ID")} Transaksi Gagal`;

    // D. Hari Terpadat
    if (elHari) {
      if (weekday.length > 0) {
        const sortedDays = [...weekday].sort((a, b) => (b.trx || 0) - (a.trx || 0));
        if (sortedDays[0] && (sortedDays[0].trx || 0) > 0) {
          if (sortedDays.length > 1 && (sortedDays[1].trx || 0) > 0) {
            elHari.textContent = `${sortedDays[0].day} & ${sortedDays[1].day}`;
          } else {
            elHari.textContent = `${sortedDays[0].day}`;
          }
        } else {
          elHari.textContent = "-";
        }
      } else {
        elHari.textContent = "-";
      }
    }
    if (elSubHari) elSubHari.textContent = "Lonjakan Transaksi Mingguan";
  }

  // Chart L1: Pola Jam Sibuk (24 Jam)
  renderLainHourlyChart(hourly);

  // Chart L2: Breakdown Status
  renderLainStatusChart(statusBreakdown);

  // Chart L3: Pola Hari Mingguan
  renderLainWeekdayChart(weekday);
}

function renderLainHourlyChart(hourly) {
  const ctx = document.getElementById("chart-lain-hourly");
  if (!ctx) return;
  destroyChart("lainHourly");

  const labels = hourly.map(h => h.hour);
  const values = hourly.map(h => h.trx);

  chartInstances["lainHourly"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Volume per Jam",
          data: values,
          borderColor: "#0284c7",
          backgroundColor: "rgba(2, 132, 199, 0.15)",
          borderWidth: 2.5,
          pointRadius: 3,
          fill: true,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` Jam ${context.label}: ${context.parsed.y.toLocaleString("id-ID")} trx`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => Number(v).toLocaleString("id-ID") } }
      }
    }
  });
}

function renderLainStatusChart(statusBreakdown) {
  const ctx = document.getElementById("chart-lain-status");
  if (!ctx) return;
  destroyChart("lainStatus");

  const labels = Object.keys(statusBreakdown);
  const values = Object.values(statusBreakdown);
  const allZero = values.length === 0 || values.every(v => Number(v) === 0);

  if (allZero) {
    chartInstances["lainStatus"] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Nol Data"],
        datasets: [
          {
            data: [1],
            backgroundColor: ["#e2e8f0"],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { boxWidth: 12, font: { family: "inherit", size: 11.5 } } },
          tooltip: {
            callbacks: {
              label: () => " Tidak ada transaksi pada periode ini"
            }
          }
        }
      }
    });
    return;
  }

  chartInstances["lainStatus"] = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: ["#10b981", "#f59e0b", "#ef4444", "#64748b"],
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 12, font: { family: "inherit", size: 11.5 } } },
        tooltip: {
          callbacks: {
            label: context => ` ${context.label}: ${context.parsed}%`
          }
        }
      }
    }
  });
}

function renderLainWeekdayChart(weekday) {
  const ctx = document.getElementById("chart-lain-weekday");
  if (!ctx) return;
  destroyChart("lainWeekday");

  const labels = weekday.map(w => w.day);
  const values = weekday.map(w => w.trx);

  chartInstances["lainWeekday"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Volume Transaksi",
          data: values,
          backgroundColor: "#8b5cf6",
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` ${context.parsed.y.toLocaleString("id-ID")} trx`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => Number(v).toLocaleString("id-ID") } }
      }
    }
  });
}

// =============================================================================
// EVALUASI KESEHATAN MODUL & SUPPLIER SLA (TOP PERINGATAN + TABEL EVALUASI)
// =============================================================================

let currentModulesScorecard = [];
let currentModuleFilterTipe = "ALL";
let currentModuleSearchQuery = "";
let currentModuleSortKey = "trx";
let currentModuleSortDir = "desc";

const SVG_SORT_NEUTRAL = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.35;"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`;
const SVG_SORT_ASC = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #0284c7;"><path d="m18 15-6-6-6 6"/></svg>`;
const SVG_SORT_DESC = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #0284c7;"><path d="m6 9 6 6 6-6"/></svg>`;

function updateSortHeaderIcons() {
  const sortKeys = ["nama_modul", "tipe", "operator", "trx", "sukses", "gagal", "sukses_pct", "avg_speed", "status"];
  sortKeys.forEach(key => {
    const el = document.getElementById(`sort-icon-${key}`);
    if (el) {
      if (currentModuleSortKey === key) {
        el.innerHTML = currentModuleSortDir === "asc" ? SVG_SORT_ASC : SVG_SORT_DESC;
      } else {
        el.innerHTML = SVG_SORT_NEUTRAL;
      }
    }
  });

  const sortSel = document.getElementById("select-serv-module-sort");
  if (sortSel) {
    let selVal = `${currentModuleSortKey}_${currentModuleSortDir}`;
    if (currentModuleSortKey === "nama_modul") selVal = `name_${currentModuleSortDir}`;
    if (currentModuleSortKey === "avg_speed") selVal = `speed_${currentModuleSortDir}`;
    if (currentModuleSortKey === "status") selVal = `status_${currentModuleSortDir}`;
    if (Array.from(sortSel.options).some(o => o.value === selVal)) {
      sortSel.value = selVal;
    }
  }
}

function sortModuleTable(colKey) {
  if (currentModuleSortKey === colKey) {
    currentModuleSortDir = currentModuleSortDir === "desc" ? "asc" : "desc";
  } else {
    currentModuleSortKey = colKey;
    if (["nama_modul", "tipe", "operator", "status"].includes(colKey)) {
      currentModuleSortDir = "asc";
    } else {
      currentModuleSortDir = "desc";
    }
  }
  renderModuleScorecardTable();
}
window.sortModuleTable = sortModuleTable;

function onSelectModuleSort(val) {
  if (!val) return;
  if (val.startsWith("name_")) {
    currentModuleSortKey = "nama_modul";
    currentModuleSortDir = val.split("_")[1];
  } else if (val.startsWith("speed_")) {
    currentModuleSortKey = "avg_speed";
    currentModuleSortDir = val.split("_")[1];
  } else if (val.startsWith("status_")) {
    currentModuleSortKey = "status";
    currentModuleSortDir = val.split("_")[1];
  } else {
    const parts = val.split("_");
    currentModuleSortDir = parts.pop();
    currentModuleSortKey = parts.join("_");
  }
  renderModuleScorecardTable();
}
window.onSelectModuleSort = onSelectModuleSort;

function renderServModuleEvaluation(data) {
  const topFailing = data.top_failing_modules || [];
  const topSlowest = data.top_slowest_modules || [];
  currentModulesScorecard = data.modules_scorecard || [];

  // Render Top 3 Failing Modules
  renderTopFailingModules(topFailing);

  // Render Top 3 Slowest Modules
  renderTopSlowestModules(topSlowest);

  // Render Table
  renderModuleScorecardTable();
}

function renderTopFailingModules(list) {
  const container = document.getElementById("serv-top-failing-list");
  if (!container) return;

  if (!list || list.length === 0) {
    const isZero = currentModulesScorecard && currentModulesScorecard.length === 0;
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12.5px; background: rgba(0,0,0,0.02); border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: ${isZero ? 'var(--text-muted)' : '#16a34a'};"><circle cx="12" cy="12" r="10"></circle><polyline points="9 12 11 14 15 10"></polyline></svg>
        <span>${isZero ? 'Tidak ada data transaksi modul pada periode ini (Nol Data).' : 'Tidak ada modul dengan kendala kegagalan signifikan pada periode ini.'}</span>
      </div>
    `;
    return;
  }

  const medals = ["#1", "#2", "#3"];
  const rankColors = ["#ef4444", "#f97316", "#eab308"];

  const html = list.map((m, idx) => {
    const isChip = m.tipe === "CHIP";
    const tipeBadge = isChip
      ? `<span class="badge" style="background: #fdf4ff; color: #a21caf; border: 1px solid #f5d0fe; font-size: 10px; padding: 1px 6px;">CHIP</span>`
      : `<span class="badge" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 10px; padding: 1px 6px;">H2H</span>`;

    const opBadge = (m.operator && m.operator !== "-" && m.operator !== "LAINNYA")
      ? `<span class="badge" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; font-size: 10px; padding: 1px 6px; font-weight: 600;">${m.operator}</span>`
      : "";

    let statusBadge = "";
    if (m.status === "KURANG" || m.status === "GANGGUAN") {
      statusBadge = `<span class="badge" style="background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px; height:6px; border-radius:50%; background:#dc2626;"></span>KURANG</span>`;
    } else if (m.status === "CUKUP" || m.status === "WASPADA") {
      statusBadge = `<span class="badge" style="background: #fef9c3; color: #854d0e; border: 1px solid #fde047; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px; height:6px; border-radius:50%; background:#ca8a04;"></span>CUKUP</span>`;
    } else {
      statusBadge = `<span class="badge" style="background: #dcfce7; color: #166534; border: 1px solid #86efac; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px; height:6px; border-radius:50%; background:#16a34a;"></span>BAIK</span>`;
    }

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-left: 3px solid ${rankColors[idx] || '#ef4444'}; border-radius: 8px; gap: 10px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 16px; font-family: var(--font-mono); font-weight: 800; min-width: 22px;">${medals[idx] || '#' + (idx + 1)}</span>
          <div>
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <strong style="font-size: 13.5px; color: var(--text-main); font-family: var(--font-heading);">${m.nama_modul}</strong>
              ${tipeBadge}
              ${opBadge}
              ${statusBadge}
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">
              Total Trx: <span style="font-family: var(--font-mono);">${Number(m.trx || 0).toLocaleString("id-ID")}</span> • Speed: <span style="font-family: var(--font-mono);">${m.avg_speed || 0}s</span>
            </div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 13.5px; font-weight: 800; color: ${m.sukses_pct < 95 ? '#dc2626' : (m.sukses_pct < 98 ? '#ca8a04' : '#16a34a')}; font-family: var(--font-mono);">
            ${Number(m.sukses_pct || 0).toFixed(1)}% Sukses
          </div>
          <div style="font-size: 11.5px; color: #dc2626; font-family: var(--font-mono); font-weight: 600; margin-top: 2px;">
            ${Number(m.gagal || 0).toLocaleString("id-ID")} Gagal
          </div>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = html;
}

function renderTopSlowestModules(list) {
  const container = document.getElementById("serv-top-slowest-list");
  if (!container) return;

  if (!list || list.length === 0) {
    const isZero = currentModulesScorecard && currentModulesScorecard.length === 0;
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12.5px; background: rgba(0,0,0,0.02); border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: ${isZero ? 'var(--text-muted)' : '#16a34a'};"><circle cx="12" cy="12" r="10"></circle><polyline points="9 12 11 14 15 10"></polyline></svg>
        <span>${isZero ? 'Tidak ada data transaksi modul pada periode ini (Nol Data).' : 'Seluruh modul beroperasi dalam performa kecepatan optimal.'}</span>
      </div>
    `;
    return;
  }

  const medals = ["#1", "#2", "#3"];
  const rankColors = ["#f59e0b", "#fb923c", "#facc15"];

  const html = list.map((m, idx) => {
    const isChip = m.tipe === "CHIP";
    const tipeBadge = isChip
      ? `<span class="badge" style="background: #fdf4ff; color: #a21caf; border: 1px solid #f5d0fe; font-size: 10px; padding: 1px 6px;">CHIP</span>`
      : `<span class="badge" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 10px; padding: 1px 6px;">H2H</span>`;

    const opBadge = (m.operator && m.operator !== "-" && m.operator !== "LAINNYA")
      ? `<span class="badge" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; font-size: 10px; padding: 1px 6px; font-weight: 600;">${m.operator}</span>`
      : "";

    let statusBadge = "";
    if (m.status === "KURANG" || m.status === "GANGGUAN") {
      statusBadge = `<span class="badge" style="background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px; height:6px; border-radius:50%; background:#dc2626;"></span>KURANG</span>`;
    } else if (m.status === "CUKUP" || m.status === "WASPADA") {
      statusBadge = `<span class="badge" style="background: #fef9c3; color: #854d0e; border: 1px solid #fde047; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px; height:6px; border-radius:50%; background:#ca8a04;"></span>CUKUP</span>`;
    } else {
      statusBadge = `<span class="badge" style="background: #dcfce7; color: #166534; border: 1px solid #86efac; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px; height:6px; border-radius:50%; background:#16a34a;"></span>BAIK</span>`;
    }

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-left: 3px solid ${rankColors[idx] || '#f59e0b'}; border-radius: 8px; gap: 10px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 16px; font-family: var(--font-mono); font-weight: 800; min-width: 22px;">${medals[idx] || '#' + (idx + 1)}</span>
          <div>
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <strong style="font-size: 13.5px; color: var(--text-main); font-family: var(--font-heading);">${m.nama_modul}</strong>
              ${tipeBadge}
              ${opBadge}
              ${statusBadge}
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">
              Total Trx: <span style="font-family: var(--font-mono);">${Number(m.trx || 0).toLocaleString("id-ID")}</span> • Sukses: <span style="font-family: var(--font-mono); color: #16a34a;">${Number(m.sukses_pct || 0).toFixed(1)}%</span>
            </div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 13.5px; font-weight: 700; color: #b45309; font-family: var(--font-mono);">
            ${Number(m.avg_speed || 0).toFixed(1)}s
          </div>
          <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
            (${m.dur_str || "00:00"})
          </div>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = html;
}

function renderModuleScorecardTable() {
  const tbody = document.getElementById("table-serv-modules-body");
  const countBadge = document.getElementById("badge-serv-module-count");
  if (!tbody) return;

  let filtered = [...currentModulesScorecard];

  // Filter Tipe (CHIP / H2H)
  if (currentModuleFilterTipe !== "ALL") {
    filtered = filtered.filter(m => (m.tipe || "").toUpperCase() === currentModuleFilterTipe.toUpperCase());
  }

  // Filter Search Query
  if (currentModuleSearchQuery) {
    filtered = filtered.filter(m => {
      const q = currentModuleSearchQuery;
      return (m.nama_modul && m.nama_modul.toLowerCase().includes(q)) ||
        (m.modul_id && m.modul_id.toLowerCase().includes(q)) ||
        (m.operator && m.operator.toLowerCase().includes(q));
    });
  }

  if (countBadge) {
    countBadge.textContent = `${filtered.length} Modul`;
  }

  updateSortHeaderIcons();

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 28px; color: var(--text-muted); font-size: 13px;">
          Tidak ada data modul pada periode ini (Nol Data).
        </td>
      </tr>
    `;
    return;
  }

  // Sort data sesuai kolom aktif dan arah sort
  filtered.sort((a, b) => {
    const mult = currentModuleSortDir === "asc" ? 1 : -1;
    if (currentModuleSortKey === "status") {
      // Prioritas Kritis: KURANG/GANGGUAN (0) -> CUKUP/WASPADA (1) -> BAIK/PRIMA (2)
      const statusWeight = (s) => {
        const str = (s || "").toUpperCase();
        if (str.includes("KURANG") || str.includes("GANGGUAN")) return 0;
        if (str.includes("CUKUP") || str.includes("WASPADA")) return 1;
        return 2;
      };
      const wA = statusWeight(a.status);
      const wB = statusWeight(b.status);
      if (wA !== wB) return (wA - wB) * mult;
      return ((a.sukses_pct || 0) - (b.sukses_pct || 0)) * mult;
    }

    if (["trx", "sukses", "gagal", "sukses_pct", "avg_speed"].includes(currentModuleSortKey)) {
      const vA = Number(a[currentModuleSortKey] || 0);
      const vB = Number(b[currentModuleSortKey] || 0);
      if (vA !== vB) return (vA - vB) * mult;
      return (Number(b.trx || 0) - Number(a.trx || 0));
    }

    // String columns: nama_modul, tipe, operator
    const sA = String(a[currentModuleSortKey] || "").toLowerCase();
    const sB = String(b[currentModuleSortKey] || "").toLowerCase();
    if (sA !== sB) return sA.localeCompare(sB, "id-ID") * mult;
    return (Number(b.trx || 0) - Number(a.trx || 0));
  });

  const rowsHtml = filtered.map((m, idx) => {
    const isChip = m.tipe === "CHIP";
    const tipeBadge = isChip
      ? `<span class="badge" style="background: #fdf4ff; color: #a21caf; border: 1px solid #f5d0fe; font-size: 10.5px; padding: 2px 8px; font-weight: 700;">CHIP</span>`
      : `<span class="badge" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 10.5px; padding: 2px 8px; font-weight: 700;">H2H</span>`;

    const opCell = (m.operator && m.operator !== "-" && m.operator !== "LAINNYA")
      ? `<span class="badge" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; font-size: 10.5px; padding: 2px 7px; font-weight: 600;">${m.operator}</span>`
      : `<span style="color: var(--text-muted); font-size: 11px;">-</span>`;

    let statusBadge = "";
    if (m.status === "KURANG" || m.status === "GANGGUAN") {
      statusBadge = `<span class="badge" style="background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-weight: 700; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px; height:6px; border-radius:50%; background:#dc2626;"></span>KURANG</span>`;
    } else if (m.status === "CUKUP" || m.status === "WASPADA") {
      statusBadge = `<span class="badge" style="background: #fef9c3; color: #854d0e; border: 1px solid #fde047; font-weight: 700; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px; height:6px; border-radius:50%; background:#ca8a04;"></span>CUKUP</span>`;
    } else {
      statusBadge = `<span class="badge" style="background: #dcfce7; color: #166534; border: 1px solid #86efac; font-weight: 700; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><span style="width:6px; height:6px; border-radius:50%; background:#16a34a;"></span>BAIK</span>`;
    }

    const pctColor = m.sukses_pct < 95.0 ? "#dc2626" : (m.sukses_pct < 98.0 ? "#ca8a04" : "#16a34a");
    const speedColor = m.avg_speed > 30.0 ? "#dc2626" : (m.avg_speed > 15.0 ? "#ca8a04" : "var(--text-main)");
    const gagalColor = m.gagal > 0 ? "#dc2626" : "var(--text-muted)";

    return `
      <tr style="border-bottom: 1px solid var(--border); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(0,0,0,0.02)'" onmouseout="this.style.background='transparent'">
        <td style="padding: 10px 12px; text-align: center; color: var(--text-muted); font-family: var(--font-mono); font-size: 11.5px;">${idx + 1}</td>
        <td style="padding: 10px 12px;">
          <div style="font-weight: 700; color: var(--text-main); font-size: 13px;">${m.nama_modul}</div>
          ${m.modul_id && m.modul_id !== m.nama_modul ? `<div style="font-size: 10.5px; color: var(--text-muted); font-family: var(--font-mono);">${m.modul_id}</div>` : ''}
        </td>
        <td style="padding: 10px 12px; text-align: center;">${tipeBadge}</td>
        <td style="padding: 10px 12px; text-align: center;">${opCell}</td>
        <td style="padding: 10px 12px; text-align: right; font-family: var(--font-mono); font-weight: 600;">${Number(m.trx || 0).toLocaleString("id-ID")}</td>
        <td style="padding: 10px 12px; text-align: right; font-family: var(--font-mono); font-weight: 600; color: #16a34a;">${Number(m.sukses || 0).toLocaleString("id-ID")}</td>
        <td style="padding: 10px 12px; text-align: right; font-family: var(--font-mono); font-weight: 600; color: ${gagalColor};">${Number(m.gagal || 0).toLocaleString("id-ID")}</td>
        <td style="padding: 10px 12px; text-align: right; font-family: var(--font-mono); font-weight: 700; color: ${pctColor};">${Number(m.sukses_pct || 0).toFixed(1)}%</td>
        <td style="padding: 10px 12px; text-align: right; font-family: var(--font-mono); font-weight: 600; color: ${speedColor};">
          ${Number(m.avg_speed || 0).toFixed(1)}s <span style="font-size: 10.5px; color: var(--text-muted);">(${m.dur_str || '00:00'})</span>
        </td>
        <td style="padding: 10px 12px; text-align: center;">${statusBadge}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rowsHtml;
}

window.filterModuleTable = function (tipe, btn) {
  currentModuleFilterTipe = tipe;
  const container = document.getElementById("table-mod-filter-group");
  if (container) {
    container.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
  }
  if (btn) btn.classList.add("active");
  renderModuleScorecardTable();
};

window.onSearchModule = function (query) {
  currentModuleSearchQuery = (query || "").trim().toLowerCase();
  renderModuleScorecardTable();
};

// Export global function
window.loadAnalisa = loadAnalisa;
window.loadAnalisaDistribusi = loadAnalisaDistribusi;
window.loadAnalisaService = loadAnalisaService;
window.loadAnalisaSupplier = loadAnalisaSupplier;
window.loadAnalisaProfit = loadAnalisaProfit;
window.loadAnalisaLain = loadAnalisaLain;
window.switchAnalisaTab = switchAnalisaTab;
window.setPillFilter = setPillFilter;
window.setProductFilter = setProductFilter;
window.resetProductFilters = resetProductFilters;
window.updateProductFilterDropdowns = updateProductFilterDropdowns;
window.fetchAndRenderAnalisa = fetchAndRenderAnalisa;
window.renderServModuleEvaluation = renderServModuleEvaluation;
window.filterModuleTable = window.filterModuleTable;
window.onSearchModule = window.onSearchModule;
window.sortModuleTable = sortModuleTable;
window.onSelectModuleSort = onSelectModuleSort;
