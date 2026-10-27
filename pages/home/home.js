// home.js — Logika Tampilan Executive Overview Matrix (Zero Switcher, Zero Re-computation)

let cachedOverviewMatrix = null;

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Number(Math.round(num)).toLocaleString("id-ID");
}

function renderOverviewMatrix(data) {
  if (!data || !data.astaga || !data.okipay || !data.total) return;

  const a = data.astaga;
  const o = data.okipay;
  const t = data.total;

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
  if (rCust) rCust.textContent = `${formatNum(t.active_cust)} Member`;
  if (rCustSub) rCustSub.textContent = `${formatNum(t.retained_cust)} Toko/Member Setia (Retained)`;

  const rSla = document.getElementById("ribbon-sla");
  const rSlaSub = document.getElementById("ribbon-sla-sub");
  if (rSla) rSla.textContent = `${t.sukses_str} Sukses`;
  if (rSlaSub) rSlaSub.textContent = `Kecepatan Rata-rata ${t.speed_str} (${t.speed_status})`;

  // 3. Render Table Rows
  const tbody = document.getElementById("ov-matrix-tbody");
  if (!tbody) return;

  const html = `
    <!-- SECTION I: PERFORMA TRANSAKSI & RUN-RATE -->
    <tr class="matrix-section-row">
      <td colspan="4">I. PERFORMA TRANSAKSI &amp; RUN-RATE (MTD ${data.month_label || ''})</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span><strong>Daily Trx (Run-rate Harian)</strong>
      </td>
      <td class="col-astaga"><strong>${formatNum(a.daily_trx)}</strong> <span style="font-size:11px; color:var(--text-muted);">/hari</span></td>
      <td class="col-okipay"><strong>${formatNum(o.daily_trx)}</strong> <span style="font-size:11px; color:var(--text-muted);">/hari</span></td>
      <td class="col-total"><span style="color:var(--primary); font-size:14px;">${formatNum(t.daily_trx)}</span> <span style="font-size:11px; color:var(--text-muted);">/hari</span></td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Total Transaksi Masuk
      </td>
      <td class="col-astaga">${formatNum(a.total_trx)}</td>
      <td class="col-okipay">${formatNum(o.total_trx)}</td>
      <td class="col-total">${formatNum(t.total_trx)}</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Total Trx Sukses (Hits)
      </td>
      <td class="col-astaga">${formatNum(a.total_sukses)}</td>
      <td class="col-okipay">${formatNum(o.total_sukses)}</td>
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
      <td class="col-okipay">
        ${o.speed_str}
        <span class="pill-metric ${o.speed_status === 'Prima' ? 'pill-prima' : 'pill-waspada'}">${o.speed_status}</span>
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
      <td class="col-okipay"><strong style="color:${o.sukses_pct >= 95 ? '#059669' : '#d97706'};">${o.sukses_str}</strong></td>
      <td class="col-total"><strong>${t.sukses_str}</strong></td>
    </tr>

    <!-- SECTION II: KESEHATAN BASIS TOKO & MEMBER (AGEN) -->
    <tr class="matrix-section-row">
      <td colspan="4">II. KESEHATAN BASIS TOKO &amp; MEMBER (AGEN &amp; RESELLER)</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Toko / Member Aktif Bertransaksi
      </td>
      <td class="col-astaga"><strong>${formatNum(a.active_cust)}</strong> toko</td>
      <td class="col-okipay"><strong>${formatNum(o.active_cust)}</strong> akun</td>
      <td class="col-total"><strong>${formatNum(t.active_cust)}</strong> member</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Pelanggan Setia (Retained Toko)
      </td>
      <td class="col-astaga">${formatNum(a.retained_cust)} toko</td>
      <td class="col-okipay">${formatNum(o.retained_cust)} akun</td>
      <td class="col-total">${formatNum(t.retained_cust)} member</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Toko Baru &amp; Reaktivasi (+)
      </td>
      <td class="col-astaga"><span style="color:#059669; font-weight:600;">+${formatNum(a.new_and_reactivated)}</span> toko</td>
      <td class="col-okipay"><span style="color:#059669; font-weight:600;">+${formatNum(o.new_and_reactivated)}</span> akun</td>
      <td class="col-total"><span style="color:#059669; font-weight:700;">+${formatNum(t.new_and_reactivated)}</span> member</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Toko Berhenti / Churn (-)
      </td>
      <td class="col-astaga"><span style="color:#dc2626; font-weight:600;">-${formatNum(a.churn_cust)}</span> toko</td>
      <td class="col-okipay"><span style="color:#dc2626; font-weight:600;">-${formatNum(o.churn_cust)}</span> akun</td>
      <td class="col-total"><span style="color:#dc2626; font-weight:700;">-${formatNum(t.churn_cust)}</span> member</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Produktivitas Toko (Daily Trx / Member)
      </td>
      <td class="col-astaga"><strong>${Number(a.tpm || 0).toFixed(2)}</strong> <span style="font-size:11px; color:var(--text-muted);">trx/hari</span></td>
      <td class="col-okipay"><strong>${Number(o.tpm || 0).toFixed(2)}</strong> <span style="font-size:11px; color:var(--text-muted);">trx/hari</span></td>
      <td class="col-total"><strong>${Number(t.tpm || 0).toFixed(2)}</strong> <span style="font-size:11px; color:var(--text-muted);">trx/hari</span></td>
    </tr>

    <!-- SECTION III: SALURAN & PORSI PENJUALAN -->
    <tr class="matrix-section-row">
      <td colspan="4">III. SALURAN, PORSI PENJUALAN &amp; SUPLIER</td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Kategori Produk Terbesar
      </td>
      <td class="col-astaga"><span class="pill-metric pill-blue">${a.top_category}</span></td>
      <td class="col-okipay"><span class="pill-metric pill-blue">${o.top_category}</span></td>
      <td class="col-total"><span class="pill-metric pill-blue">${t.top_category}</span></td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Porsi Transaksi E-Wallet (Transfer Saldo)
      </td>
      <td class="col-astaga"><strong style="color:#7c3aed;">${Number(a.ewallet_pct || 0).toFixed(1)}%</strong></td>
      <td class="col-okipay"><strong style="color:#7c3aed;">${Number(o.ewallet_pct || 0).toFixed(1)}%</strong></td>
      <td class="col-total"><strong>${Number(t.ewallet_pct || 0).toFixed(1)}%</strong></td>
    </tr>
    <tr>
      <td class="col-metric">
        <span class="metric-bullet"></span>Saluran / Cabang Terbesar
      </td>
      <td class="col-astaga"><strong>${a.top_branch}</strong></td>
      <td class="col-okipay"><strong>${o.top_branch}</strong></td>
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
      <td class="col-okipay">
        <span style="color:#059669; font-weight:600;">${o.modules_prima} Prima</span> / 
        <span style="color:#d97706; font-weight:600;">${o.modules_waspada} Waspada</span>
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
        <td colspan="4" style="text-align: center; padding: 36px; color: var(--text-muted);">
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
      renderOverviewMatrix(cachedOverviewMatrix);
    } else {
      throw new Error(json.error || "Gagal memuat data matrix overview");
    }
  } catch (err) {
    console.error("[Overview Matrix Error]:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 36px; color: var(--negative);">
            Terjadi kesalahan saat memuat matrix: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

// Global exports
window.loadOverview = loadOverview;
