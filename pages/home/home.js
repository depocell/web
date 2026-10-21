// home.js — Logika Tampilan Overview (Unified Strip ala Analisa Revenue)

let cachedOverviewData = null;
let activeOverviewBrand = "ASTAGA";

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Number(Math.round(num)).toLocaleString("id-ID");
}

function renderBrandCardBlock(brandKey, bData, showHeader = false) {
  if (!bData) return "";

  const brandTagHtml = showHeader ? `
    <div class="overview-section-header">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="overview-brand-badge" style="background: ${brandKey === 'ASTAGA' ? 'rgba(37, 99, 235, 0.12)' : 'rgba(220, 38, 38, 0.12)'}; color: ${brandKey === 'ASTAGA' ? '#2563eb' : '#dc2626'};">
          ${bData.brand_title || brandKey}
        </span>
        <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">
          ${bData.brand_tag || ''}
        </span>
      </div>
    </div>
  ` : "";

  return `
    <div style="margin-bottom: ${showHeader ? '20px' : '0'};">
      ${brandTagHtml}
      <div class="unified-strip-container">
        <!-- Col 1: Daily Transaksi -->
        <div class="unified-strip-col">
          <div class="strip-label color-blue">
            <span class="strip-dot strip-dot-blue"></span>
            DAILY TRANSAKSI
          </div>
          <div class="strip-val strip-val-blue color-blue">${formatNumber(bData.daily_trx)}</div>
          <div class="strip-sub">Total Sebulan (${formatNumber(bData.total_trx)} Total)</div>
        </div>

        <!-- Col 2: Rata-rata Customer Aktif -->
        <div class="unified-strip-col">
          <div class="strip-label color-green">
            <span class="strip-dot strip-dot-green"></span>
            RATA-RATA CUSTOMER AKTIF
          </div>
          <div class="strip-val strip-val-green color-green">${formatNumber(bData.avg_cust)}</div>
          <div class="strip-sub">Customer Aktif / Hari</div>
        </div>

        <!-- Col 3: Rata-rata Daily Trx / Member -->
        <div class="unified-strip-col">
          <div class="strip-label color-purple">
            <span class="strip-dot strip-dot-purple"></span>
            RATA-RATA DAILY TRX / MEMBER
          </div>
          <div class="strip-val strip-val-purple color-purple">${Number(bData.avg_tpm || 0).toFixed(2)}</div>
          <div class="strip-sub">Daily Trx / Member (Trx/Hari)</div>
        </div>

        <!-- Col 4: Top Cabang / Channel -->
        <div class="unified-strip-col">
          <div class="strip-label color-orange">
            <span class="strip-dot strip-dot-orange"></span>
            TOP CABANG / CHANNEL
          </div>
          <div class="strip-val strip-val-orange color-orange">${bData.top_branch || "-"}</div>
          <div class="strip-sub">Porsi Transaksi Tertinggi</div>
        </div>
      </div>
    </div>
  `;
}

function renderOverviewView() {
  const container = document.getElementById("overview-content");
  if (!container || !cachedOverviewData || !cachedOverviewData.brands) return;

  const brands = cachedOverviewData.brands;
  let html = "";

  if (activeOverviewBrand === "BOTH") {
    html += renderBrandCardBlock("ASTAGA", brands["ASTAGA"], true);
    html += renderBrandCardBlock("OKIPAY", brands["OKIPAY"], true);
  } else {
    const bData = brands[activeOverviewBrand];
    html = renderBrandCardBlock(activeOverviewBrand, bData, false);
  }

  container.innerHTML = html;
}

function switchOverviewBrand(brand) {
  activeOverviewBrand = brand;

  // Update status aktif switcher button
  const btns = document.querySelectorAll(".unified-brand-btn");
  btns.forEach(b => {
    if (b.getAttribute("data-brand") === brand) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });

  renderOverviewView();
}

async function loadOverview() {
  const container = document.getElementById("overview-content");
  if (container) {
    container.innerHTML = `
      <div class="card" style="padding: 24px; text-align: center; color: var(--text-muted);">
        Memuat data summary analisa distribusi...
      </div>
    `;
  }

  try {
    let json = null;

    // 1. Prioritaskan API live /api/overview agar selalu real-time dengan data transaksi terbaru
    try {
      const resApi = await fetch(`/api/overview?t=${Date.now()}`);
      if (resApi.ok) {
        const apiJson = await resApi.json();
        if (apiJson && apiJson.ok && apiJson.data && apiJson.data.brands && apiJson.data.brands.ASTAGA && apiJson.data.brands.ASTAGA.daily_trx) {
          json = apiJson;
        }
      }
    } catch (e) {
      console.warn("[Overview] Gagal fetch live API, mencoba fallback static snapshot:", e);
    }

    // 2. Fallback baca snapshot static jika API server offline / belum merespons
    if (!json || !json.data || !json.data.brands || !json.data.brands.ASTAGA || !json.data.brands.ASTAGA.daily_trx) {
      try {
        const resStatic = await fetch(`./pages/home/overview_data.json?t=${Date.now()}`);
        if (resStatic.ok) {
          const staticJson = await resStatic.json();
          if (staticJson && staticJson.data && staticJson.data.brands) {
            json = staticJson;
          }
        }
      } catch (_) {}
    }

    if (json && json.ok && json.data) {
      cachedOverviewData = json.data;

      // Update subtitle label
      const subEl = document.getElementById("overview-subtitle");
      if (subEl && json.data.month_label) {
        subEl.textContent = `Ringkasan Analisa Distribusi • ${json.data.month_label}`;
      }

      renderOverviewView();
    } else {
      throw new Error("Gagal memuat ringkasan data overview");
    }
  } catch (err) {
    console.error("Overview error:", err);
    if (container) {
      container.innerHTML = `
        <div class="card" style="padding: 24px; text-align: center; color: var(--negative);">
          Terjadi kesalahan saat memuat data: ${err.message}
        </div>
      `;
    }
  }
}

// Global exports
window.loadOverview = loadOverview;
window.switchOverviewBrand = switchOverviewBrand;

window.addEventListener("themechange", () => {
  renderOverviewView();
});
