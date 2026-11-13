// home.js - Logika Tampilan Executive Overview Matrix (Zero Switcher, Zero Re-computation)
// 3 Pilar Bisnis: ASTAGA Reload (Retail & Fisik) | OKIPAY (Retail Online) | OKIPAY (H2H Channel) + KONSOLIDASI

let cachedOverviewMatrix = null;

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Number(Math.round(num)).toLocaleString("id-ID");
}

function renderOverviewMatrix(data) {
  if (!data || !data.astaga || !data.total) return;

  const a = data.astaga || {};
  const oRet = data.okipay_online || data.okipay || {};
  const oH2h = data.okipay_h2h || {};
  const t = data.total || {};

  // 1. Update Header Label
  const labelEl = document.getElementById("ov-month-label");
  if (labelEl) {
    labelEl.textContent = `Periode: ${data.month_label || 'Bulan Berjalan'} (Cut-off ${data.active_days || 26} Hari)`;
  }

  // 2. Update Top Ribbon Cards
  const rDaily = document.getElementById("ribbon-daily-trx");
  const rDailySub = document.getElementById("ribbon-daily-sub");
  if (rDaily) rDaily.textContent = `${formatNum(t.daily_trx)} /hari`;
  if (rDailySub) rDailySub.textContent = `Akumulasi ${formatNum(t.total_sukses)} Hits Sukses (${formatNum(t.total_trx)} Total Masuk)`;

  const rCust = document.getElementById("ribbon-active-cust");
  const rCustSub = document.getElementById("ribbon-active-sub");
  if (rCust) rCust.textContent = `${formatNum(t.active_cust)} Akun`;
  if (rCustSub) rCustSub.textContent = `${formatNum(t.retained_cust)} Akun Setia (Retained)`;

  const rSla = document.getElementById("ribbon-sla");
  const rSlaSub = document.getElementById("ribbon-sla-sub");
  if (rSla) rSla.textContent = `${t.sukses_str} Sukses`;
  if (rSlaSub) rSlaSub.textContent = `Kecepatan Rata-rata ${t.speed_str} (${t.speed_status})`;

  // 3. Render Table Rows (5 Kolom: Metric, Astaga, Okipay Retail, Okipay H2H, Total)
  const tbody = document.getElementById("ov-matrix-tbody");
  if (!tbody) return;

  const html = `
    <!-- SECTION I: PERFORMA TRANSAKSI & RUN-RATE -->
    <tr class="matrix-section-row">
      <td colspan="5">I. PERFORMA TRANSAKSI &amp; RUN-RATE (MTD ${data.month_label || ''})</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span><strong>Daily Trx (Run-rate Harian)</strong>
      </td>
      <td class="col-astaga"><strong>${formatNum(a.daily_trx)}</strong> <span style="font-size:11px; color:var(--text-muted);">/hari</span></td>
      <td class="col-okipay-ret"><strong>${formatNum(oRet.daily_trx)}</strong> <span style="font-size:11px; color:var(--text-muted);">/hari</span></td>
      <td class="col-okipay-h2h"><strong>${formatNum(oH2h.daily_trx)}</strong> <span style="font-size:11px; color:var(--text-muted);">/hari</span></td>
      <td class="col-total"><span style="color:var(--primary); font-size:14px;">${formatNum(t.daily_trx)}</span> <span style="font-size:11px; color:var(--text-muted);">/hari</span></td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Total Transaksi Masuk
      </td>
      <td class="col-astaga">${formatNum(a.total_trx)}</td>
      <td class="col-okipay-ret">${formatNum(oRet.total_trx)}</td>
      <td class="col-okipay-h2h">${formatNum(oH2h.total_trx)}</td>
      <td class="col-total">${formatNum(t.total_trx)}</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Total Trx Sukses (Hits)
      </td>
      <td class="col-astaga">${formatNum(a.total_sukses)}</td>
      <td class="col-okipay-ret">${formatNum(oRet.total_sukses)}</td>
      <td class="col-okipay-h2h">${formatNum(oH2h.total_sukses)}</td>
      <td class="col-total">${formatNum(t.total_sukses)}</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>SLA Kecepatan Layanan (Avg Speed)
      </td>
      <td class="col-astaga">
        ${a.speed_str}
        <span class="pill-metric ${a.speed_status === 'Prima' ? 'pill-prima' : 'pill-waspada'}">${a.speed_status}</span>
      </td>
      <td class="col-okipay-ret">
        ${oRet.speed_str}
        <span class="pill-metric ${oRet.speed_status === 'Prima' ? 'pill-prima' : 'pill-waspada'}">${oRet.speed_status}</span>
      </td>
      <td class="col-okipay-h2h">
        ${oH2h.speed_str}
        <span class="pill-metric ${oH2h.speed_status === 'Prima' ? 'pill-prima' : 'pill-waspada'}">${oH2h.speed_status}</span>
      </td>
      <td class="col-total">
        ${t.speed_str}
        <span class="pill-metric pill-prima">${t.speed_status}</span>
      </td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Tingkat Keberhasilan (% Sukses)
      </td>
      <td class="col-astaga"><strong style="color:#059669;">${a.sukses_str}</strong></td>
      <td class="col-okipay-ret"><strong style="color:${oRet.sukses_pct >= 95 ? '#059669' : '#d97706'};">${oRet.sukses_str}</strong></td>
      <td class="col-okipay-h2h"><strong style="color:${oH2h.sukses_pct >= 95 ? '#059669' : '#d97706'};">${oH2h.sukses_str}</strong></td>
      <td class="col-total"><strong>${t.sukses_str}</strong></td>
    </tr>

    <!-- SECTION II: KESEHATAN BASIS AKUN (#AGEN TAB RESELLER) -->
    <tr class="matrix-section-row">
      <td colspan="5">II. KESEHATAN BASIS AKUN (#AGEN TAB RESELLER)</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Akun Aktif Bertransaksi
      </td>
      <td class="col-astaga"><strong>${formatNum(a.active_cust)}</strong> akun</td>
      <td class="col-okipay-ret"><strong>${formatNum(oRet.active_cust)}</strong> akun</td>
      <td class="col-okipay-h2h"><strong>${formatNum(oH2h.active_cust)}</strong> mitra</td>
      <td class="col-total"><strong>${formatNum(t.active_cust)}</strong> akun</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Avg Daily Akun Aktif
      </td>
      <td class="col-astaga"><strong>${formatNum(a.avg_daily_mem)}</strong> <span style="font-size:11px; color:var(--text-muted);">akun/hari</span></td>
      <td class="col-okipay-ret"><strong>${formatNum(oRet.avg_daily_mem)}</strong> <span style="font-size:11px; color:var(--text-muted);">akun/hari</span></td>
      <td class="col-okipay-h2h"><strong>${formatNum(oH2h.avg_daily_mem)}</strong> <span style="font-size:11px; color:var(--text-muted);">mitra/hari</span></td>
      <td class="col-total"><strong>${formatNum(t.avg_daily_mem)}</strong> <span style="font-size:11px; color:var(--text-muted);">akun/hari</span></td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Akun Setia (Retained)
      </td>
      <td class="col-astaga">${formatNum(a.retained_cust)} akun</td>
      <td class="col-okipay-ret">${formatNum(oRet.retained_cust)} akun</td>
      <td class="col-okipay-h2h">${formatNum(oH2h.retained_cust)} mitra</td>
      <td class="col-total">${formatNum(t.retained_cust)} akun</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Akun Reaktivasi (+)
      </td>
      <td class="col-astaga"><span style="color:#059669; font-weight:600;">+${formatNum(a.reactivated_cust)}</span> akun</td>
      <td class="col-okipay-ret"><span style="color:#059669; font-weight:600;">+${formatNum(oRet.reactivated_cust)}</span> akun</td>
      <td class="col-okipay-h2h"><span style="color:#059669; font-weight:600;">+${formatNum(oH2h.reactivated_cust)}</span> mitra</td>
      <td class="col-total"><span style="color:#059669; font-weight:700;">+${formatNum(t.reactivated_cust)}</span> akun</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Akun Baru Terdaftar (+)
      </td>
      <td class="col-astaga"><span style="color:#0284c7; font-weight:600;">+${formatNum(a.new_cust)}</span> akun</td>
      <td class="col-okipay-ret"><span style="color:#0284c7; font-weight:600;">+${formatNum(oRet.new_cust)}</span> akun</td>
      <td class="col-okipay-h2h"><span style="color:#0284c7; font-weight:600;">+${formatNum(oH2h.new_cust)}</span> mitra</td>
      <td class="col-total"><span style="color:#0284c7; font-weight:700;">+${formatNum(t.new_cust)}</span> akun</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Akun Pasif / Churn (-)
      </td>
      <td class="col-astaga"><span style="color:#dc2626; font-weight:600;">-${formatNum(a.churn_cust)}</span> akun</td>
      <td class="col-okipay-ret"><span style="color:#dc2626; font-weight:600;">-${formatNum(oRet.churn_cust)}</span> akun</td>
      <td class="col-okipay-h2h"><span style="color:#dc2626; font-weight:600;">-${formatNum(oH2h.churn_cust)}</span> mitra</td>
      <td class="col-total"><span style="color:#dc2626; font-weight:700;">-${formatNum(t.churn_cust)}</span> akun</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Produktivitas Akun (Daily Trx / Akun)
      </td>
      <td class="col-astaga"><strong>${Number(a.tpm || 0).toFixed(2)}</strong> <span style="font-size:11px; color:var(--text-muted);">trx/akun/hari</span></td>
      <td class="col-okipay-ret"><strong>${Number(oRet.tpm || 0).toFixed(2)}</strong> <span style="font-size:11px; color:var(--text-muted);">trx/akun/hari</span></td>
      <td class="col-okipay-h2h"><strong>${formatNum(oH2h.tpm || 0)}</strong> <span style="font-size:11px; color:var(--text-muted);">trx/mitra/hari</span></td>
      <td class="col-total"><strong>${Number(t.tpm || 0).toFixed(2)}</strong> <span style="font-size:11px; color:var(--text-muted);">trx/akun/hari</span></td>
    </tr>

    <!-- SECTION III: SALURAN & PORSI PENJUALAN -->
    <tr class="matrix-section-row">
      <td colspan="5">III. SALURAN, PORSI PENJUALAN &amp; SUPLIER</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Kategori Produk Terbesar
      </td>
      <td class="col-astaga"><span class="pill-metric pill-blue">${a.top_category}</span></td>
      <td class="col-okipay-ret"><span class="pill-metric pill-blue">${oRet.top_category}</span></td>
      <td class="col-okipay-h2h"><span class="pill-metric pill-blue">${oH2h.top_category}</span></td>
      <td class="col-total"><span class="pill-metric pill-blue">${t.top_category}</span></td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Porsi Transaksi E-Wallet (Transfer Saldo)
      </td>
      <td class="col-astaga"><strong style="color:#7c3aed;">${Number(a.ewallet_pct || 0).toFixed(1)}%</strong></td>
      <td class="col-okipay-ret"><strong style="color:#7c3aed;">${Number(oRet.ewallet_pct || 0).toFixed(1)}%</strong></td>
      <td class="col-okipay-h2h"><strong style="color:#7c3aed;">${Number(oH2h.ewallet_pct || 0).toFixed(1)}%</strong></td>
      <td class="col-total"><strong>${Number(t.ewallet_pct || 0).toFixed(1)}%</strong></td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Saluran / Cabang Terbesar
      </td>
      <td class="col-astaga"><strong>${a.top_branch}</strong></td>
      <td class="col-okipay-ret"><strong>${oRet.top_branch}</strong></td>
      <td class="col-okipay-h2h"><strong>${oH2h.top_branch}</strong></td>
      <td class="col-total"><strong>${t.top_branch}</strong></td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Kesehatan Suplier (Gate/Modul Aktif)
      </td>
      <td class="col-astaga">
        <span style="color:#059669; font-weight:600;">${a.modules_prima} Prima</span> / 
        <span style="color:#d97706; font-weight:600;">${a.modules_waspada} Waspada</span>
      </td>
      <td class="col-okipay-ret">
        <span style="color:#059669; font-weight:600;">${oRet.modules_prima} Prima</span> / 
        <span style="color:#d97706; font-weight:600;">${oRet.modules_waspada} Waspada</span>
      </td>
      <td class="col-okipay-h2h">
        <span style="color:#059669; font-weight:600;">${oH2h.modules_prima} Prima</span> / 
        <span style="color:#d97706; font-weight:600;">${oH2h.modules_waspada} Waspada</span>
      </td>
      <td class="col-total">
        <span style="color:#059669; font-weight:700;">${t.modules_prima} Prima</span> / 
        <span style="color:#d97706; font-weight:700;">${t.modules_waspada} Waspada</span>
      </td>
    </tr>
  `;

  tbody.innerHTML = html;
}

async function loadOverview(force = false) {
  const tbody = document.getElementById("ov-matrix-tbody");

  // Pakai cache in-memory jika ada dan bukan force refresh
  if (cachedOverviewMatrix && !force) {
    renderOverviewMatrix(cachedOverviewMatrix);
    return;
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 36px; color: var(--text-muted);">
          Memuat data Executive Overview Matrix...
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch(`/api/overview?force=${force ? '1' : '0'}&t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json && json.ok && json.data) {
      cachedOverviewMatrix = json.data;
      renderOverviewMatrix(json.data);
    } else {
      throw new Error(json.error || "Format respon overview tidak valid.");
    }
  } catch (err) {
    console.error("[Overview Error]:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 24px; color: #dc2626;">
            Gagal memuat matriks overview: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

// Global Exports
window.loadOverview = loadOverview;
