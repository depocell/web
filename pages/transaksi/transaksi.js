// transaksi.js — Controller untuk Pivot Transaksi Digital

let pivotBrand = "ASTAGA";
let pivotSubPage = "product";
let lastPivotData = null;

function formatMoney(num) {
  if (num === null || num === undefined || isNaN(num)) return "Rp 0";
  return "Rp " + Number(num).toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatInt(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Number(num).toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function onPivotYearChange() {
  loadPivotOptions();
}

function switchPivotSubPage(sub) {
  pivotSubPage = sub || "product";
  loadPivotOptions();
}

async function loadPivotOptions() {
  try {
    const yearSel = document.getElementById("piv-filter-year");
    const yearVal = yearSel ? yearSel.value : "2026";
    const res = await fetch(`/api/pivot/options?brand=${pivotBrand}&year=${yearVal}&type=${pivotSubPage}`);
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
      if (d.years.includes(prevYear)) {
        yearSel.value = prevYear;
      }
    }

    // 1. Populate Row Dimension
    const rowSel = document.getElementById("piv-row-dim");
    if (rowSel && d.dimensions) {
      const prevRow = rowSel.value;
      rowSel.innerHTML = "";
      d.dimensions.forEach(dim => {
        const opt = document.createElement("option");
        opt.value = dim.id;
        opt.textContent = dim.label;
        rowSel.appendChild(opt);
      });
      if (prevRow && d.dimensions.some(dim => dim.id === prevRow)) {
        rowSel.value = prevRow;
      }
    }

    // 2. Populate Column Dimension
    const colSel = document.getElementById("piv-col-dim");
    if (colSel && d.column_dimensions) {
      const prevCol = colSel.value;
      colSel.innerHTML = "";
      d.column_dimensions.forEach(dim => {
        const opt = document.createElement("option");
        opt.value = dim.id;
        opt.textContent = dim.label;
        colSel.appendChild(opt);
      });
      if (prevCol && d.column_dimensions.some(dim => dim.id === prevCol)) {
        colSel.value = prevCol;
      } else {
        colSel.value = "none";
      }
    }

    // 3. Populate Metrics
    const metricSel = document.getElementById("piv-metric");
    if (metricSel && d.metrics && d.metrics.length > 0) {
      const prevMetric = metricSel.value;
      metricSel.innerHTML = "";
      d.metrics.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.label;
        metricSel.appendChild(opt);
      });
      if (prevMetric && d.metrics.some(m => m.id === prevMetric)) {
        metricSel.value = prevMetric;
      }
    }

    // 4. Populate Month Filter
    const monthSel = document.getElementById("piv-filter-month");
    const prevMonth = monthSel.value;
    monthSel.innerHTML = `<option value="ALL">Semua Bulan (2026)</option>`;
    (d.months || []).forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = `Bulan ${m}`;
      monthSel.appendChild(opt);
    });
    if (prevMonth && (prevMonth === "ALL" || (d.months && d.months.includes(prevMonth)))) {
      monthSel.value = prevMonth;
    } else if (d.months && d.months.length > 0) {
      monthSel.value = d.months[0];
    }

    // 5. Populate Status Filter
    const statusSel = document.getElementById("piv-filter-status");
    const prevStatus = statusSel.value;
    statusSel.innerHTML = `<option value="ALL">Semua Status</option>`;
    (d.statuses || []).forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      statusSel.appendChild(opt);
    });
    if (prevStatus && (prevStatus === "ALL" || (d.statuses && d.statuses.includes(prevStatus)))) {
      statusSel.value = prevStatus;
    }

    // 6. Populate Cabang Filter
    const cabangSel = document.getElementById("piv-filter-cabang");
    const prevCabang = cabangSel.value;
    cabangSel.innerHTML = `<option value="ALL">Semua Cabang</option>`;
    (d.cabangs || []).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      cabangSel.appendChild(opt);
    });
    if (prevCabang && (prevCabang === "ALL" || (d.cabangs && d.cabangs.includes(prevCabang)))) {
      cabangSel.value = prevCabang;
    }

    // 7. Populate Kategori & Operator Filters (Khusus Sub Page Product)
    const katSel = document.getElementById("piv-filter-kategori");
    if (katSel && d.kategoris) {
      const prevKat = katSel.value;
      katSel.innerHTML = `<option value="ALL">Semua Kategori</option>`;
      d.kategoris.forEach(k => {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = k;
        katSel.appendChild(opt);
      });
      if (prevKat && (prevKat === "ALL" || d.kategoris.includes(prevKat))) {
        katSel.value = prevKat;
      }
    }

    const opSel = document.getElementById("piv-filter-operator");
    if (opSel && d.operators) {
      const prevOp = opSel.value;
      opSel.innerHTML = `<option value="ALL">Semua Operator</option>`;
      d.operators.forEach(o => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        opSel.appendChild(opt);
      });
      if (prevOp && (prevOp === "ALL" || d.operators.includes(prevOp))) {
        opSel.value = prevOp;
      }
    }

    runPivot();
  } catch (err) {
    console.error("Gagal load opsi pivot:", err);
  }
}

async function runPivot() {
  const yearSel = document.getElementById("piv-filter-year");
  const yearVal = yearSel ? yearSel.value : "2026";
  const rowDim = document.getElementById("piv-row-dim").value;
  const colDim = document.getElementById("piv-col-dim").value;
  const metric = document.getElementById("piv-metric").value;
  const monthFilter = document.getElementById("piv-filter-month").value;
  const statusFilter = document.getElementById("piv-filter-status").value;
  const cabangFilter = document.getElementById("piv-filter-cabang").value;
  const limit = document.getElementById("piv-limit").value;

  const katSel = document.getElementById("piv-filter-kategori");
  const kategoriFilter = (pivotSubPage === "product" && katSel) ? katSel.value : "ALL";

  const opSel = document.getElementById("piv-filter-operator");
  const operatorFilter = (pivotSubPage === "product" && opSel) ? opSel.value : "ALL";

  const tbody = document.getElementById("piv-tbody");
  tbody.innerHTML = `<tr><td class="loader" colspan="10">Menghitung agregasi Pivot Transaksi Digital...</td></tr>`;

  try {
    const params = new URLSearchParams({
      brand: pivotBrand,
      year: yearVal,
      type: pivotSubPage,
      row: rowDim,
      col: colDim,
      metric: metric,
      month: monthFilter,
      status: statusFilter,
      cabang: cabangFilter,
      kategori: kategoriFilter,
      operator: operatorFilter,
      limit: limit
    });

    const res = await fetch(`/api/pivot/query?${params.toString()}`);
    const json = await res.json();

    if (!json.ok || !json.data) throw new Error(json.error || "Gagal menjalankan pivot");

    const data = json.data;
    lastPivotData = data;

    // Update Summary Strip if present
    if (data.summary) {
      const elTrx = document.getElementById("piv-sum-trx");
      if (elTrx) elTrx.textContent = formatInt(data.summary.total_trx);
      const elDailyTrx = document.getElementById("piv-sum-daily-trx");
      if (elDailyTrx) elDailyTrx.textContent = `Daily: ${formatInt(Math.round(data.summary.daily_trx))} / hari`;
      const elJual = document.getElementById("piv-sum-jual");
      if (elJual) elJual.textContent = formatMoney(data.summary.total_jual);
      const elDailyJual = document.getElementById("piv-sum-daily-jual");
      if (elDailyJual) elDailyJual.textContent = `Daily: ${formatMoney(data.summary.daily_jual)} / hari`;
      const elMargin = document.getElementById("piv-sum-margin");
      if (elMargin) elMargin.textContent = formatMoney(data.summary.total_margin);
      const elDailyMargin = document.getElementById("piv-sum-daily-margin");
      if (elDailyMargin) elDailyMargin.textContent = `Daily: ${formatMoney(data.summary.daily_margin)} / hari`;
      const elRate = document.getElementById("piv-sum-rate");
      if (elRate) elRate.textContent = `${data.summary.sukses_rate.toFixed(1)}%`;
      const elDays = document.getElementById("piv-sum-days");
      if (elDays) elDays.textContent = `${data.summary.active_days} Hari Aktif`;
    }

    const execEl = document.getElementById("piv-exec-time");
    if (execEl) execEl.textContent = `Selesai dalam ${data.elapsed_ms} ms`;
    const titleEl = document.getElementById("piv-table-title");
    if (titleEl) titleEl.textContent = `Tabel Hasil Pivot Transaksi Digital`;

    // Render Table
    renderPivotTable(data, metric);

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td class="loader text-negative" colspan="10">Error: ${err.message}</td></tr>`;
  }
}

function renderPivotTable(data, metric) {
  const thead = document.getElementById("piv-thead");
  const tbody = document.getElementById("piv-tbody");
  const tfoot = document.getElementById("piv-tfoot");

  const rowOption = document.getElementById("piv-row-dim").selectedOptions[0];
  const rowLabelText = rowOption ? rowOption.text : "Baris";

  if (data.is_2d) {
    // 2D Pivot Table Render
    let headHtml = `<tr><th>${rowLabelText}</th>`;
    data.columns.forEach(col => {
      headHtml += `<th class="text-right">${col}</th>`;
    });
    headHtml += `</tr>`;
    thead.innerHTML = headHtml;

    let bodyHtml = "";
    if (!data.rows || data.rows.length === 0) {
      bodyHtml = `<tr><td colspan="${data.columns.length + 1}" class="loader">Tidak ada data ditemukan untuk filter ini</td></tr>`;
    } else {
      data.rows.forEach(r => {
        bodyHtml += `<tr><td class="font-semibold">${r._row_label}</td>`;
        data.columns.forEach(col => {
          const val = r[col] || 0;
          let formatted = formatInt(val);
          if (metric.includes("jual") || metric.includes("beli") || metric.includes("margin") || metric.includes("price") || metric.includes("arpu")) {
            formatted = formatMoney(val);
          } else if (metric === "daily_trx") {
            formatted = formatInt(Math.round(val));
          } else if (metric === "sukses_pct" || metric === "margin_pct") {
            formatted = `${Number(val).toFixed(2)}%`;
          }
          bodyHtml += `<td class="text-right">${formatted}</td>`;
        });
        bodyHtml += `</tr>`;
      });
    }
    tbody.innerHTML = bodyHtml;

    if (data.total_row) {
      const tot = data.total_row;
      let footHtml = `<tr><td>TOTAL</td>`;
      data.columns.forEach(col => {
        const val = tot[col] || 0;
        let formatted = formatInt(val);
        if (metric.includes("jual") || metric.includes("beli") || metric.includes("margin") || metric.includes("price") || metric.includes("arpu")) {
          formatted = formatMoney(val);
        } else if (metric === "daily_trx") {
          formatted = formatInt(Math.round(val));
        } else if (metric === "sukses_pct" || metric === "margin_pct") {
          formatted = `${Number(val).toFixed(2)}%`;
        }
        footHtml += `<td class="text-right">${formatted}</td>`;
      });
      footHtml += `</tr>`;
      tfoot.innerHTML = footHtml;
    } else {
      tfoot.innerHTML = "";
    }

  } else {
    // 1D Breakdown Table Render
    const headHtml = `
      <tr>
        <th>${rowLabelText}</th>
        <th class="text-right">Total Trx</th>
        <th class="text-right" style="color: #2563eb;">Daily Trx</th>
        <th class="text-right" style="color: #4338ca;">Harga Dasar</th>
        <th class="text-right" style="color: #0284c7;">Net ARPU</th>
        <th class="text-right">Revenue Bersih</th>
        <th class="text-right" style="color: #16a34a;">Net Profit</th>
        <th class="text-right" style="color: #16a34a;">Margin %</th>
        <th class="text-right">% Sukses</th>
      </tr>
    `;
    thead.innerHTML = headHtml;

    let bodyHtml = "";
    if (!data.rows || data.rows.length === 0) {
      bodyHtml = `<tr><td colspan="9" class="loader">Tidak ada data ditemukan untuk filter ini</td></tr>`;
    } else {
      data.rows.forEach(r => {
        bodyHtml += `
          <tr>
            <td class="font-semibold">${r._row_label}</td>
            <td class="text-right">${formatInt(r.trx_count)}</td>
            <td class="text-right" style="color: #2563eb; font-weight: 600;">${formatInt(Math.round(r.daily_trx))}</td>
            <td class="text-right" style="color: #4338ca; font-weight: 600;">${formatMoney(r.base_price_avg)}</td>
            <td class="text-right" style="color: #0284c7; font-weight: 700;">${formatMoney(r.net_arpu)}</td>
            <td class="text-right">${formatMoney(r.base_price_sum)}</td>
            <td class="text-right" style="color: #16a34a; font-weight: 700;">${formatMoney(r.margin_sum)}</td>
            <td class="text-right" style="color: #16a34a; font-weight: 600;">${(r.margin_pct || 0).toFixed(2)}%</td>
            <td class="text-right">${(r.sukses_pct || 0).toFixed(1)}%</td>
          </tr>
        `;
      });
    }
    tbody.innerHTML = bodyHtml;

    if (data.total_row) {
      const tot = data.total_row;
      tfoot.innerHTML = `
        <tr>
          <td>TOTAL</td>
          <td class="text-right">${formatInt(tot.trx_count)}</td>
          <td class="text-right" style="color: #2563eb; font-weight: 800;">${formatInt(Math.round(tot.daily_trx))}</td>
          <td class="text-right" style="color: #4338ca; font-weight: 800;">${formatMoney(tot.base_price_avg)}</td>
          <td class="text-right" style="color: #0284c7; font-weight: 800;">${formatMoney(tot.net_arpu)}</td>
          <td class="text-right">${formatMoney(tot.base_price_sum)}</td>
          <td class="text-right" style="color: #16a34a; font-weight: 800;">${formatMoney(tot.margin_sum)}</td>
          <td class="text-right" style="color: #16a34a; font-weight: 800;">${(tot.margin_pct || 0).toFixed(2)}%</td>
          <td class="text-right">${(tot.sukses_pct || 0).toFixed(1)}%</td>
        </tr>
      `;
    } else {
      tfoot.innerHTML = "";
    }
  }
}

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

async function exportPivotExcel() {
  const table = document.getElementById("piv-result-table");
  if (!table) return;

  const rows = table.querySelectorAll("tr");
  if (!rows || rows.length <= 1) {
    alert("Tidak ada data pivot untuk diekspor.");
    return;
  }

  const brand = pivotBrand || "ASTAGA";
  const monthFilter = document.getElementById("piv-filter-month") ? document.getElementById("piv-filter-month").value : "ALL";
  const rowDim = document.getElementById("piv-row-dim") ? document.getElementById("piv-row-dim").value : "dim";
  const metric = document.getElementById("piv-metric") ? document.getElementById("piv-metric").value : "metric";
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `Pivot_Digital_${brand}_${monthFilter}_${rowDim}_${dateStr}.xlsx`;

  try {
    await ensureXlsxLoaded();

    // Bangun data sheet dari baris HTML tabel
    const sheetData = [];
    rows.forEach(tr => {
      const row = [];
      const cells = tr.querySelectorAll("th, td");
      cells.forEach(cell => {
        let text = cell.innerText.replace(/(\r\n|\n|\r)/gm, " ").trim();
        
        // Parse format angka jika sel numerik
        // Deteksi Rp ...
        if (text.startsWith("Rp")) {
          const numStr = text.replace(/Rp\s*/g, "").replace(/\./g, "").replace(/,/g, ".");
          const num = parseFloat(numStr);
          row.push(!isNaN(num) ? num : text);
        } else if (text.endsWith("%")) {
          const numStr = text.replace(/%/g, "").replace(/,/g, ".");
          const num = parseFloat(numStr);
          row.push(!isNaN(num) ? num / 100 : text);
        } else if (/^-?\d{1,3}(\.\d{3})*$/.test(text)) {
          // Format ribuan id-ID: 1.234.567
          const num = parseInt(text.replace(/\./g, ""), 10);
          row.push(!isNaN(num) ? num : text);
        } else if (/^-?\d+(\.\d+)?$/.test(text)) {
          const num = parseFloat(text);
          row.push(!isNaN(num) ? num : text);
        } else {
          row.push(text);
        }
      });
      if (row.length > 0) sheetData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Auto set column widths
    const colWidths = [];
    sheetData.forEach(row => {
      row.forEach((val, cIdx) => {
        const len = (val !== null && val !== undefined) ? String(val).length : 8;
        colWidths[cIdx] = Math.max(colWidths[cIdx] || 12, Math.min(len + 4, 45));
      });
    });
    ws['!cols'] = colWidths.map(w => ({ wch: w }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pivot Transaksi");
    XLSX.writeFile(wb, filename);

  } catch (err) {
    console.warn("Gagal mengekspor via XLSX, fallback ke CSV:", err);
    exportPivotCSV();
  }
}

async function exportPivotCSV() {
  const table = document.getElementById("piv-result-table");
  if (!table) return;

  let csv = [];
  const rows = table.querySelectorAll("tr");
  for (let i = 0; i < rows.length; i++) {
    const row = [];
    const cols = rows[i].querySelectorAll("td, th");
    for (let j = 0; j < cols.length; j++) {
      let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, "").trim();
      data = data.replace(/"/g, '""');
      row.push('"' + data + '"');
    }
    csv.push(row.join(","));
  }

  const filename = `pivot_${pivotSubPage}_${pivotBrand}_${Date.now()}.csv`;
  const rawCsv = "\uFEFF" + csv.join("\n");
  if (typeof window.saveFileSmart === "function") {
    await window.saveFileSmart(filename, rawCsv, 'text/csv;charset=utf-8;');
  } else {
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + rawCsv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

function switchPivotBrand(b) {
  pivotBrand = b;
  const btnA = document.getElementById("btn-piv-astaga");
  const btnO = document.getElementById("btn-piv-oki");

  const activeBtn = b === "ASTAGA" ? btnA : btnO;
  if (b === "ASTAGA") {
    if (btnA) btnA.classList.add("active");
    if (btnO) btnO.classList.remove("active");
  } else {
    if (btnA) btnA.classList.remove("active");
    if (btnO) btnO.classList.add("active");
  }

  if (window.triggerBrandSwitchVisual) {
    window.triggerBrandSwitchVisual(b, activeBtn, "piv-result-card");
  }

  loadPivotOptions();
}

// Global exports for shell router
window.loadTransaksi = function() {
  switchPivotSubPage("product");
};
window.switchPivotSubPage = switchPivotSubPage;
window.switchPivotBrand = switchPivotBrand;
window.runPivot = runPivot;
window.exportPivotExcel = exportPivotExcel;
window.exportPivotCSV = exportPivotCSV;
