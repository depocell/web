// home.js — Logika tampilan Executive Overview Dashboard

let overviewTrendChart = null;

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Number(Math.round(num)).toLocaleString("id-ID", {
    maximumFractionDigits: 0
  });
}

function formatRupiahShort(num) {
  if (!num || isNaN(num)) return "Rp 0";
  const abs = Math.abs(num);
  if (abs >= 1000000000) {
    return `Rp ${(num / 1000000000).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} M`;
  }
  if (abs >= 1000000) {
    return `Rp ${(num / 1000000).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Jt`;
  }
  return `Rp ${Number(Math.round(num)).toLocaleString("id-ID")}`;
}

function formatGrowthVal(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  const r = Math.round(num);
  const prefix = r > 0 ? "+" : "";
  return prefix + formatNumber(r);
}

function formatGrowthPct(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return "0.0%";
  const prefix = pct > 0 ? "+" : "";
  return `${prefix}${Number(pct).toFixed(1)}%`;
}

function renderKPIs(kpi) {
  if (!kpi) return;

  // 1. Digital Volume
  const dig = kpi.digital;
  if (dig) {
    const elVol = document.getElementById("kpi-digital-vol");
    const elDaily = document.getElementById("kpi-digital-daily");
    if (elVol) elVol.textContent = `${formatNumber(dig.total_curr)} trx`;
    if (elDaily) {
      const isPos = dig.daily_diff >= 0;
      const color = isPos ? "var(--positive)" : "var(--negative)";
      elDaily.innerHTML = `Daily <strong>${formatNumber(dig.daily_curr)}</strong>/hr <span style="color:${color}; font-weight:600;">(${formatGrowthPct(dig.daily_growth_pct)})</span>`;
    }

    // 2. Digital Success Rate
    const elSukses = document.getElementById("kpi-digital-sukses");
    const elAgen = document.getElementById("kpi-digital-agen");
    if (elSukses) elSukses.textContent = `${dig.sukses_rate}%`;
    if (elAgen) elAgen.textContent = `${formatNumber(dig.active_agents)} Agen Aktif Transaksi`;
  }

  // 3 & 4. Fisik Pilar
  const fis = kpi.fisik;
  if (fis && !fis.error) {
    const elQty = document.getElementById("kpi-fisik-qty");
    const elQtySub = document.getElementById("kpi-fisik-qty-sub");
    if (elQty) elQty.textContent = `${formatNumber(fis.total_qty)} Pcs`;
    if (elQtySub) {
      elQtySub.textContent = `Vcr: ${formatNumber(fis.voucher_qty)} • Perdana: ${formatNumber(fis.perdana_qty)}`;
    }

    const elOmset = document.getElementById("kpi-fisik-omset");
    const elOmsetSub = document.getElementById("kpi-fisik-omset-sub");
    if (elOmset) elOmset.textContent = formatRupiahShort(fis.total_netto);
    if (elOmsetSub) {
      const isPos = fis.growth_netto_pct >= 0;
      const col = isPos ? "var(--positive)" : "var(--negative)";
      elOmsetSub.innerHTML = `Periode ${fis.period_label} <span style="color:${col}; font-weight:600;">(${formatGrowthPct(fis.growth_netto_pct)} MoM)</span>`;
    }
  }
}

function renderHighlights(hl) {
  if (!hl) return;

  const topElName = document.getElementById("mover-top-name");
  const topElVal = document.getElementById("mover-top-val");
  if (topElName && topElVal && hl.top_growth) {
    topElName.textContent = hl.top_growth.cabang;
    topElVal.textContent = `${formatGrowthPct(hl.top_growth.growth_pct)} (${formatGrowthVal(hl.top_growth.growth_val)}/hari)`;
  }

  const btmElName = document.getElementById("mover-bottom-name");
  const btmElVal = document.getElementById("mover-bottom-val");
  if (btmElName && btmElVal && hl.bottom_growth) {
    btmElName.textContent = hl.bottom_growth.cabang;
    btmElVal.textContent = `${formatGrowthPct(hl.bottom_growth.growth_pct)} (${formatGrowthVal(hl.bottom_growth.growth_val)}/hari)`;
  }
}

function renderFisikCard(fisik) {
  if (!fisik || fisik.error) return;

  const metaEl = document.getElementById("meta-fisik");
  if (metaEl) {
    metaEl.textContent = `${fisik.period_label} • Total Omset: ${formatRupiahShort(fisik.total_netto)}`;
  }

  // Bar Proporsi
  const barVcr = document.getElementById("bar-voucher");
  const barPrd = document.getElementById("bar-perdana");
  const ratioText = document.getElementById("fisik-ratio-text");
  const legendVcr = document.getElementById("fisik-legend-voucher");
  const legendPrd = document.getElementById("fisik-legend-perdana");

  if (barVcr) barVcr.style.width = `${fisik.voucher_pct}%`;
  if (barPrd) barPrd.style.width = `${fisik.perdana_pct}%`;
  if (ratioText) ratioText.textContent = `Voucher ${fisik.voucher_pct}% vs Perdana ${fisik.perdana_pct}%`;
  if (legendVcr) legendVcr.textContent = `${formatNumber(fisik.voucher_qty)} pcs (${fisik.voucher_pct}%)`;
  if (legendPrd) legendPrd.textContent = `${formatNumber(fisik.perdana_qty)} pcs (${fisik.perdana_pct}%)`;

  // Tabel Top Depo
  const tbody = document.getElementById("tbody-fisik-depo");
  if (tbody && fisik.top_cabangs) {
    let html = "";
    fisik.top_cabangs.forEach(c => {
      html += `
        <tr>
          <td class="font-semibold">${c.cabang}</td>
          <td class="text-right">${formatNumber(c.qty)}</td>
          <td class="text-right">${formatRupiahShort(c.netto)}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html || `<tr><td colspan="3" class="loader">Tidak ada data cabang</td></tr>`;
  }
}

let lastTrendDaily = null;

function renderTrendChart(trendList) {
  const canvas = document.getElementById("chart-overview-trend");
  if (!canvas || !window.Chart) return;
  lastTrendDaily = trendList;

  if (overviewTrendChart) {
    overviewTrendChart.destroy();
    overviewTrendChart = null;
  }

  if (!trendList || trendList.length === 0) return;

  const labels = trendList.map(t => `Tgl ${t.day}`);
  const dataAstaga = trendList.map(t => t.astaga);
  const dataOkipay = trendList.map(t => t.okipay);

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const gridColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.05)";
  const textColor = isDark ? "#94a3b8" : "#64748b";
  const astagaColor = isDark ? "#6366f1" : "#4f46e5";
  const okipayColor = isDark ? "#38bdf8" : "#0284c7";

  overviewTrendChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "ASTAGA (Server)",
          data: dataAstaga,
          backgroundColor: astagaColor,
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: false,
          stack: "combined",
          maxBarThickness: 28
        },
        {
          label: "OKIPAY (Online)",
          data: dataOkipay,
          backgroundColor: okipayColor,
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: false,
          stack: "combined",
          maxBarThickness: 28
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 400,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'circle',
            font: { family: "'Inter', sans-serif", size: 11, weight: "600" },
            color: textColor,
            padding: 14
          }
        },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: isDark ? "rgba(15, 23, 42, 0.92)" : "rgba(15, 23, 42, 0.88)",
          titleFont: { family: "'Inter', sans-serif", size: 12, weight: "700" },
          bodyFont: { family: "'Inter', sans-serif", size: 11, weight: "500" },
          footerFont: { family: "'Inter', sans-serif", size: 11, weight: "700" },
          padding: { top: 8, bottom: 8, left: 12, right: 12 },
          cornerRadius: 8,
          boxPadding: 4,
          borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.2)",
          borderWidth: 1,
          callbacks: {
            label: function(ctx) {
              const val = Number(ctx.raw || 0).toLocaleString("id-ID");
              return ` ${ctx.dataset.label}: ${val} trx`;
            },
            footer: function(items) {
              let tot = 0;
              items.forEach(i => tot += Number(i.raw || 0));
              return `Total Gabungan: ${tot.toLocaleString("id-ID")} trx`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: textColor, font: { family: "'Inter', sans-serif", size: 10.5 } }
        },
        y: {
          stacked: true,
          border: { dash: [4, 4] },
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 10.5 },
            callback: v => Number(v).toLocaleString("id-ID")
          }
        }
      }
    }
  });
}

function renderTable(brandKey, data) {
  const tbody = document.getElementById(`tbody-${brandKey.toLowerCase()}`);
  const meta = document.getElementById(`meta-${brandKey.toLowerCase()}`);

  if (!tbody) return;

  if (!data) {
    tbody.innerHTML = `<tr><td colspan="5" class="loader">Data tidak tersedia</td></tr>`;
    return;
  }

  if (meta) {
    meta.textContent = `${data.curr_month} (${data.days_curr} hari) vs ${data.prev_month} (${data.days_prev} hari)`;
  }

  let html = "";
  data.rows.forEach(row => {
    const isPos = row.growth_val >= 0;
    const pillClass = isPos ? "positive" : "negative";

    html += `
      <tr>
        <td class="font-semibold">${row.cabang}</td>
        <td class="text-right">${formatNumber(row.daily_curr)}</td>
        <td class="text-right">${formatNumber(row.daily_prev)}</td>
        <td class="text-right">
          <span class="pill ${pillClass}">${formatGrowthVal(row.growth_val)}</span>
        </td>
        <td class="text-right">
          <span class="pill ${pillClass}">${formatGrowthPct(row.growth_pct)}</span>
        </td>
      </tr>
    `;
  });

  if (data.total) {
    const tot = data.total;
    const isTotPos = tot.growth_val >= 0;
    const totPillClass = isTotPos ? "positive" : "negative";

    html += `
      <tr class="total-row">
        <td>${tot.cabang}</td>
        <td class="text-right">${formatNumber(tot.daily_curr)}</td>
        <td class="text-right">${formatNumber(tot.daily_prev)}</td>
        <td class="text-right">
          <span class="pill ${totPillClass}">${formatGrowthVal(tot.growth_val)}</span>
        </td>
        <td class="text-right">
          <span class="pill ${totPillClass}">${formatGrowthPct(tot.growth_pct)}</span>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

async function loadOverview() {
  const tbodyAstaga = document.getElementById("tbody-astaga");
  const tbodyOkipay = document.getElementById("tbody-okipay");

  if (tbodyAstaga) tbodyAstaga.innerHTML = `<tr><td colspan="5" class="loader">Memuat data ASTAGA...</td></tr>`;
  if (tbodyOkipay) tbodyOkipay.innerHTML = `<tr><td colspan="5" class="loader">Memuat data OKIPAY...</td></tr>`;

  try {
    const res = await fetch("/api/overview");
    if (!res.ok) throw new Error("Gagal mengambil data dari server");
    const json = await res.json();

    if (json.ok && json.data) {
      const data = json.data;

      // 1. Render Tabel Cabang ASTAGA & OKIPAY
      if (data.brands) {
        renderTable("astaga", data.brands["ASTAGA"]);
        renderTable("okipay", data.brands["OKIPAY"]);
      }

      // 2. Render 4 Executive KPI Cards
      if (data.kpi) {
        renderKPIs(data.kpi);
        if (data.kpi.fisik) {
          renderFisikCard(data.kpi.fisik);
        }
      }

      // 3. Render Top & Bottom Highlights
      if (data.highlights) {
        renderHighlights(data.highlights);
      }

      // 4. Render Daily Trend Chart
      if (data.trend_daily) {
        renderTrendChart(data.trend_daily);
      }

      // 5. Update Timestamp
      const now = new Date();
      const updatedEl = document.getElementById("last-updated");
      if (updatedEl) {
        updatedEl.textContent = `Tahun ${data.year} • Diperbarui ${now.toLocaleTimeString("id-ID")}`;
      }
    } else {
      throw new Error(json.error || "Format respon tidak valid");
    }
  } catch (err) {
    console.error(err);
    if (tbodyAstaga) {
      tbodyAstaga.innerHTML = `<tr><td colspan="5" class="loader text-negative">Error: ${err.message}</td></tr>`;
    }
    if (tbodyOkipay) {
      tbodyOkipay.innerHTML = `<tr><td colspan="5" class="loader text-negative">Error: ${err.message}</td></tr>`;
    }
  }
}

// Export global function
window.loadOverview = loadOverview;

window.addEventListener("themechange", () => {
  if (lastTrendDaily) {
    renderTrendChart(lastTrendDaily);
  }
});
