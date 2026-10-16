let fisikState = {
  data: null,
  period: "ALL",
  cabang: "ALL",
  channel: "ALL",
  kategori: "ALL",
  chartView: "trend",
  activeTab: "penjualan",
  hargaData: null,
  hargaFiltered: [],
  hargaKategori: "ALL",
  hargaOperator: "ALL",
  hargaStatus: "ALL",
  hargaSearch: ""
};

function formatRupiah(val) {
  if (val === null || val === undefined) return "Rp 0";
  return "Rp " + Math.round(val).toLocaleString("id-ID");
}

function formatQty(val) {
  if (val === null || val === undefined) return "0";
  return Math.round(val).toLocaleString("id-ID");
}

async function loadFisik() {
  const container = document.getElementById("content-area");
  if (!container) return;

  const url = `/api/fisik?period=${encodeURIComponent(fisikState.period)}&cabang=${encodeURIComponent(fisikState.cabang)}&channel=${encodeURIComponent(fisikState.channel)}&kategori=${encodeURIComponent(fisikState.kategori)}`;

  try {
    const res = await fetch(url);
    const json = await res.json();

    if (!json.ok) {
      alert("Gagal memuat data produk fisik: " + (json.error || "Unknown error"));
      return;
    }

    fisikState.data = json;
    fisikState.period = json.period_code;

    renderFisikUI();

    // Deteksi query param sub-tab misal #produk?tab=harga
    const hash = window.location.hash || "";
    if (hash.includes("tab=harga")) {
      switchFisikTab("harga");
    } else {
      switchFisikTab(fisikState.activeTab || "penjualan");
    }
  } catch (err) {
    console.error("Error loading fisik data:", err);
  }
}

function renderFisikUI() {
  const data = fisikState.data;
  if (!data) return;

  // 1. Update Subtitle
  const subEl = document.getElementById("fisik-period-subtitle");
  if (subEl) {
    const desc = data.period_code === "ALL" ? `Semua Periode (${data.date_range})` : (data.date_range || data.period_code);
    subEl.innerText = `Periode Data SISCOM: ${desc} | Total ${data.raw_rows.length} Baris Produk Terfilter`;
  }

  // 2. Populate Period Dropdown
  const selPeriod = document.getElementById("fisik-select-period");
  if (selPeriod) {
    const curVal = fisikState.period || data.period_code || "ALL";
    selPeriod.innerHTML = "";

    // Opsi Semua Periode
    const optAll = document.createElement("option");
    optAll.value = "ALL";
    optAll.innerText = "Semua Periode (Jan - Okt 2026)";
    if (curVal === "ALL") optAll.selected = true;
    selPeriod.appendChild(optAll);

    (data.available_periods || []).forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.code;
      opt.innerText = p.label;
      if (p.code === curVal) opt.selected = true;
      selPeriod.appendChild(opt);
    });
    selPeriod.value = curVal;
  }

  // 3. Populate Cabang Dropdown jika belum lengkap
  const selCabang = document.getElementById("fisik-select-cabang");
  if (selCabang && selCabang.options.length <= 1) {
    (data.filters.branches || []).forEach(b => {
      if (b && b !== "UNKNOWN") {
        const opt = document.createElement("option");
        opt.value = b;
        opt.innerText = b;
        selCabang.appendChild(opt);
      }
    });
    selCabang.value = fisikState.cabang;
  }

  // 4. Populate Channel Dropdown jika belum lengkap
  const selChannel = document.getElementById("fisik-select-channel");
  if (selChannel && selChannel.options.length <= 1) {
    (data.filters.channels || []).forEach(c => {
      if (c && c !== "UNKNOWN") {
        const opt = document.createElement("option");
        opt.value = c;
        opt.innerText = c;
        selChannel.appendChild(opt);
      }
    });
    selChannel.value = fisikState.channel;
  }

  // 4b. Populate Kategori Dropdown jika belum lengkap
  const selKategori = document.getElementById("fisik-select-kategori");
  if (selKategori && selKategori.options.length <= 1) {
    (data.filters.categories || []).forEach(kat => {
      if (kat && kat !== "UNKNOWN" && kat !== "DEPOSIT") {
        const opt = document.createElement("option");
        opt.value = kat;
        // Label format yang rapi
        let label = kat;
        if (kat === "VOUCHER") label = "Voucher Fisik";
        else if (kat === "PERDANA") label = "Kartu Perdana";
        else if (kat === "HARDWARE") label = "Aksesoris / Modem";
        opt.innerText = label;
        selKategori.appendChild(opt);
      }
    });
    selKategori.value = fisikState.kategori;
  }

  // 5. Update KPI Cards (Ringkas 3 Card)
  const kpi = data.kpi || {};
  const qtyEl = document.getElementById("kpi-total-qty");
  const nettoEl = document.getElementById("kpi-total-netto");
  const salesNettoEl = document.getElementById("kpi-sales-netto");
  const salesSubEl = document.getElementById("kpi-sales-sub");

  if (qtyEl) qtyEl.innerText = formatQty(kpi.total_fisik_qty);
  if (nettoEl) nettoEl.innerText = formatRupiah(kpi.total_fisik_netto);
  if (salesNettoEl) salesNettoEl.innerText = formatRupiah(kpi.sales_netto);
  if (salesSubEl) salesSubEl.innerText = `${formatQty(kpi.sales_qty)} pcs (${kpi.sales_ratio}% porsi)`;

  // 6. Render Chart Tren Bulanan (Tanpa Filter)
  renderMonthlyTrendChart(data.monthly_trend);

  // 6b. Render Chart Penjualan Terfilter (Dinamis Sesuai Filter)
  renderFilteredChart();

  // 7. Render Tabel Channel & Sales
  renderChannelTable(data.summary.channels, kpi.total_fisik_netto);

  // 8. Render Tabel Cabang
  renderCabangTable(data.summary.branches);

  // 9. Render Tabel Operator
  renderOperatorTable(data.summary.operators);

  // 10. Render Tabel Top Products
  renderProductTable(data.summary.top_products);

  // 11. Render Raw Rows
  renderRawTable(data.raw_rows);
}

let trendChartInstance = null;

function renderMonthlyTrendChart(trendData) {
  const canvas = document.getElementById("chart-monthly-trend");
  if (!canvas || typeof Chart === "undefined") return;

  if (!trendData || trendData.length === 0) return;

  const labels = trendData.map(d => d.label);
  const totalNetto = trendData.map(d => d.total_netto);

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  const ctx = canvas.getContext("2d");

  // Gradient warna modern
  const gradTotal = ctx.createLinearGradient(0, 0, 0, 240);
  gradTotal.addColorStop(0, "rgba(2, 132, 199, 0.85)");
  gradTotal.addColorStop(1, "rgba(2, 132, 199, 0.25)");

  trendChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Total Penjualan Fisik",
          data: totalNetto,
          backgroundColor: gradTotal,
          borderColor: "#0284c7",
          borderWidth: 1.5,
          borderRadius: 8,
          maxBarThickness: 54,
          barPercentage: 0.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 13, weight: 700 },
          bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y || 0;
              const formatted = "Rp " + Math.round(val).toLocaleString("id-ID");
              return ` ${context.dataset.label}: ${formatted}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 600 }
          }
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.6)", borderDash: [4, 4] },
          ticks: {
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
            callback: function(value) {
              if (value >= 1000000) {
                return "Rp " + (value / 1000000).toFixed(0) + " Jt";
              }
              return "Rp " + value.toLocaleString("id-ID");
            }
          }
        }
      }
    }
  });
}

let filteredChartInstance = null;

function renderFilteredChart() {
  const canvas = document.getElementById("chart-filtered-sales");
  if (!canvas || typeof Chart === "undefined") return;

  const data = fisikState.data;
  if (!data) return;

  const view = fisikState.chartView || "trend";
  let labels = [];
  let values = [];
  let chartTitle = "Penjualan Netto (Rp)";

  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, "rgba(99, 102, 241, 0.85)");
  grad.addColorStop(1, "rgba(99, 102, 241, 0.2)");

  // Update tab buttons visual
  ["trend", "cabang", "channel", "operator"].forEach(v => {
    const btn = document.getElementById(`btn-chart-view-${v}`);
    if (btn) {
      if (v === view) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });

  // Update subtitle info
  const subEl = document.getElementById("chart-filtered-subtitle");
  let filterDesc = [];
  if (fisikState.period && fisikState.period !== "ALL") {
    const pObj = (data.available_periods || []).find(p => p.code === fisikState.period);
    filterDesc.push(`Bulan: ${pObj ? pObj.label : fisikState.period}`);
  } else {
    filterDesc.push("Semua Periode (Jan - Okt)");
  }
  if (fisikState.cabang !== "ALL") filterDesc.push(`Cabang: ${fisikState.cabang}`);
  if (fisikState.channel !== "ALL") filterDesc.push(`Channel: ${fisikState.channel}`);
  if (fisikState.kategori !== "ALL") filterDesc.push(`Kategori: ${fisikState.kategori}`);

  if (subEl) {
    subEl.innerText = `Filter Aktif: ${filterDesc.join(" | ")} • Metrik: Netto (Rp)`;
  }

  if (view === "trend") {
    const trend = data.filtered_monthly_trend || [];
    labels = trend.map(d => d.label);
    values = trend.map(d => d.netto);
    chartTitle = "Tren Bulanan Terfilter";
  } else if (view === "cabang") {
    const branches = (data.summary && data.summary.branches) || [];
    labels = branches.map(b => b.cabang);
    values = branches.map(b => b.netto);
    chartTitle = "Penjualan per Cabang Terfilter";
  } else if (view === "channel") {
    const channels = (data.summary && data.summary.channels) || [];
    labels = channels.map(c => c.channel);
    values = channels.map(c => c.netto);
    chartTitle = "Penjualan per Channel Terfilter";
  } else if (view === "operator") {
    const operators = (data.summary && data.summary.operators) || [];
    labels = operators.map(o => o.operator);
    values = operators.map(o => o.netto);
    chartTitle = "Penjualan per Operator Terfilter";
  }

  if (filteredChartInstance) {
    filteredChartInstance.destroy();
  }

  if (labels.length === 0 || values.length === 0) {
    labels = ["Tidak ada data"];
    values = [0];
  }

  filteredChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: chartTitle,
          data: values,
          backgroundColor: grad,
          borderColor: "#6366f1",
          borderWidth: 1.5,
          borderRadius: 8,
          maxBarThickness: 54,
          barPercentage: 0.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 13, weight: 700 },
          bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y || 0;
              const formatted = "Rp " + Math.round(val).toLocaleString("id-ID");
              return ` Netto: ${formatted}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: 600 }
          }
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.6)", borderDash: [4, 4] },
          ticks: {
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
            callback: function(value) {
              if (value >= 1000000000) {
                return "Rp " + (value / 1000000000).toFixed(1) + " M";
              }
              if (value >= 1000000) {
                return "Rp " + (value / 1000000).toFixed(0) + " Jt";
              }
              return "Rp " + value.toLocaleString("id-ID");
            }
          }
        }
      }
    }
  });
}

function switchFilteredChartView(view) {
  fisikState.chartView = view;
  renderFilteredChart();
}

function renderChannelTable(channels, totalNetto) {
  const tbody = document.getElementById("tbody-channel");
  if (!tbody) return;

  if (!channels || channels.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Tidak ada data channel.</td></tr>`;
    return;
  }

  let html = "";
  channels.forEach(c => {
    let badgeClass = "badge";
    let badgeStyle = "background: rgba(148, 163, 184, 0.2);";
    let groupLabel = "Lainnya";

    if (c.group === "SALES_LAPANGAN") {
      badgeStyle = "background: rgba(16, 185, 129, 0.2); color: #10b981; font-weight: 600;";
      groupLabel = "Sales / DSO";
    } else if (c.group === "WALK_IN") {
      badgeStyle = "background: rgba(59, 130, 246, 0.2); color: #3b82f6;";
      groupLabel = "Toko (Walk In)";
    } else if (c.group === "TRANSFER") {
      badgeStyle = "background: rgba(245, 158, 11, 0.2); color: #f59e0b;";
      groupLabel = "Transfer";
    }

    const porsi = totalNetto > 0 ? ((c.netto / totalNetto) * 100).toFixed(1) : 0;

    html += `
      <tr>
        <td style="font-weight: 600;">${c.channel}</td>
        <td><span class="${badgeClass}" style="${badgeStyle}">${groupLabel}</span></td>
        <td style="text-align: right;">${formatQty(c.items)}</td>
        <td style="text-align: right; font-weight: 600;">${formatQty(c.qty)}</td>
        <td style="text-align: right; font-weight: 600;">${formatRupiah(c.netto)}</td>
        <td style="text-align: right; color: var(--text-muted);">${porsi}%</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderCabangTable(branches) {
  const tbody = document.getElementById("tbody-cabang");
  if (!tbody) return;

  if (!branches || branches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Tidak ada data cabang.</td></tr>`;
    return;
  }

  let html = "";
  branches.forEach(b => {
    html += `
      <tr>
        <td style="font-weight: 600;">${b.cabang}</td>
        <td style="text-align: right;">${formatQty(b.qty)}</td>
        <td style="text-align: right; font-weight: 600;">${formatRupiah(b.netto)}</td>
        <td style="text-align: right; color: #10b981;">${formatQty(b.sales_qty)}</td>
        <td style="text-align: right; font-weight: 600; color: #10b981;">${formatRupiah(b.sales_netto)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderOperatorTable(operators) {
  const tbody = document.getElementById("tbody-operator");
  if (!tbody) return;

  if (!operators || operators.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Tidak ada data.</td></tr>`;
    return;
  }

  let html = "";
  operators.forEach(op => {
    html += `
      <tr>
        <td style="font-weight: 600;">${op.operator}</td>
        <td style="text-align: right; color: var(--text-muted);">${formatQty(op.items)}</td>
        <td style="text-align: right;">${formatQty(op.qty)}</td>
        <td style="text-align: right; font-weight: 600;">${formatRupiah(op.netto)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

let allTopProducts = [];

function renderProductTable(products) {
  allTopProducts = products || [];
  filterProductTable();
}

function filterProductTable() {
  const tbody = document.getElementById("tbody-product");
  const searchInput = document.getElementById("fisik-search-prod");
  const keyword = (searchInput ? searchInput.value : "").trim().toLowerCase();

  if (!tbody) return;

  let filtered = allTopProducts;
  if (keyword) {
    filtered = filtered.filter(p => p.produk.toLowerCase().includes(keyword) || p.operator.toLowerCase().includes(keyword));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Tidak ada produk yang cocok.</td></tr>`;
    return;
  }

  let html = "";
  filtered.forEach((p, idx) => {
    html += `
      <tr>
        <td style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
        <td class="wrap-cell" style="font-weight: 600;">${p.produk}</td>
        <td><span class="badge" style="background: rgba(148, 163, 184, 0.15);">${p.operator}</span></td>
        <td><span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">${p.tipe}</span></td>
        <td style="text-align: right; font-weight: 600;">${formatQty(p.qty)}</td>
        <td style="text-align: right; font-weight: 600;">${formatRupiah(p.netto)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderRawTable(rows) {
  const tbody = document.getElementById("tbody-raw");
  const countBadge = document.getElementById("raw-row-count");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    if (countBadge) countBadge.innerText = "0 Baris";
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">Tidak ada baris data.</td></tr>`;
    return;
  }

  const maxPreview = 300;
  if (countBadge) {
    countBadge.innerText = rows.length > maxPreview ? `${formatQty(rows.length)} Baris (${maxPreview} ditampilkan)` : `${formatQty(rows.length)} Baris`;
  }

  let html = "";
  const displayRows = rows.slice(0, maxPreview);
  displayRows.forEach((r, idx) => {
    const isSales = r.channel_group === "SALES_LAPANGAN";
    html += `
      <tr style="${isSales ? 'background: rgba(16, 185, 129, 0.05);' : ''}">
        <td style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
        <td style="white-space: nowrap;">${r.cabang}</td>
        <td style="white-space: nowrap; font-weight: 600; ${isSales ? 'color: #10b981;' : ''}">${r.channel}</td>
        <td class="wrap-cell" style="font-weight: 500;">${r.produk}</td>
        <td><span class="badge" style="background: rgba(148, 163, 184, 0.15);">${r.operator}</span></td>
        <td>${r.tipe}</td>
        <td style="text-align: right; font-weight: 600;">${formatQty(r.qty)}</td>
        <td style="text-align: right;">${formatRupiah(r.gross)}</td>
        <td style="text-align: right; color: var(--text-muted);">${formatRupiah(r.diskon)}</td>
        <td style="text-align: right; font-weight: 600;">${formatRupiah(r.netto)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function changeFisikFilter() {
  const selPeriod = document.getElementById("fisik-select-period");
  const selCabang = document.getElementById("fisik-select-cabang");
  const selChannel = document.getElementById("fisik-select-channel");
  const selKategori = document.getElementById("fisik-select-kategori");

  if (selPeriod) fisikState.period = selPeriod.value;
  if (selCabang) fisikState.cabang = selCabang.value;
  if (selChannel) fisikState.channel = selChannel.value;
  if (selKategori) fisikState.kategori = selKategori.value;

  loadFisik();
}

async function exportFisikExcel() {
  if (!fisikState.data || !fisikState.data.raw_rows || fisikState.data.raw_rows.length === 0) {
    alert("Tidak ada data produk fisik yang dapat diekspor.");
    return;
  }

  const pCode = fisikState.period || "All";
  const pCabang = fisikState.cabang || "ALL";
  const pChannel = fisikState.channel || "ALL";
  const pKat = fisikState.kategori || "ALL";
  const filename = `Produk_Fisik_${pCode}_Cabang_${pCabang}_Channel_${pChannel}.xlsx`;

  // Fallback CSV jika library XLSX belum termuat
  if (typeof XLSX === "undefined") {
    let csv = [];
    csv.push(["No", "Cabang", "Channel / Sales", "Nama Produk", "Operator", "Tipe Kategori", "Quantity", "Gross (Rp)", "Diskon (Rp)", "Netto (Rp)"].join(","));
    fisikState.data.raw_rows.forEach((r, idx) => {
      const row = [
        idx + 1,
        `"${(r.cabang || '').replace(/"/g, '""')}"`,
        `"${(r.channel || '').replace(/"/g, '""')}"`,
        `"${(r.produk || '').replace(/"/g, '""')}"`,
        `"${(r.operator || '').replace(/"/g, '""')}"`,
        `"${(r.tipe || '').replace(/"/g, '""')}"`,
        r.qty || 0,
        r.gross || 0,
        r.diskon || 0,
        r.netto || 0
      ];
      csv.push(row.join(","));
    });
    const blob = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename.replace(".xlsx", ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  try {
    const wb = XLSX.utils.book_new();

    // SHEET 1: DETAIL BARIS PRODUK TERFILTER
    const detailRows = [
      ["No", "Cabang / Depo", "Channel / Sales", "Nama Produk / Perincian", "Operator", "Kategori Barang", "Quantity", "Gross (Rp)", "Diskon (Rp)", "Netto (Rp)"]
    ];

    fisikState.data.raw_rows.forEach((r, idx) => {
      detailRows.push([
        idx + 1,
        r.cabang || "",
        r.channel || "",
        r.produk || "",
        r.operator || "",
        r.tipe || "",
        Number(r.qty) || 0,
        Number(r.gross) || 0,
        Number(r.diskon) || 0,
        Number(r.netto) || 0
      ]);
    });

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    wsDetail['!cols'] = [
      { wch: 6 },   // No
      { wch: 32 },  // Cabang
      { wch: 20 },  // Channel / Sales
      { wch: 36 },  // Nama Produk
      { wch: 14 },  // Operator
      { wch: 16 },  // Tipe Kategori
      { wch: 12 },  // Quantity
      { wch: 16 },  // Gross
      { wch: 14 },  // Diskon
      { wch: 18 }   // Netto
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detail Produk Terfilter");

    // SHEET 2: REKAP CHANNEL & SALES
    if (fisikState.data.summary && fisikState.data.summary.channels) {
      const channelRows = [
        ["No", "Channel / Sales", "Tipe Channel", "Cabang Terkait", "Varian Item", "Total Qty", "Total Gross (Rp)", "Total Netto (Rp)"]
      ];
      fisikState.data.summary.channels.forEach((c, idx) => {
        channelRows.push([
          idx + 1,
          c.channel,
          c.group === "SALES_LAPANGAN" ? "Sales (DSO)" : (c.group === "WALK_IN" ? "Toko (Walk In)" : c.group),
          c.cabang || "",
          c.items,
          Number(c.qty) || 0,
          Number(c.gross) || 0,
          Number(c.netto) || 0
        ]);
      });
      const wsChannel = XLSX.utils.aoa_to_sheet(channelRows);
      wsChannel['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 16 }, { wch: 35 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsChannel, "Rekap Channel & Sales");
    }

    // SHEET 3: REKAP OPERATOR
    if (fisikState.data.summary && fisikState.data.summary.operators) {
      const opRows = [
        ["No", "Operator", "Varian Item", "Total Qty", "Total Netto (Rp)"]
      ];
      fisikState.data.summary.operators.forEach((o, idx) => {
        opRows.push([
          idx + 1,
          o.operator,
          o.items,
          Number(o.qty) || 0,
          Number(o.netto) || 0
        ]);
      });
      const wsOp = XLSX.utils.aoa_to_sheet(opRows);
      wsOp['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsOp, "Rekap Operator");
    }

    // Tulis & Download File Excel
    if (typeof window.saveFileSmart === "function") {
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
      await window.saveFileSmart(filename, "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + wbout, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } else {
      XLSX.writeFile(wb, filename);
    }

  } catch (err) {
    console.error("Gagal ekspor Excel via XLSX:", err);
    alert("Terjadi kendala saat membuat file Excel: " + err.message);
  }
}

// ============================================================================
// SUB-TAB NAVIGATION & RIWAYAT HARGA JUAL (PIVOT 6 BULAN - SISCOM)
// ============================================================================

function switchFisikTab(tab) {
  fisikState.activeTab = tab;
  const btnPenjualan = document.getElementById("tab-btn-penjualan");
  const btnHarga = document.getElementById("tab-btn-harga");
  const secPenjualan = document.getElementById("fisik-tab-penjualan");
  const secHarga = document.getElementById("fisik-tab-harga");

  if (tab === "harga") {
    if (btnPenjualan) btnPenjualan.classList.remove("active");
    if (btnHarga) btnHarga.classList.add("active");
    if (secPenjualan) secPenjualan.style.display = "none";
    if (secHarga) secHarga.style.display = "flex";

    if (!fisikState.hargaData) {
      loadFisikHarga();
    }
  } else {
    if (btnPenjualan) btnPenjualan.classList.add("active");
    if (btnHarga) btnHarga.classList.remove("active");
    if (secPenjualan) secPenjualan.style.display = "flex";
    if (secHarga) secHarga.style.display = "none";
  }
}

async function loadFisikHarga(forceReload = false) {
  const tbody = document.getElementById("tbody-fisik-harga-pivot");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 24px; color: var(--text-muted);">Memuat riwayat harga produk SISCOM...</td></tr>`;
  }

  const reloadParam = forceReload ? "&reload=1" : "";
  try {
    const res = await fetch(`/api/harga/pivot?source=FISIK${reloadParam}`);
    const json = await res.json();
    if (!json.ok) {
      alert("Gagal memuat riwayat harga: " + (json.error || "Unknown error"));
      return;
    }
    fisikState.hargaData = json;
    renderFisikHargaUI();
  } catch (err) {
    console.error("Error loading fisik harga:", err);
  }
}

function renderFisikHargaUI() {
  const data = fisikState.hargaData;
  if (!data || !data.data) return;

  // 1. Dropdown Kategori
  const selKat = document.getElementById("fisik-harga-select-kategori");
  if (selKat && selKat.options.length <= 1) {
    selKat.innerHTML = `<option value="ALL">Semua Kategori</option>`;
    (data.categories || []).forEach(k => {
      if (k && k !== "UNKNOWN") {
        const opt = document.createElement("option");
        opt.value = k;
        opt.innerText = k;
        selKat.appendChild(opt);
      }
    });
    selKat.value = fisikState.hargaKategori;
  }

  // 2. Dropdown Operator
  const selOp = document.getElementById("fisik-harga-select-operator");
  if (selOp && selOp.options.length <= 1) {
    selOp.innerHTML = `<option value="ALL">Semua Operator</option>`;
    (data.operators || []).forEach(o => {
      if (o && o !== "UNKNOWN") {
        const opt = document.createElement("option");
        opt.value = o;
        opt.innerText = o;
        selOp.appendChild(opt);
      }
    });
    selOp.value = fisikState.hargaOperator;
  }

  // 3. Dynamic Month Column Headers
  const thead = document.getElementById("thead-fisik-harga-pivot");
  if (thead) {
    let monthThs = "";
    (data.months || []).forEach(m => {
      monthThs += `<th style="text-align: right; min-width: 105px;">${m}</th>`;
    });
    thead.innerHTML = `
      <tr>
        <th style="width: 40px; text-align: center;">No.</th>
        <th style="text-align: left;">Kategori</th>
        <th style="text-align: left;">Operator</th>
        <th style="text-align: left; min-width: 240px;">Nama Produk</th>
        ${monthThs}
        <th style="text-align: right; min-width: 105px;">Selisih (Rp)</th>
        <th style="text-align: center; min-width: 105px;">Status</th>
      </tr>
    `;
  }

  applyFisikHargaFilters();
}

function applyFisikHargaFilters() {
  const data = fisikState.hargaData;
  if (!data || !data.data) return;

  const selKat = document.getElementById("fisik-harga-select-kategori");
  const selOp = document.getElementById("fisik-harga-select-operator");
  const selStatus = document.getElementById("fisik-harga-select-status");
  const inpSearch = document.getElementById("fisik-harga-search");

  const filterKat = selKat ? selKat.value : "ALL";
  const filterOp = selOp ? selOp.value : "ALL";
  const filterStatus = selStatus ? selStatus.value : "ALL";
  const searchKw = (inpSearch ? inpSearch.value : "").trim().toLowerCase();

  fisikState.hargaKategori = filterKat;
  fisikState.hargaOperator = filterOp;
  fisikState.hargaStatus = filterStatus;
  fisikState.hargaSearch = searchKw;

  let rows = data.data;

  if (filterKat !== "ALL") {
    rows = rows.filter(r => r.kategori === filterKat);
  }
  if (filterOp !== "ALL") {
    rows = rows.filter(r => r.operator === filterOp);
  }
  if (filterStatus === "BERUBAH") {
    rows = rows.filter(r => r.diff !== 0);
  } else if (filterStatus === "NAIK") {
    rows = rows.filter(r => r.diff > 0);
  } else if (filterStatus === "TURUN") {
    rows = rows.filter(r => r.diff < 0);
  } else if (filterStatus === "STABIL") {
    rows = rows.filter(r => r.diff === 0);
  }

  if (searchKw) {
    rows = rows.filter(r =>
      (r.nama && r.nama.toLowerCase().includes(searchKw)) ||
      (r.operator && r.operator.toLowerCase().includes(searchKw))
    );
  }

  fisikState.hargaFiltered = rows;

  // Update Summary Cards
  const total = rows.length;
  let stabilCount = 0;
  let naikCount = 0;
  let turunCount = 0;

  rows.forEach(r => {
    if (r.diff > 0) naikCount++;
    else if (r.diff < 0) turunCount++;
    else stabilCount++;
  });

  const elTotal = document.getElementById("fisik-stat-total-prod");
  const elStabil = document.getElementById("fisik-stat-stabil-count");
  const elNaik = document.getElementById("fisik-stat-naik-count");
  const elTurun = document.getElementById("fisik-stat-turun-count");

  const elStabilSub = document.getElementById("fisik-stat-stabil-sub");
  const elNaikSub = document.getElementById("fisik-stat-naik-sub");
  const elTurunSub = document.getElementById("fisik-stat-turun-sub");

  if (elTotal) elTotal.innerText = total.toLocaleString("id-ID");
  if (elStabil) elStabil.innerText = stabilCount.toLocaleString("id-ID");
  if (elNaik) elNaik.innerText = naikCount.toLocaleString("id-ID");
  if (elTurun) elTurun.innerText = turunCount.toLocaleString("id-ID");

  if (elStabilSub) {
    const pct = total > 0 ? ((stabilCount / total) * 100).toFixed(1) : "0";
    elStabilSub.innerText = `${pct}% dari ${total} varian`;
  }
  if (elNaikSub) {
    const pct = total > 0 ? ((naikCount / total) * 100).toFixed(1) : "0";
    elNaikSub.innerText = `${pct}% dari ${total} varian`;
  }
  if (elTurunSub) {
    const pct = total > 0 ? ((turunCount / total) * 100).toFixed(1) : "0";
    elTurunSub.innerText = `${pct}% dari ${total} varian`;
  }

  const badgeCount = document.getElementById("fisik-harga-table-count");
  if (badgeCount) badgeCount.innerText = `${total.toLocaleString("id-ID")} Produk Terfilter`;

  // Render Table Rows
  const tbody = document.getElementById("tbody-fisik-harga-pivot");
  if (!tbody) return;

  const months = data.months || [];
  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${months.length + 6}" style="text-align: center; padding: 28px; color: var(--text-muted);">
          Tidak ada produk fisik yang cocok dengan kriteria filter.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  rows.forEach((r, idx) => {
    let monthTds = "";
    let prevPrice = null;

    (r.prices || []).forEach(p => {
      if (p === null || p === undefined) {
        monthTds += `<td style="text-align: right; color: var(--text-muted); font-style: italic;">-</td>`;
      } else {
        let cellClass = "";
        let indicator = "";

        if (prevPrice !== null) {
          if (p > prevPrice) {
            cellClass = "color: #ef4444; font-weight: 600;";
            indicator = `<span style="font-size: 0.68rem; margin-left: 2px;">▲</span>`;
          } else if (p < prevPrice) {
            cellClass = "color: #10b981; font-weight: 600;";
            indicator = `<span style="font-size: 0.68rem; margin-left: 2px;">▼</span>`;
          }
        }

        monthTds += `
          <td style="text-align: right; font-weight: 500; ${cellClass}">
            Rp ${Math.round(p).toLocaleString("id-ID")} ${indicator}
          </td>
        `;
        prevPrice = p;
      }
    });

    let badgeStyle = "background: rgba(100, 116, 139, 0.15); color: #64748b;";
    let diffStr = "Rp 0";
    if (r.diff > 0) {
      badgeStyle = "background: rgba(239, 68, 68, 0.15); color: #ef4444; font-weight: 600;";
      diffStr = `+Rp ${r.diff.toLocaleString("id-ID")}`;
    } else if (r.diff < 0) {
      badgeStyle = "background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 600;";
      diffStr = `-Rp ${Math.abs(r.diff).toLocaleString("id-ID")}`;
    }

    html += `
      <tr>
        <td style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
        <td><span class="badge" style="background: rgba(99, 102, 241, 0.12); color: #6366f1;">${r.kategori}</span></td>
        <td><span class="badge" style="background: rgba(148, 163, 184, 0.15);">${r.operator}</span></td>
        <td style="font-weight: 600;" class="wrap-cell">${r.nama}</td>
        ${monthTds}
        <td style="text-align: right; font-weight: 600; ${r.diff > 0 ? 'color: #ef4444;' : (r.diff < 0 ? 'color: #10b981;' : '')}">
          ${diffStr}
        </td>
        <td style="text-align: center;">
          <span class="badge" style="${badgeStyle}">${r.status}</span>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

async function exportFisikHargaExcel() {
  const rows = fisikState.hargaFiltered;
  if (!rows || rows.length === 0) {
    alert("Tidak ada data riwayat harga yang dapat diekspor.");
    return;
  }

  const months = (fisikState.hargaData && fisikState.hargaData.months) || [];
  const filename = `Riwayat_Harga_Produk_Fisik_6_Bulan.xlsx`;

  if (typeof XLSX === "undefined") {
    alert("Library XLSX sedang dimuat, silakan coba beberapa detik lagi.");
    return;
  }

  try {
    const wb = XLSX.utils.book_new();

    const headerRow = [
      "No.",
      "Kategori",
      "Operator",
      "Nama Produk",
      ...months,
      "Selisih (Rp)",
      "Status Perubahan"
    ];

    const aoaData = [headerRow];

    rows.forEach((r, idx) => {
      const rowItem = [
        idx + 1,
        r.kategori || "",
        r.operator || "",
        r.nama || "",
        ...(r.prices || []).map(p => (p !== null && p !== undefined ? Number(p) : "")),
        Number(r.diff) || 0,
        r.status || "STABIL"
      ];
      aoaData.push(rowItem);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoaData);

    const cols = [
      { wch: 6 },   // No
      { wch: 16 },  // Kategori
      { wch: 14 },  // Operator
      { wch: 40 },  // Nama
    ];
    months.forEach(() => cols.push({ wch: 16 })); // 6 Bulan
    cols.push({ wch: 15 }); // Selisih
    cols.push({ wch: 18 }); // Status

    ws["!cols"] = cols;

    XLSX.utils.book_append_sheet(wb, ws, "Riwayat Harga 6 Bulan");

    if (typeof window.saveFileSmart === "function") {
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
      await window.saveFileSmart(
        filename,
        "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + wbout,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    } else {
      XLSX.writeFile(wb, filename);
    }
  } catch (err) {
    console.error("Gagal ekspor Excel:", err);
    alert("Terjadi kendala saat mengekspor Excel: " + err.message);
  }
}

// Global exports untuk router
window.loadFisik = loadFisik;
window.changeFisikFilter = changeFisikFilter;
window.exportFisikExcel = exportFisikExcel;
window.switchFilteredChartView = switchFilteredChartView;
window.filterProductTable = filterProductTable;
window.switchFisikTab = switchFisikTab;
window.loadFisikHarga = loadFisikHarga;
window.applyFisikHargaFilters = applyFisikHargaFilters;
window.exportFisikHargaExcel = exportFisikHargaExcel;

