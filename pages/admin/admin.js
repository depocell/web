// pages/admin/admin.js — Script Menu Utama Admin Data & Master Hub

// ─── Global State ────────────────────────────────────────────────────────────
let activeAdminTab = "ingestion";
let adminActiveBrand = "ASTAGA";
let activeJobId = null;
let pollTimer = null;
let pivotTabLoaded = false;
let systemTabLoaded = false;

// ─── Global Brand Switcher ────────────────────────────────────────────────────
function updateAdminGlobalBrandUI(brand) {
  const btnA = document.getElementById("admin-global-brand-astaga");
  const btnO = document.getElementById("admin-global-brand-okipay");
  const badge = document.getElementById("admin-global-brand-badge");
  const ribbon = document.getElementById("admin-global-brand-ribbon");

  if (brand === "ASTAGA") {
    if (btnA) btnA.classList.add("active");
    if (btnO) btnO.classList.remove("active");
    if (badge) {
      badge.textContent = "ASTAGA";
      badge.style.background = "#eff6ff";
      badge.style.color = "#2563eb";
      badge.style.borderColor = "#bfdbfe";
    }
    if (ribbon) ribbon.style.borderLeftColor = "#2563eb";
  } else {
    if (btnA) btnA.classList.remove("active");
    if (btnO) btnO.classList.add("active");
    if (badge) {
      badge.textContent = "OKIPAY";
      badge.style.background = "#fef2f2";
      badge.style.color = "#dc2626";
      badge.style.borderColor = "#fecaca";
    }
    if (ribbon) ribbon.style.borderLeftColor = "#dc2626";
  }
}

function switchAdminGlobalBrand(brand) {
  adminActiveBrand = brand;
  updateAdminGlobalBrandUI(brand);

  const activeBtn = brand === "ASTAGA" 
    ? document.getElementById("admin-global-brand-astaga") 
    : document.getElementById("admin-global-brand-okipay");

  if (window.triggerBrandSwitchVisual) {
    const targetId = activeAdminTab === "master" ? "view-admin-master" : (activeAdminTab === "products" ? "view-admin-products" : (activeAdminTab === "financial" ? "view-admin-financial" : "view-admin-pivot"));
    window.triggerBrandSwitchVisual(brand, activeBtn, targetId);
  }

  // Sinkronkan ke modul aktif
  masterState.brand = brand;
  productState.brand = brand;
  setStreamBrand(brand, false);
  updateStreamUrls();

  if (activeAdminTab === "financial") {
    if (typeof onAdminFinancialBrandChanged === "function") {
      onAdminFinancialBrandChanged(brand);
    }
  } else if (activeAdminTab === "master") {
    masterState.page = 1;
    masterState.cabang = "ALL";
    masterState.sco = "ALL";
    masterState.type = "ALL";
    masterState.search = "";
    masterState.optionsLoaded = false;
    const sInput = document.getElementById("master-search-input");
    if (sInput) sInput.value = "";
    loadMasterAgents();
  } else if (activeAdminTab === "products") {
    productState.page = 1;
    productState.kategori = "ALL";
    productState.operator = "ALL";
    productState.paket = "ALL";
    productState.search = "";
    productState.optionsLoaded = false;
    const sInput = document.getElementById("product-search-input");
    if (sInput) sInput.value = "";
    loadMasterProducts();
  } else if (activeAdminTab === "pivot") {
    if (typeof window.switchPivotBrand === "function") {
      window.switchPivotBrand(brand);
    }
  }
}

let masterState = {
  brand: "ASTAGA",
  cabang: "ALL",
  sco: "ALL",
  type: "ALL",
  search: "",
  page: 1,
  pageSize: 25,
  totalPages: 1,
  totalCount: 0,
  optionsLoaded: false
};

let productState = {
  brand: "ASTAGA",
  kategori: "ALL",
  operator: "ALL",
  paket: "ALL",
  search: "",
  page: 1,
  pageSize: 25,
  totalPages: 1,
  totalCount: 0,
  optionsLoaded: false,
  rawOptions: null
};

// ─── Entry Point ─────────────────────────────────────────────────────────────
function loadAdmin() {
  if (typeof setStreamBrand === "function") {
    setStreamBrand(adminActiveBrand || "ASTAGA", false);
  }
  updateStreamUrls();
  const hash = window.location.hash || "";
  if (hash.includes("tab=users")) {
    switchAdminTab("users");
  } else if (hash.includes("tab=financial")) {
    switchAdminTab("financial");
  } else if (hash.includes("tab=pivot")) {
    switchAdminTab("pivot");
  } else if (hash.includes("tab=system")) {
    switchAdminTab("system");
  } else if (hash.includes("tab=products")) {
    switchAdminTab("products");
  } else if (hash.includes("tab=master")) {
    switchAdminTab("master");
  } else if (hash.includes("tab=ingestion")) {
    switchAdminTab("ingestion");
  } else {
    switchAdminTab(activeAdminTab);
  }
}

// ─── Tab Switcher ────────────────────────────────────────────────────────────
async function switchAdminTab(tabName) {
  activeAdminTab = tabName;
  try {
    history.replaceState(null, null, "#admin?tab=" + tabName);
  } catch (e) {}

  const viewIngestion = document.getElementById("view-admin-ingestion");
  const viewMaster = document.getElementById("view-admin-master");
  const viewProducts = document.getElementById("view-admin-products");
  const viewPivot = document.getElementById("view-admin-pivot");
  const viewSystem = document.getElementById("view-admin-system");
  const viewFinancial = document.getElementById("view-admin-financial");
  const viewUsers = document.getElementById("view-admin-users");
  const viewTickets = document.getElementById("view-admin-tickets");

  const btnIngestion = document.getElementById("tab-btn-ingestion");
  const btnMaster = document.getElementById("tab-btn-master");
  const btnProducts = document.getElementById("tab-btn-products");
  const btnPivot = document.getElementById("tab-btn-pivot");
  const btnSystem = document.getElementById("tab-btn-system");
  const btnFinancial = document.getElementById("tab-btn-financial");
  const btnUsers = document.getElementById("tab-btn-users");
  const btnTickets = document.getElementById("tab-btn-tickets");

  // Kontrol Tampilan Global Brand Ribbon (Hanya untuk Tab Financial, Pivot, Master, Products)
  const ribbon = document.getElementById("admin-global-brand-ribbon");
  if (ribbon) {
    if (tabName === "financial" || tabName === "pivot" || tabName === "master" || tabName === "products") {
      ribbon.style.display = "flex";
      updateAdminGlobalBrandUI(adminActiveBrand);
    } else {
      ribbon.style.display = "none";
    }
  }

  // Reset all views
  if (viewIngestion) viewIngestion.style.display = "none";
  if (viewMaster) viewMaster.style.display = "none";
  if (viewProducts) viewProducts.style.display = "none";
  if (viewPivot) viewPivot.style.display = "none";
  if (viewSystem) viewSystem.style.display = "none";
  if (viewFinancial) viewFinancial.style.display = "none";
  if (viewUsers) viewUsers.style.display = "none";
  if (viewTickets) viewTickets.style.display = "none";

  if (btnIngestion) btnIngestion.classList.remove("active");
  if (btnMaster) btnMaster.classList.remove("active");
  if (btnProducts) btnProducts.classList.remove("active");
  if (btnPivot) btnPivot.classList.remove("active");
  if (btnSystem) btnSystem.classList.remove("active");
  if (btnFinancial) btnFinancial.classList.remove("active");
  if (btnUsers) btnUsers.classList.remove("active");
  if (btnTickets) btnTickets.classList.remove("active");

  if (tabName === "tickets") {
    if (viewTickets) viewTickets.style.display = "flex";
    if (btnTickets) btnTickets.classList.add("active");
    await loadAdminTickets();
  } else if (tabName === "users") {
    if (viewUsers) viewUsers.style.display = "flex";
    if (btnUsers) btnUsers.classList.add("active");
    await loadAdminUsers();
  } else if (tabName === "financial") {
    if (viewFinancial) viewFinancial.style.display = "flex";
    if (btnFinancial) btnFinancial.classList.add("active");
    await loadAdminFinancial();
  } else if (tabName === "ingestion") {
    if (viewIngestion) viewIngestion.style.display = "flex";
    if (btnIngestion) btnIngestion.classList.add("active");
    loadAdminStatus();
  } else if (tabName === "pivot") {
    if (viewPivot) viewPivot.style.display = "flex";
    if (btnPivot) btnPivot.classList.add("active");
    await loadAdminPivot();
  } else if (tabName === "products") {
    if (viewProducts) viewProducts.style.display = "flex";
    if (btnProducts) btnProducts.classList.add("active");
    productState.brand = adminActiveBrand;
    loadMasterProducts();
  } else if (tabName === "system") {
    if (viewSystem) viewSystem.style.display = "flex";
    if (btnSystem) btnSystem.classList.add("active");
    await loadAdminSystem();
  } else {
    // default: 'master'
    if (viewMaster) viewMaster.style.display = "flex";
    if (btnMaster) btnMaster.classList.add("active");
    masterState.brand = adminActiveBrand;
    loadMasterAgents();
  }
}

// ─── Dynamic Loaders for Sub-Modules (Financial, Pivot & System) ─────────────
async function loadAdminFinancial() {
  if (typeof initAdminFinancial === "function") {
    await initAdminFinancial();
    return;
  }
  try {
    await loadScriptDynamic("/pages/admin/admin_financial.js?t=" + Date.now());
    if (typeof initAdminFinancial === "function") {
      await initAdminFinancial();
    }
  } catch (err) {
    console.error("Gagal memuat admin_financial.js:", err);
  }
}
async function loadAdminPivot() {
  const container = document.getElementById("view-admin-pivot");
  if (!container) return;

  if (!pivotTabLoaded || !container.innerHTML.trim()) {
    container.innerHTML = `<div class="loader" style="padding: 40px; text-align: center; color: var(--text-muted);">Memuat modul Pivot Transaksi...</div>`;
    try {
      const res = await fetch("/pages/transaksi/index.html?t=" + Date.now());
      if (!res.ok) throw new Error("Gagal mengambil template pivot");
      const html = await res.text();
      container.innerHTML = html;

      if (typeof window.loadTransaksi !== "function") {
        await loadScriptDynamic("/pages/transaksi/transaksi.js?t=" + Date.now());
      }
      pivotTabLoaded = true;

      // Sembunyikan tombol brand lokal di pivot agar seragam dengan ribbon atas
      const localPill = document.getElementById("btn-piv-astaga");
      if (localPill && localPill.parentElement) {
        localPill.parentElement.style.display = "none";
      }

      if (typeof window.loadTransaksi === "function") {
        window.loadTransaksi();
      }
      if (typeof window.switchPivotBrand === "function") {
        window.switchPivotBrand(adminActiveBrand);
      }
    } catch (err) {
      container.innerHTML = `<div class="card-box" style="padding: 20px; color: #dc2626;">Terjadi kesalahan memuat Pivot: ${err.message}</div>`;
    }
  } else {
    // Sembunyikan tombol brand lokal di pivot jika muncul kembali
    const localPill = document.getElementById("btn-piv-astaga");
    if (localPill && localPill.parentElement) {
      localPill.parentElement.style.display = "none";
    }

    if (typeof window.switchPivotBrand === "function") {
      window.switchPivotBrand(adminActiveBrand);
    }
    if (typeof window.loadTransaksi === "function") {
      window.loadTransaksi();
    }
  }
}

async function loadAdminSystem() {
  const container = document.getElementById("view-admin-system");
  if (!container) return;

  if (!systemTabLoaded || !container.innerHTML.trim()) {
    container.innerHTML = `<div class="loader" style="padding: 40px; text-align: center; color: var(--text-muted);">Memuat modul Status Freshness Sistem...</div>`;
    try {
      const res = await fetch("/pages/settings/index.html?t=" + Date.now());
      if (!res.ok) throw new Error("Gagal mengambil template settings");
      const html = await res.text();
      container.innerHTML = html;

      if (typeof window.loadSettings !== "function") {
        await loadScriptDynamic("/pages/settings/settings.js?t=" + Date.now());
      }
      systemTabLoaded = true;
      if (typeof window.loadSettings === "function") {
        window.loadSettings();
      }
    } catch (err) {
      container.innerHTML = `<div class="card-box" style="padding: 20px; color: #dc2626;">Terjadi kesalahan memuat Status Sistem: ${err.message}</div>`;
    }
  } else {
    if (typeof window.loadSettings === "function") {
      window.loadSettings();
    }
  }
}

function loadScriptDynamic(url) {
  return new Promise((resolve, reject) => {
    const baseSrc = url.split("?")[0];
    const existing = Array.from(document.querySelectorAll("script")).find(s => s.src && s.src.includes(baseSrc));
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.body.appendChild(script);
  });
}


// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: INGESTION & CONDITIONAL UPSERT
// ═════════════════════════════════════════════════════════════════════════════

async function loadAdminStatus(isManualRefresh = false) {
  const container = document.getElementById("admin-cards-container");
  if (!container) return;

  if (isManualRefresh) {
    container.style.opacity = "0.6";
  }

  try {
    const res = await fetch("/api/admin/status?year=2026&t=" + Date.now());
    const json = await res.json();

    if (!json.ok) {
      container.innerHTML = `
        <div class="card-box" style="padding: 24px; color: #dc2626; text-align: center;">
          Gagal memuat status admin: ${json.error || "Unknown error"}
        </div>
      `;
      return;
    }

    renderAdminDashboard(json.data);
  } catch (err) {
    container.innerHTML = `
      <div class="card-box" style="padding: 24px; color: #dc2626; text-align: center;">
        Terjadi kesalahan koneksi server: ${err.message}
      </div>
    `;
  } finally {
    container.style.opacity = "1";
  }
}

function formatAdminDate(dtStr) {
  if (!dtStr || dtStr === "-") return "-";
  try {
    const parts = dtStr.split(" ");
    const ymd = parts[0].split("-");
    const time = parts[1] ? parts[1].split(".")[0] : "";
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const mIdx = parseInt(ymd[1], 10) - 1;
    const mName = months[mIdx] || ymd[1];
    return `${ymd[2]} ${mName} ${ymd[0]}, ${time} WIB`;
  } catch (e) {
    return dtStr;
  }
}

function renderAdminDashboard(data) {
  const container = document.getElementById("admin-cards-container");
  if (!container) return;

  const brands = ["ASTAGA", "OKIPAY"];
  let html = "";

  brands.forEach(brand => {
    const brandData = data[brand];
    const wm = brandData ? brandData.watermark : null;
    const inc = brandData ? brandData.incoming : null;

    const brandColor = brand === "ASTAGA" ? "#2563eb" : "#0891b2";
    const brandBg = brand === "ASTAGA" ? "rgba(37, 99, 235, 0.08)" : "rgba(8, 145, 178, 0.08)";

    const hasTsv = inc && inc.found && inc.files && inc.files.length > 0;
    const tsv = hasTsv ? inc.files[0] : null;

    html += `
      <div class="card-box" style="padding: 0; overflow: hidden; display: flex; flex-direction: column;">
        
        <!-- CARD HEADER -->
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--surface-border); display: flex; align-items: center; justify-content: space-between; background: var(--surface-card);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="badge" style="background: ${brandBg}; color: ${brandColor}; font-weight: 800; font-size: 13px; padding: 4px 10px;">
              ${brand}
            </span>
            <span style="font-size: 13px; font-weight: 600; color: var(--text-main);">
              Transaksi 2026
            </span>
          </div>

          <div>
            ${hasTsv 
              ? `<span class="badge" style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; font-weight: 600;">
                  ● TSV Baru Terdeteksi
                 </span>`
              : `<span class="badge" style="background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; font-weight: 500;">
                  Menunggu File Baru
                 </span>`
            }
          </div>
        </div>

        <!-- CARD BODY -->
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 18px; flex: 1;">
          
          <!-- 1. WATERMARK STATUS (EXCEL SAAT INI) -->
          <div style="background: var(--surface-bg); border: 1px solid var(--surface-border); border-radius: 8px; padding: 14px 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                Posisi Raw Data Terakhir (Excel)
              </span>
              <span class="font-mono" style="font-size: 11.5px; color: var(--text-muted);">
                ${wm ? wm.file : '-'}
              </span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
              <div>
                <div style="font-size: 11px; color: var(--text-muted);">Cut-Off Transaksi:</div>
                <div style="font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-top: 2px;">
                  ${wm && wm.max_date ? formatAdminDate(wm.max_date) : '-'}
                </div>
              </div>
              <div>
                <div style="font-size: 11px; color: var(--text-muted);">Total Baris &amp; TrxID:</div>
                <div class="font-mono" style="font-size: 13px; font-weight: 700; color: var(--text-main); margin-top: 2px;">
                  ${wm && wm.total_rows ? wm.total_rows.toLocaleString() : '0'} baris
                  <span style="font-size: 11px; font-weight: 400; color: var(--text-muted); display: block;">
                    ID: #${wm && wm.last_trx_id ? wm.last_trx_id : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. RADAR TSV INCOMING -->
          <div style="background: ${hasTsv ? 'rgba(22, 163, 74, 0.03)' : 'var(--surface-card)'}; border: 1px solid ${hasTsv ? 'rgba(22, 163, 74, 0.3)' : 'var(--surface-border)'}; border-radius: 8px; padding: 14px 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-size: 12px; font-weight: 700; color: ${hasTsv ? '#16a34a' : 'var(--text-muted)'}; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"></path>
                  <path d="M12 6v6l4 2"></path>
                </svg>
                Radar File TSV OtomaX
              </span>
              ${hasTsv 
                ? `<span class="badge" style="background: #16a34a; color: #fff; font-weight: 700; font-size: 11px;">READY</span>`
                : `<span class="badge" style="background: #f1f5f9; color: #94a3b8; font-size: 11px;">EMPTY</span>`
              }
            </div>

            ${hasTsv ? `
              <div style="font-size: 13px; line-height: 1.5;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px dashed var(--surface-border);">
                  <strong style="color: var(--text-main); font-size: 13px;">${tsv.filename}</strong>
                  <span class="font-mono" style="font-size: 11.5px; color: var(--text-muted);">${tsv.size_mb} MB</span>
                </div>

                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px;">
                  <div>
                    <div style="font-size: 11px; color: var(--text-muted);">Periode di TSV:</div>
                    <div style="font-size: 12px; font-weight: 600; color: var(--text-main);">
                      ${tsv.min_date ? tsv.min_date.substring(0, 10) : ''} s/d ${tsv.max_date ? tsv.max_date.substring(0, 10) : ''}
                    </div>
                  </div>
                  <div>
                    <div style="font-size: 11px; color: var(--text-muted);">Rentang TrxID:</div>
                    <div class="font-mono" style="font-size: 12px; font-weight: 600; color: var(--text-main);">
                      #${tsv.min_trx_id} → #${tsv.max_trx_id}
                    </div>
                  </div>
                </div>

                <!-- FILTER BREAKDOWN PILLS -->
                <div style="margin-top: 12px; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 6px; font-size: 11.5px;">
                  <div style="font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">Simulasi Conditional Filter:</div>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    <span class="badge" style="background: #f1f5f9; color: #475569;">
                      Mentah: <strong>${tsv.total_rows.toLocaleString()}</strong>
                    </span>
                    <span class="badge" style="background: #fee2e2; color: #b91c1c;">
                      Jual 0: -${tsv.breakdown.zero_jual.toLocaleString()}
                    </span>
                    ${brand === "ASTAGA" ? `
                      <span class="badge" style="background: #fee2e2; color: #b91c1c;">
                        AR00037: -${tsv.breakdown.ar00037.toLocaleString()}
                      </span>
                    ` : `
                      <span class="badge" style="background: #fee2e2; color: #b91c1c;">
                        Jual 1: -${(tsv.breakdown.one_jual || 0).toLocaleString()}
                      </span>
                    `}
                    <span class="badge" style="background: #fee2e2; color: #b91c1c;">
                      Status Invalid: -${tsv.breakdown.bad_status.toLocaleString()}
                    </span>
                    <span class="badge" style="background: #dcfce7; color: #15803d; font-weight: 700; margin-left: auto; display: inline-flex; align-items: center; gap: 4px;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      Siap Upsert: ${tsv.clean_rows.toLocaleString()} baris
                    </span>
                  </div>
                </div>
              </div>
            ` : `
              <div style="font-size: 12.5px; color: var(--text-muted); padding: 8px 0;">
                Tidak ada file <code>.tsv</code> di <code>C:\\RAW DATA\\${brand}\\2026\\</code>.<br>
                Simpan hasil export OtomaX ke folder tersebut, lalu klik <strong>Pindai Radar TSV</strong>.
              </div>
            `}
          </div>

          <!-- 3. ACTION BUTTON -->
          <div style="margin-top: auto;">
            ${hasTsv ? `
              <button type="button" 
                      onclick="triggerUpsert('${brand}')" 
                      class="btn-primary" 
                      style="width: 100%; padding: 10px 16px; font-size: 13.5px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 8px; cursor: pointer;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Jalankan Conditional Upsert (${brand})
              </button>
            ` : `
              <button type="button" 
                      disabled 
                      style="width: 100%; padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 8px; background: #e2e8f0; color: #94a3b8; border: none; cursor: not-allowed;">
                File TSV Belum Siap
              </button>
            `}
          </div>

        </div>

      </div>
    `;
  });

  container.innerHTML = html;

  if (data && data.unmapped) {
    renderAdminUnmappedAudit(data.unmapped);
  }
}

function renderAdminUnmappedAudit(unmappedData) {
  const section = document.getElementById("admin-unmapped-audit-section");
  const totalBadge = document.getElementById("admin-unmapped-total-badge");
  if (!section) return;

  if (!unmappedData) {
    section.style.display = "none";
    return;
  }

  let totalMissing = 0;

  ["astaga", "okipay"].forEach(brandLower => {
    const brandKey = brandLower.toUpperCase();
    const data = unmappedData[brandKey] || { resellers: [], products: [] };
    const rCount = data.resellers_count || (data.resellers ? data.resellers.length : 0);
    const pCount = data.products_count || (data.products ? data.products.length : 0);
    const brandTotal = rCount + pCount;
    totalMissing += brandTotal;

    const brandBadge = document.getElementById(`${brandLower}-admin-unmapped-badge`);
    const brandList = document.getElementById(`${brandLower}-admin-unmapped-list`);

    if (brandBadge) {
      brandBadge.textContent = `${brandTotal} item baru`;
      brandBadge.style.background = brandTotal > 0 ? "#fef3c7" : "#dcfce7";
      brandBadge.style.color = brandTotal > 0 ? "#b45309" : "#15803d";
      brandBadge.style.border = brandTotal > 0 ? "1px solid #fde68a" : "1px solid #bbf7d0";
    }

    if (brandList) {
      if (brandTotal === 0) {
        brandList.innerHTML = `<div style="color: #16a34a; padding: 6px 0; font-weight: 500; display: flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Semua kode reseller &amp; produk hasil Ingestion sudah terdaftar di Master.</div>`;
      } else {
        let html = "";

        if (rCount > 0) {
          html += `<div style="margin-bottom: 12px;">
            <div style="font-weight: 700; color: #b45309; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              <span>Reseller Belum Ada di Master Customer (${rCount}):</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">`;

          data.resellers.forEach(item => {
            const namaToko = item.name ? ` — ${escapeHtml(item.name)}` : "";
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 6px; gap: 8px;">
                <div style="min-width: 0; flex: 1;">
                  <div style="font-family: var(--font-mono); font-weight: 700; font-size: 12.5px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${item.code}<span style="font-family: var(--font-sans); font-weight: 500; color: var(--text-muted); font-size: 11.5px;">${namaToko}</span>
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 1px;">
                    ${item.trx_count} transaksi terdeteksi di 2026
                  </div>
                </div>
                <button type="button" onclick="openAddAgentFromAudit('${brandKey}', '${item.code}', '${escapeHtml(item.name || '')}')"
                  style="padding: 4px 10px; background: #2563eb; color: #ffffff; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0; box-shadow: 0 1px 2px rgba(37,99,235,0.2);">
                  + Tambah Agen
                </button>
              </div>`;
          });
          html += `</div></div>`;
        }

        if (pCount > 0) {
          html += `<div>
            <div style="font-weight: 700; color: #b45309; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              <span>Produk SKU Belum Ada di Master Produk (${pCount}):</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">`;

          data.products.forEach(item => {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 6px; gap: 8px;">
                <div style="min-width: 0; flex: 1;">
                  <div style="font-family: var(--font-mono); font-weight: 700; font-size: 12.5px; color: var(--text-main);">
                    ${item.code}
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 1px;">
                    ${item.trx_count} transaksi terdeteksi di 2026
                  </div>
                </div>
                <button type="button" onclick="openAddProductFromAudit('${brandKey}', '${item.code}')"
                  style="padding: 4px 10px; background: #0891b2; color: #ffffff; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0; box-shadow: 0 1px 2px rgba(8,145,178,0.2);">
                  + Tambah Produk
                </button>
              </div>`;
          });
          html += `</div></div>`;
        }

        brandList.innerHTML = html;
      }
    }
  });

  if (totalBadge) {
    totalBadge.textContent = `${totalMissing} Item Belum Ada di Master`;
    totalBadge.style.background = totalMissing > 0 ? "#fde68a" : "#bbf7d0";
    totalBadge.style.color = totalMissing > 0 ? "#92400e" : "#166534";
  }

  // Tampilkan box jika ada item yang missing
  section.style.display = totalMissing > 0 ? "block" : "none";
}

function toggleAdminUnmappedAudit() {
  const content = document.getElementById("admin-unmapped-dropdown-content");
  const icon = document.getElementById("admin-unmapped-toggle-icon");
  if (!content) return;
  const isHidden = content.style.display === "none";
  content.style.display = isHidden ? "block" : "none";
  if (icon) {
    icon.textContent = isHidden ? "▲ Tutup Detail" : "▼ Buka Detail";
  }
}

function openAddAgentFromAudit(brand, code, name) {
  // Pindah tab ke Master Agen & Reseller
  switchAdminTab("master");
  // Set brand yang sesuai
  if (typeof selectMasterBrand === "function") {
    selectMasterBrand(brand);
  }
  // Buka modal tambah agen
  setTimeout(() => {
    openAddAgentModal(code);
    if (name) {
      const namaEl = document.getElementById("edit-agent-nama");
      if (namaEl) namaEl.value = name;
    }
  }, 200);
}

function openAddProductFromAudit(brand, code) {
  // Pindah tab ke Master Produk
  switchAdminTab("products");
  // Set brand yang sesuai
  if (typeof selectProductBrand === "function") {
    selectProductBrand(brand);
  }
  // Buka modal tambah produk
  setTimeout(() => {
    openAddProductModal(code);
  }, 200);
}

async function triggerUpsert(brand) {
  const confirmMsg = `Yakin ingin menjalankan proses Conditional Upsert untuk ${brand}?\n\n- File Excel akan di-backup otomatis (.bak)\n- Transaksi baru akan ditambahkan ke tabel GROSS\n- Cache Parquet & RAM akan langsung diperbarui\n- File TSV akan otomatis dihapus setelah selesai.`;
  if (!confirm(confirmMsg)) {
    return;
  }

  const consoleBox = document.getElementById("admin-console-box");
  const consoleTitle = document.getElementById("console-title");
  const consoleTerminal = document.getElementById("console-terminal");
  const progressBar = document.getElementById("console-progress-bar");
  const percentText = document.getElementById("console-percent");

  if (consoleBox) {
    consoleBox.style.display = "block";
    consoleTitle.textContent = `Memproses Upsert Pipeline: ${brand}...`;
    consoleTerminal.innerHTML = `<div style="color: #38bdf8;">[INIT] Mengirim perintah eksekusi ke backend engine...</div>`;
    progressBar.style.width = "5%";
    percentText.textContent = "5%";
    consoleBox.scrollIntoView({ behavior: 'smooth' });
  }

  try {
    const res = await fetch("/api/admin/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand: brand,
        delete_tsv: true,
        year: "2026"
      })
    });

    const json = await res.json();
    if (!json.ok) {
      alert("Gagal memulai job upsert: " + (json.error || "Unknown error"));
      return;
    }

    activeJobId = json.job_id;
    startPollingJob(activeJobId, brand);

  } catch (err) {
    alert("Koneksi gagal: " + err.message);
  }
}

function startPollingJob(jobId, brand) {
  if (pollTimer) clearInterval(pollTimer);

  const consoleTitle = document.getElementById("console-title");
  const consoleTerminal = document.getElementById("console-terminal");
  const progressBar = document.getElementById("console-progress-bar");
  const percentText = document.getElementById("console-percent");
  const spinner = document.getElementById("console-spinner");

  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/admin/job-status?job_id=${jobId}&t=${Date.now()}`);
      const json = await res.json();

      if (!json.ok || !json.data) return;

      const job = json.data;
      const progress = job.progress || 0;
      const status = job.status || "running";

      progressBar.style.width = progress + "%";
      percentText.textContent = progress + "%";

      if (job.logs && job.logs.length > 0) {
        consoleTerminal.innerHTML = job.logs.map(l => {
          let col = "#e2e8f0";
          if (l.includes("CRITICAL") || l.includes("Error")) col = "#f87171";
          else if (l.includes("selesai") || l.includes("berhasil") || l.includes("Sukses")) col = "#4ade80";
          else if (l.includes("Mendeteksi") || l.includes("Memulai")) col = "#38bdf8";
          return `<div style="color: ${col};">${escapeHtml(l)}</div>`;
        }).join("");
        consoleTerminal.scrollTop = consoleTerminal.scrollHeight;
      }

      if (status === "done") {
        clearInterval(pollTimer);
        pollTimer = null;
        if (spinner) spinner.style.background = "#22c55e";
        consoleTitle.innerHTML = `<span style="color: #22c55e; display: inline-flex; align-items: center; gap: 6px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Pipeline ${brand} Selesai Sukses!</span>`;
        
        // Refresh status cards
        setTimeout(() => {
          loadAdminStatus(true);
        }, 1500);

      } else if (status === "error") {
        clearInterval(pollTimer);
        pollTimer = null;
        if (spinner) spinner.style.background = "#ef4444";
        consoleTitle.innerHTML = `<span style="color: #ef4444; display: inline-flex; align-items: center; gap: 6px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Pipeline ${brand} Gagal!</span>`;
      }

    } catch (e) {
      console.error("Polling error:", e);
    }
  }, 1000);
}


// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: MASTER AGEN & RESELLER MLM HIERARCHY
// ═════════════════════════════════════════════════════════════════════════════

let currentBrandCabangs = [];
let currentBrandScos = [];
let currentBrandDsos = [];

function selectMasterBrand(brand) {
  switchAdminGlobalBrand(brand);
}

async function loadMasterAgents() {
  const tbody = document.getElementById("master-agents-tbody");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="padding: 30px; text-align: center; color: var(--text-muted);">
        Mengambil data master agen (${masterState.brand})...
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams({
      brand: masterState.brand,
      cabang: masterState.cabang,
      sco: masterState.sco,
      type: masterState.type,
      search: masterState.search,
      page: masterState.page,
      page_size: masterState.pageSize,
      t: Date.now()
    });

    const res = await fetch(`/api/admin/agents?${params.toString()}`);
    const json = await res.json();

    if (!json.ok || !json.data) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 30px; text-align: center; color: #dc2626;">
            Gagal memuat agen: ${json.error || "Unknown error"}
          </td>
        </tr>
      `;
      return;
    }

    const result = json.data;
    const options = json.options || {};

    // 1. Update KPI Cards
    if (options.stats) {
      const elTotA = document.getElementById("kpi-total-agents");
      const elTotR = document.getElementById("kpi-total-resellers");
      const elSalS = document.getElementById("kpi-sales-sco") || document.getElementById("kpi-mapped-sco");
      const elNonS = document.getElementById("kpi-non-sco");
      const elOnlS = document.getElementById("kpi-online-sco");
      const elUnmS = document.getElementById("kpi-unmapped-sco");
      const elUnmSub = document.getElementById("kpi-unmapped-sco-sub");

      if (elTotA) elTotA.textContent = (options.stats.total_agents || 0).toLocaleString("id-ID");
      if (elTotR) elTotR.textContent = (options.stats.total_resellers || 0).toLocaleString("id-ID");
      if (elSalS) elSalS.textContent = (options.stats.sales_sco !== undefined ? options.stats.sales_sco : (options.stats.mapped_sco || 0)).toLocaleString("id-ID");
      if (elNonS) elNonS.textContent = (options.stats.non_sco || 0).toLocaleString("id-ID");
      if (elOnlS) elOnlS.textContent = (options.stats.online_sco || 0).toLocaleString("id-ID");
      if (elUnmS) {
        const unmappedCount = options.stats.unmapped_sco || 0;
        elUnmS.textContent = unmappedCount.toLocaleString("id-ID");
        if (unmappedCount > 0) {
          elUnmS.style.color = "#dc2626";
          if (elUnmSub) elUnmSub.textContent = "Perlu pemetaan cabang/SCO";
        } else {
          elUnmS.style.color = "#16a34a";
          if (elUnmSub) elUnmSub.textContent = "Semua agen terpetakan";
        }
      }
    }

    // 2. Populate Dropdowns if needed
    if (options.cabangs) currentBrandCabangs = options.cabangs;
    if (options.scos) currentBrandScos = options.scos;
    if (options.dsos) currentBrandDsos = options.dsos;

    if (!masterState.optionsLoaded && options.cabangs) {
      populateFilterOptions(options);
      masterState.optionsLoaded = true;
    }

    // 3. Render Table Rows
    masterState.totalPages = result.total_pages || 1;
    masterState.totalCount = result.total_count || 0;
    renderAgentsTable(result.rows);

    // 4. Update Pagination Controls
    updatePaginationUI();

    // 5. Update Radar Reseller Mingguan
    checkResellerRadar();

  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 30px; text-align: center; color: #dc2626;">
          Terjadi kesalahan koneksi server: ${err.message}
        </td>
      </tr>
    `;
  }
}

function populateFilterOptions(options) {
  const selCabang = document.getElementById("master-filter-cabang");
  const selSco = document.getElementById("master-filter-sco");
  const selType = document.getElementById("master-filter-type");

  if (selCabang) {
    let optHtml = `<option value="ALL">Semua Cabang (${options.cabangs.length})</option>`;
    options.cabangs.forEach(c => {
      optHtml += `<option value="${c}">${c}</option>`;
    });
    selCabang.innerHTML = optHtml;
    selCabang.value = masterState.cabang;
  }

  if (selSco) {
    let optHtml = `
      <option value="ALL">Semua SCO / Sales</option>
      <option value="NON SCO">Cabang (NON SCO - Omset Langsung)</option>
      <option value="ONLINE">Cabang ONLINE (Mandiri)</option>
      <option value="SALES_ONLY">Hanya Tim Sales Lapangan (PIC)</option>
      <option value="UNMAPPED">Belum Dipetakan (UNMAPPED)</option>
    `;
    options.scos.forEach(s => {
      if (s !== "NON SCO" && s !== "ONLINE" && s !== "BELUM DIPETAKAN" && s !== "UNMAPPED") {
        optHtml += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
      }
    });
    selSco.innerHTML = optHtml;
    selSco.value = masterState.sco;
  }

  if (selType) {
    let optHtml = `<option value="ALL">Semua Tipe (${options.types.length})</option>`;
    options.types.forEach(t => {
      optHtml += `<option value="${t}">${t}</option>`;
    });
    selType.innerHTML = optHtml;
    selType.value = masterState.type;
  }
}

function renderAgentsTable(rows) {
  const tbody = document.getElementById("master-agents-tbody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 40px; text-align: center; color: var(--text-muted);">
          Tidak ditemukan agen dengan filter yang dipilih.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  rows.forEach(r => {
    const scoVal = (r.sco || "").trim();
    const scoUpper = scoVal.toUpperCase();
    let scoBadgeHtml = "";

    if (!scoVal || scoUpper === "BELUM DIPETAKAN" || scoUpper === "UNMAPPED" || scoUpper === "-") {
      scoBadgeHtml = `<span class="badge" style="background: #fefce8; color: #ca8a04; border: 1px solid #fef08a; font-weight: 700; font-size: 11px;">BELUM DIPETAKAN</span>`;
    } else if (scoUpper === "NON SCO") {
      scoBadgeHtml = `<span class="badge" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; font-weight: 700; font-size: 11px;">NON SCO (CABANG)</span>`;
    } else if (scoUpper === "ONLINE") {
      scoBadgeHtml = `<span class="badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-weight: 700; font-size: 11px;">ONLINE</span>`;
    } else {
      scoBadgeHtml = `<span class="badge badge-sco">${escapeHtml(scoVal)}</span>`;
    }

    html += `
      <tr style="border-bottom: 1px solid var(--surface-border); transition: background 0.15s ease;">
        
        <!-- KOLOM 1: AGEN (ID & NAMA) -->
        <td style="padding: 12px 16px;">
          <div style="font-family: var(--font-mono); font-weight: 700; color: var(--primary); font-size: 13px;">
            ${r.agen_id}
          </div>
          <div style="font-size: 12.5px; font-weight: 500; color: var(--text-main); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;" title="${escapeHtml(r.nama_agen)}">
            ${escapeHtml(r.nama_agen)}
          </div>
        </td>

        <!-- KOLOM 2: CABANG & TIPE -->
        <td style="padding: 12px 14px;">
          <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
            <span class="badge badge-cabang">
              ${r.cabang}
            </span>
            <span class="badge" style="${(r.type === 'Limit') ? 'background: rgba(239, 68, 68, 0.1); color: #dc2626; border: 1px solid #fca5a5;' : ((r.type === 'Non Limit' || r.type === 'No Limit') ? 'background: rgba(245, 158, 11, 0.1); color: #d97706; border: 1px solid #fde68a;' : 'background: rgba(16, 185, 129, 0.1); color: #059669; border: 1px solid #a7f3d0;')}">
              ${(r.type === 'No Limit') ? 'Non Limit' : (r.type || 'Prima')}
            </span>
          </div>
          ${(r.type === 'Limit' || Math.abs(r.limit_saldo || 0) > 0) ? `
            <div style="font-size: 11px; font-weight: 700; color: #dc2626; margin-top: 3px; font-family: var(--font-mono);">
              Limit: Rp ${Math.abs(r.limit_saldo || 0).toLocaleString('id-ID')}
            </div>
          ` : ''}
        </td>

        <!-- KOLOM 3: SALES TEAM (SCO & DSO) -->
        <td style="padding: 12px 14px;">
          ${scoBadgeHtml}
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 3px;">
            DSO: ${r.dso || '-'}
          </div>
        </td>

        <!-- KOLOM 4: JADWAL & LOKASI -->
        <td style="padding: 12px 14px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-main);">
            ${r.jadwal || '-'}
          </div>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;" title="${escapeHtml(r.location)}">
            ${escapeHtml(r.location) || '-'}
          </div>
        </td>

        <!-- KOLOM 5: DOWNLINE COUNT (POHON MLM) -->
        <td style="padding: 12px 14px; text-align: center;">
          <button type="button" onclick="showDownlineModal('${r.agen_id}', '${escapeHtml(r.nama_agen)}')" class="btn-badge-downlines" title="Lihat daftar pohon reseller downline di bawah agen ini" style="display:inline-flex; align-items:center; gap:5px; justify-content:center;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            ${r.downlines_count.toLocaleString()} Toko
          </button>
        </td>

        <!-- KOLOM 6: AKSI -->
        <td style="padding: 12px 16px; text-align: center;">
          <button type="button" onclick="openEditAgentModal('${r.agen_id}')" class="btn-sm-edit" style="display:inline-flex; align-items:center; gap:5px; justify-content:center;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Edit
          </button>
        </td>

      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function updatePaginationUI() {
  const infoEl = document.getElementById("master-pagination-info");
  const curEl = document.getElementById("master-page-current");
  const btnPrev = document.getElementById("master-btn-prev");
  const btnNext = document.getElementById("master-btn-next");

  const start = masterState.totalCount === 0 ? 0 : (masterState.page - 1) * masterState.pageSize + 1;
  const end = Math.min(masterState.page * masterState.pageSize, masterState.totalCount);

  if (infoEl) {
    infoEl.textContent = `Menampilkan ${start} - ${end} dari ${masterState.totalCount.toLocaleString()} agen`;
  }
  if (curEl) {
    curEl.textContent = `Hal ${masterState.page} / ${masterState.totalPages}`;
  }
  if (btnPrev) {
    btnPrev.disabled = masterState.page <= 1;
  }
  if (btnNext) {
    btnNext.disabled = masterState.page >= masterState.totalPages;
  }
}

function goToMasterPage(direction) {
  const target = masterState.page + direction;
  if (target >= 1 && target <= masterState.totalPages) {
    masterState.page = target;
    loadMasterAgents();
  }
}

function changeMasterPageSize() {
  const sel = document.getElementById("master-page-size");
  if (sel) {
    masterState.pageSize = parseInt(sel.value, 10);
    masterState.page = 1;
    loadMasterAgents();
  }
}

function executeMasterFilter() {
  const sInput = document.getElementById("master-search-input");
  const selCab = document.getElementById("master-filter-cabang");
  const selSco = document.getElementById("master-filter-sco");
  const selTyp = document.getElementById("master-filter-type");

  masterState.search = sInput ? sInput.value.trim() : "";
  masterState.cabang = selCab ? selCab.value : "ALL";
  masterState.sco = selSco ? selSco.value : "ALL";
  masterState.type = selTyp ? selTyp.value : "ALL";
  masterState.page = 1;

  loadMasterAgents();
}

function resetMasterFilter() {
  const sInput = document.getElementById("master-search-input");
  const selCab = document.getElementById("master-filter-cabang");
  const selSco = document.getElementById("master-filter-sco");
  const selTyp = document.getElementById("master-filter-type");

  if (sInput) sInput.value = "";
  if (selCab) selCab.value = "ALL";
  if (selSco) selSco.value = "ALL";
  if (selTyp) selTyp.value = "ALL";

  masterState.search = "";
  masterState.cabang = "ALL";
  masterState.sco = "ALL";
  masterState.type = "ALL";
  masterState.page = 1;

  loadMasterAgents();
}

function exportMasterExcel() {
  const brand = masterState.brand;
  const url = `/api/admin/agents/export?brand=${brand}`;
  if (typeof window.downloadUrlSmart === "function") {
    window.downloadUrlSmart(url, `Master_Agents_${brand}.xlsx`);
  } else {
    window.location.href = url;
  }
}

async function checkResellerRadar() {
  try {
    const res = await fetch("/api/admin/reseller/status?t=" + Date.now());
    const json = await res.json();
    if (json.ok && json.data) {
      const b = masterState.brand;
      const bData = json.data[b];
      const container = document.getElementById("reseller-radar-container");
      const iconWrap = document.getElementById("reseller-radar-icon-wrap");
      const descEl = document.getElementById("reseller-radar-desc");
      const badgeEl = document.getElementById("reseller-radar-badge");
      const syncBtn = document.getElementById("reseller-radar-sync-btn");
      const resyncBtn = document.getElementById("reseller-radar-resync-btn");
      const toolbarSyncBtn = document.getElementById("btn-sync-reseller-tsv");

      if (bData && bData.tsv) {
        if (bData.needs_sync) {
          // ── KONDISI 1: RADAR MENYALA (TSV BARU TERSEDIA) ──
          if (container) {
            container.style.background = "rgba(245, 158, 11, 0.08)";
            container.style.borderLeft = "4px solid #f59e0b";
          }
          if (iconWrap) iconWrap.style.color = "#d97706";
          if (descEl) {
            descEl.innerHTML = `File TSV Baru: <strong>${bData.tsv.filename}</strong> (${bData.tsv.size_kb} KB) &bull; Tgl Download: <strong>${bData.tsv.date}</strong> &bull; <span style="color:#b45309; font-weight:600;">Belum disinkronkan ke database SQLite!</span>`;
          }
          if (badgeEl) {
            badgeEl.textContent = "TSV Baru Tersedia!";
            badgeEl.style.background = "#fef3c7";
            badgeEl.style.color = "#b45309";
          }
          if (syncBtn) syncBtn.style.display = "inline-flex";
          if (resyncBtn) resyncBtn.style.display = "none";
          if (toolbarSyncBtn) toolbarSyncBtn.style.display = "inline-flex";
        } else {
          // ── KONDISI 2: RADAR STANDBY / TENANG (SUDAH SINKRON) ──
          if (container) {
            container.style.background = "rgba(22, 163, 74, 0.04)";
            container.style.borderLeft = "4px solid #16a34a";
          }
          if (iconWrap) iconWrap.style.color = "#16a34a";
          if (descEl) {
            descEl.innerHTML = `File Terdata: <strong>${bData.tsv.filename}</strong> (${bData.tsv.size_kb} KB) &bull; Tgl Download: <strong>${bData.tsv.date}</strong> &bull; Terdata di SQLite: <strong>${bData.db_total_agents.toLocaleString()}</strong> Agen / <strong>${bData.db_total_resellers.toLocaleString()}</strong> Reseller &bull; <span style="color:#16a34a; font-weight:600;">Sinkron (Database Up-to-Date)</span>`;
          }
          if (badgeEl) {
            badgeEl.textContent = "Sinkron (Up-to-Date)";
            badgeEl.style.background = "#dcfce7";
            badgeEl.style.color = "#15803d";
          }
          // TOMBOL SYNC BESAR MATI / DISEMBUNYIKAN
          if (syncBtn) syncBtn.style.display = "none";
          // Tombol sekunder kecil muncul jika ingin paksa re-sync
          if (resyncBtn) resyncBtn.style.display = "inline-flex";
          // Tombol di toolbar filter disembunyikan agar tampilan bersih
          if (toolbarSyncBtn) toolbarSyncBtn.style.display = "none";
        }
      } else {
        if (container) {
          container.style.background = "rgba(239, 68, 68, 0.04)";
          container.style.borderLeft = "4px solid #ef4444";
        }
        if (iconWrap) iconWrap.style.color = "#ef4444";
        if (descEl) descEl.textContent = `Belum ada file TSV di C:\\RAW DATA\\${b}`;
        if (badgeEl) {
          badgeEl.textContent = "File Tidak Ditemukan";
          badgeEl.style.background = "#fee2e2";
          badgeEl.style.color = "#b91c1c";
        }
        if (syncBtn) syncBtn.style.display = "none";
        if (resyncBtn) resyncBtn.style.display = "none";
        if (toolbarSyncBtn) toolbarSyncBtn.style.display = "none";
      }
    }
  } catch (e) {
    console.error("Gagal memeriksa radar reseller:", e);
  }
}

async function syncResellerTSV() {
  const brand = masterState.brand;
  const btnToolbar = document.getElementById("btn-sync-reseller-tsv");
  const txtToolbar = document.getElementById("btn-sync-reseller-text");
  const btnRadar = document.getElementById("reseller-radar-sync-btn");
  const txtRadar = document.getElementById("reseller-radar-sync-text");

  if (!confirm(`Apakah Anda yakin ingin menyinkronkan data Agen & Reseller ${brand} dari file TSV terbaru di C:\\RAW DATA\\${brand}?\n\nPengaturan SCO, DSO, dan tipe Non Limit yang telah diedit di web akan tetap dipertahankan.`)) {
    return;
  }

  if (btnToolbar) btnToolbar.disabled = true;
  if (txtToolbar) txtToolbar.textContent = "Menyinkronkan...";
  if (btnRadar) btnRadar.disabled = true;
  if (txtRadar) txtRadar.textContent = "Menyinkronkan...";

  try {
    const res = await fetch("/api/admin/reseller/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: brand })
    });
    const json = await res.json();
    if (json.ok) {
      alert(`Sinkronisasi ${brand} Berhasil!\n\nDurasi: ${json.elapsed_sec} detik\nTotal Agen Induk: ${json.results[brand]?.total_agents?.toLocaleString() || '-'}\nTotal Reseller MLM: ${json.results[brand]?.total_resellers?.toLocaleString() || '-'}`);
      await loadMasterAgents();
      await checkResellerRadar();
    } else {
      alert(`Gagal sinkronisasi: ${json.error || "Terjadi kesalahan"}`);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
  } finally {
    if (btnToolbar) btnToolbar.disabled = false;
    if (txtToolbar) txtToolbar.textContent = "Sync TSV Mingguan";
    if (btnRadar) btnRadar.disabled = false;
    if (txtRadar) txtRadar.textContent = "Sync Sekarang";
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// MODAL: EDIT DATA AGEN & PEMETAAN SALES (SCO & DSO)
// ═════════════════════════════════════════════════════════════════════════════

function populateAgentModalSalesOptions(selectedSco = "NON SCO", selectedDso = "-") {
  const scoSel = document.getElementById("edit-agent-sco");
  const scoCustom = document.getElementById("edit-agent-sco-custom");
  const dsoSel = document.getElementById("edit-agent-dso");
  const dsoCustom = document.getElementById("edit-agent-dso-custom");

  // 1. POPULATE SCO (Sales Collection Officer)
  if (scoSel) {
    const defaultScos = ["NON SCO", "Abdul Harris", "Febri Kurniawan", "Hupron", "Khoirul Anan", "Mas Komarjaya", "ONLINE"];
    const scoSet = new Set(defaultScos);
    if (Array.isArray(currentBrandScos)) {
      currentBrandScos.forEach(s => {
        if (s && s !== "BELUM DIPETAKAN") scoSet.add(s);
      });
    }
    const cleanSco = (selectedSco || "NON SCO").trim();
    if (cleanSco && cleanSco !== "BELUM DIPETAKAN") {
      scoSet.add(cleanSco);
    }

    let scoHtml = `<option value="NON SCO">NON SCO (Belum Dipetakan)</option>`;
    const sortedScos = Array.from(scoSet).filter(s => s !== "NON SCO").sort((a, b) => a.localeCompare(b));
    sortedScos.forEach(s => {
      scoHtml += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
    });
    scoHtml += `<option value="__NEW__">+ Input SCO Baru...</option>`;
    scoSel.innerHTML = scoHtml;

    scoSel.value = cleanSco || "NON SCO";
    if (scoCustom) {
      scoCustom.style.display = "none";
      scoCustom.value = "";
    }
  }

  // 2. POPULATE DSO (Direct Sales Officer)
  if (dsoSel) {
    const defaultDsos = ["-", "Ahmad Bukhori"];
    const dsoSet = new Set(defaultDsos);
    if (Array.isArray(currentBrandDsos)) {
      currentBrandDsos.forEach(d => {
        if (d && d !== "" && d !== "-") dsoSet.add(d);
      });
    }
    const cleanDso = (selectedDso && selectedDso.trim() !== "") ? selectedDso.trim() : "-";
    if (cleanDso !== "-") {
      dsoSet.add(cleanDso);
    }

    let dsoHtml = `<option value="-">- (Non-DSO / Tanpa DSO)</option>`;
    const sortedDsos = Array.from(dsoSet).filter(d => d !== "-").sort((a, b) => a.localeCompare(b));
    sortedDsos.forEach(d => {
      dsoHtml += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`;
    });
    dsoHtml += `<option value="__NEW__">+ Input DSO Baru...</option>`;
    dsoSel.innerHTML = dsoHtml;

    dsoSel.value = cleanDso;
    if (dsoCustom) {
      dsoCustom.style.display = "none";
      dsoCustom.value = "";
    }
  }
}

function handleScoSelectChange(sel) {
  const customInput = document.getElementById("edit-agent-sco-custom");
  if (!customInput) return;
  if (sel.value === "__NEW__") {
    customInput.style.display = "block";
    customInput.value = "";
    customInput.focus();
  } else {
    customInput.style.display = "none";
  }
}

function handleDsoSelectChange(sel) {
  const customInput = document.getElementById("edit-agent-dso-custom");
  if (!customInput) return;
  if (sel.value === "__NEW__") {
    customInput.style.display = "block";
    customInput.value = "";
    customInput.focus();
  } else {
    customInput.style.display = "none";
  }
}

function populateAgentModalJadwalOptions(selectedJadwal = "-") {
  const jadwalSel = document.getElementById("edit-agent-jadwal");
  const jadwalCustom = document.getElementById("edit-agent-jadwal-custom");
  if (!jadwalSel) return;

  const defaultJadwals = [
    { val: "-", label: "- (Tanpa Jadwal / Non-Kunjungan)" },
    { val: "Senin,Kamis", label: "Senin, Kamis" },
    { val: "Selasa,Jum'at", label: "Selasa, Jum'at" },
    { val: "Rabu,Sabtu", label: "Rabu, Sabtu" }
  ];

  let cleanJadwal = (selectedJadwal && selectedJadwal.trim() !== "" && selectedJadwal.trim() !== "null") ? selectedJadwal.trim() : "-";
  if (cleanJadwal.toLowerCase() === "selasa,jumat") {
    cleanJadwal = "Selasa,Jum'at";
  }

  const exists = defaultJadwals.some(j => j.val.toLowerCase() === cleanJadwal.toLowerCase());

  let html = "";
  defaultJadwals.forEach(j => {
    const isSel = (j.val.toLowerCase() === cleanJadwal.toLowerCase());
    html += `<option value="${j.val}" ${isSel ? 'selected' : ''}>${j.label}</option>`;
  });

  if (!exists && cleanJadwal !== "-") {
    html += `<option value="${escapeHtml(cleanJadwal)}" selected>${escapeHtml(cleanJadwal)}</option>`;
  }

  html += `<option value="__NEW__">+ Input Jadwal Lain...</option>`;
  jadwalSel.innerHTML = html;

  if (!exists && cleanJadwal !== "-") {
    jadwalSel.value = cleanJadwal;
  } else {
    const matched = defaultJadwals.find(j => j.val.toLowerCase() === cleanJadwal.toLowerCase());
    jadwalSel.value = matched ? matched.val : "-";
  }

  if (jadwalCustom) {
    jadwalCustom.style.display = "none";
    jadwalCustom.value = "";
  }
}

function handleJadwalSelectChange(sel) {
  const customInput = document.getElementById("edit-agent-jadwal-custom");
  if (!customInput) return;
  if (sel.value === "__NEW__") {
    customInput.style.display = "block";
    customInput.value = "";
    customInput.focus();
  } else {
    customInput.style.display = "none";
  }
}

function handleCabangSelectChange(sel) {
  const cabVal = (sel ? sel.value : "").toUpperCase();
  const scoSel = document.getElementById("edit-agent-sco");
  const jadwalSel = document.getElementById("edit-agent-jadwal");
  if (!scoSel) return;

  if (cabVal === "ONLINE") {
    // Aturan Bisnis: Cabang ONLINE (pendaftaran via PlayStore) -> SCO wajib ONLINE, Tipe Prima & Jadwal non-kunjungan (-)
    scoSel.value = "ONLINE";
    const scoCustom = document.getElementById("edit-agent-sco-custom");
    if (scoCustom) scoCustom.style.display = "none";

    const typeSel = document.getElementById("edit-agent-type");
    if (typeSel) typeSel.value = "Prima";
    const limitInput = document.getElementById("edit-agent-limit");
    if (limitInput) limitInput.value = "0";
    updateLimitHint("Prima", 0);

    if (jadwalSel) {
      jadwalSel.value = "-";
      const jadwalCustom = document.getElementById("edit-agent-jadwal-custom");
      if (jadwalCustom) jadwalCustom.style.display = "none";
    }
  } else {
    // Cabang Fisik (BSD, ICON, PP, PRG): NON SCO untuk jenis Walk In
    if (scoSel.value === "ONLINE") {
      scoSel.value = "NON SCO";
    }
  }
}

function parseRupiahInput(val) {
  if (!val) return 0;
  const clean = String(val).replace(/[^0-9]/g, "");
  return parseFloat(clean) || 0;
}

function updateLimitHint(type, numVal) {
  const hint = document.getElementById("limit-hint");
  if (!hint) return;
  if (type === "Limit") {
    hint.innerHTML = numVal > 0
      ? `<span style="color: #dc2626; font-weight: 600;">Plafon saldo aktif: Rp ${numVal.toLocaleString("id-ID")}</span>`
      : `<span style="color: #eab308; font-weight: 600;">Tipe Limit: Silakan masukkan nominal plafon kredit</span>`;
  } else if (type === "Non Limit") {
    hint.innerHTML = `<span style="color: #d97706; font-weight: 600;">Eks-Limit / Konvensional (Plafon dinonaktifkan: Rp 0)</span>`;
  } else {
    hint.innerHTML = `<span style="color: #059669; font-weight: 600;">Prima / Reguler (Tanpa plafon kredit saldo)</span>`;
  }
}

function handleLimitInput(el) {
  const num = parseRupiahInput(el.value);
  el.value = num > 0 ? num.toLocaleString("id-ID") : (el.value === "" ? "" : "0");

  const typeEl = document.getElementById("edit-agent-type");
  if (num > 0) {
    if (typeEl && typeEl.value !== "Limit") {
      typeEl.value = "Limit";
    }
  } else if (num === 0) {
    if (typeEl && typeEl.value === "Limit") {
      typeEl.value = "Non Limit";
    }
  }
  updateLimitHint(typeEl ? typeEl.value : "Limit", num);
}

function handleTypeSelectChange(sel) {
  const selType = sel ? sel.value : "Prima";
  const limitInput = document.getElementById("edit-agent-limit");
  if (selType === "Limit") {
    if (limitInput) {
      if (parseRupiahInput(limitInput.value) === 0) {
        limitInput.value = "";
        limitInput.focus();
      }
    }
    updateLimitHint("Limit", limitInput ? parseRupiahInput(limitInput.value) : 0);
  } else if (selType === "Non Limit") {
    if (limitInput) limitInput.value = "0";
    updateLimitHint("Non Limit", 0);
  } else if (selType === "Prima") {
    if (limitInput) limitInput.value = "0";
    updateLimitHint("Prima", 0);
  }
}

function openAddAgentModal(prefillId = "") {
  const modal = document.getElementById("modal-edit-agent");
  if (!modal) return;

  const curBrand = (typeof masterState !== "undefined" && masterState && masterState.brand) ? masterState.brand : "ASTAGA";

  const titleEl = document.getElementById("modal-agent-title");
  if (titleEl) {
    titleEl.textContent = `+ Tambah Agen Baru (${curBrand})`;
  }

  const idInput = document.getElementById("edit-agent-id");
  if (idInput) {
    idInput.readOnly = false;
    idInput.style.cursor = "text";
    idInput.style.background = "var(--surface-card)";
    idInput.value = (prefillId || "").trim().toUpperCase();
  }

  document.getElementById("edit-agent-brand").value = curBrand;
  document.getElementById("edit-agent-nama").value = "";
  
  // Populate Cabang options
  let initialCabang = curBrand === "OKIPAY" ? "ONLINE" : "BSD";
  const cabSel = document.getElementById("edit-agent-cabang");
  if (cabSel) {
    let cabHtml = "";
    const listCabangs = (currentBrandCabangs && currentBrandCabangs.length > 0)
      ? currentBrandCabangs
      : (curBrand === "OKIPAY" ? ["ONLINE", "H2H"] : ["BSD", "PP", "ICON", "PRG", "ONLINE"]);
    listCabangs.forEach(c => {
      cabHtml += `<option value="${c}">${c}</option>`;
    });
    cabSel.innerHTML = cabHtml;
    initialCabang = listCabangs[0] || initialCabang;
    cabSel.value = initialCabang;
  }

  // Tipe Reseller & Limit Saldo default
  const initialType = (initialCabang.toUpperCase() === "ONLINE") ? "Prima" : "Non Limit";
  const typeEl = document.getElementById("edit-agent-type");
  if (typeEl) typeEl.value = initialType;
  const limitInput = document.getElementById("edit-agent-limit");
  if (limitInput) limitInput.value = "0";
  updateLimitHint(initialType, 0);

  // Inisialisasi Dropdown SCO & DSO & Jadwal (Cabang ONLINE -> SCO otomatis ONLINE)
  const initialSco = initialCabang.toUpperCase() === "ONLINE" ? "ONLINE" : "NON SCO";
  populateAgentModalSalesOptions(initialSco, curBrand === "OKIPAY" ? "-" : "-");
  populateAgentModalJadwalOptions(curBrand === "OKIPAY" ? "-" : "-");

  document.getElementById("edit-agent-location").value = curBrand === "OKIPAY" ? "-" : "";

  const btnSave = document.getElementById("btn-save-agent");
  if (btnSave) btnSave.textContent = "Simpan Agen Baru";

  modal.style.display = "flex";

  setTimeout(() => {
    if (!prefillId && idInput) {
      idInput.focus();
    } else {
      const namaInput = document.getElementById("edit-agent-nama");
      if (namaInput) namaInput.focus();
    }
  }, 100);
}

async function openEditAgentModal(agenId) {
  const modal = document.getElementById("modal-edit-agent");
  if (!modal) return;

  try {
    const res = await fetch(`/api/admin/agents/detail?brand=${masterState.brand}&agen_id=${agenId}&t=${Date.now()}`);
    const json = await res.json();

    if (!json.ok || !json.data || !json.data.found) {
      alert("Gagal memuat profil agen: " + (json.error || "Data tidak ditemukan"));
      return;
    }

    const ag = json.data.agent;

    document.getElementById("modal-agent-title").textContent = `Edit Agen: ${ag.agen_id}`;
    document.getElementById("edit-agent-brand").value = masterState.brand;

    const idInput = document.getElementById("edit-agent-id");
    if (idInput) {
      idInput.readOnly = true;
      idInput.style.cursor = "not-allowed";
      idInput.style.background = "var(--surface-bg)";
      idInput.value = ag.agen_id;
    }

    document.getElementById("edit-agent-nama").value = ag.nama_agen || "";

    // Tipe Reseller & Limit Saldo
    let curType = ag.type || "Prima";
    if (curType === "No Limit") curType = "Non Limit";
    if (curType === "Standard") {
      curType = (ag.limit_saldo && ag.limit_saldo !== 0) ? "Limit" : ((ag.cabang || "").toUpperCase() === "ONLINE" ? "Prima" : "Non Limit");
    }
    const typeEl = document.getElementById("edit-agent-type");
    if (typeEl) typeEl.value = curType;

    const rawLimit = Math.abs(ag.limit_saldo || 0);
    const limitInput = document.getElementById("edit-agent-limit");
    if (limitInput) {
      limitInput.value = rawLimit > 0 ? rawLimit.toLocaleString("id-ID") : "0";
    }
    updateLimitHint(curType, rawLimit);

    // Inisialisasi Dropdown SCO, DSO & Jadwal dengan nilai agen saat ini
    let currentSco = ag.sco || "NON SCO";
    if ((ag.cabang || "").toUpperCase() === "ONLINE" && (!currentSco || currentSco === "NON SCO")) {
      currentSco = "ONLINE";
    }
    populateAgentModalSalesOptions(currentSco, ag.dso || "-");
    populateAgentModalJadwalOptions(ag.jadwal || "-");

    document.getElementById("edit-agent-location").value = ag.location || "";

    // Populate Cabang options
    const cabSel = document.getElementById("edit-agent-cabang");
    if (cabSel) {
      let cabHtml = "";
      currentBrandCabangs.forEach(c => {
        cabHtml += `<option value="${c}" ${c === ag.cabang ? 'selected' : ''}>${c}</option>`;
      });
      // Jika cabang agen tidak ada di list cabangs, tambahkan manual
      if (!currentBrandCabangs.includes(ag.cabang)) {
        cabHtml += `<option value="${ag.cabang}" selected>${ag.cabang}</option>`;
      }
      cabSel.innerHTML = cabHtml;
    }

    const btnSave = document.getElementById("btn-save-agent");
    if (btnSave) btnSave.textContent = "Simpan Perubahan";

    modal.style.display = "flex";

  } catch (err) {
    alert("Koneksi gagal: " + err.message);
  }
}

function openDownlinesModal(agenId, namaAgen) {
  const modal = document.getElementById("modal-agent-downlines");
  const title = document.getElementById("modal-downline-title");
  if (title) title.textContent = "Daftar Downline: " + (namaAgen || agenId);
  if (modal) modal.style.display = "flex";
}

function closeDownlinesModal() {
  const modal = document.getElementById("modal-agent-downlines");
  if (modal) modal.style.display = "none";
}

function closeEditAgentModal() {
  const modal = document.getElementById("modal-edit-agent");
  if (modal) modal.style.display = "none";
}

async function submitEditAgent(event) {
  event.preventDefault();

  const brand = document.getElementById("edit-agent-brand").value;
  const agenId = document.getElementById("edit-agent-id").value;
  const btnSave = document.getElementById("btn-save-agent");

  // Baca nilai SCO (dropdown atau custom baru)
  const scoSel = document.getElementById("edit-agent-sco");
  const scoCustom = document.getElementById("edit-agent-sco-custom");
  let scoVal = scoSel ? scoSel.value.trim() : "NON SCO";
  if (scoVal === "__NEW__") {
    scoVal = scoCustom ? scoCustom.value.trim() : "";
    if (!scoVal) scoVal = "NON SCO";
  }

  // Baca nilai DSO (dropdown atau custom baru)
  const dsoSel = document.getElementById("edit-agent-dso");
  const dsoCustom = document.getElementById("edit-agent-dso-custom");
  let dsoVal = dsoSel ? dsoSel.value.trim() : "-";
  if (dsoVal === "__NEW__") {
    dsoVal = dsoCustom ? dsoCustom.value.trim() : "";
    if (!dsoVal) dsoVal = "-";
  }

  // Baca nilai Jadwal (dropdown atau custom baru)
  const jadwalSel = document.getElementById("edit-agent-jadwal");
  const jadwalCustom = document.getElementById("edit-agent-jadwal-custom");
  let jadwalVal = jadwalSel ? jadwalSel.value.trim() : "-";
  if (jadwalVal === "__NEW__") {
    jadwalVal = jadwalCustom ? jadwalCustom.value.trim() : "";
    if (!jadwalVal) jadwalVal = "-";
  }

  const limitNum = parseRupiahInput(document.getElementById("edit-agent-limit") ? document.getElementById("edit-agent-limit").value : 0);

  const payload = {
    brand: brand,
    agen_id: agenId,
    data: {
      nama_agen: document.getElementById("edit-agent-nama").value.trim(),
      cabang: document.getElementById("edit-agent-cabang").value.trim(),
      type: document.getElementById("edit-agent-type").value.trim(),
      limit_saldo: limitNum,
      sco: scoVal,
      dso: dsoVal,
      jadwal: jadwalVal,
      location: document.getElementById("edit-agent-location").value.trim()
    }
  };

  if (btnSave) {
    btnSave.disabled = true;
    btnSave.textContent = "Menyimpan & Propagasi...";
  }

  try {
    const res = await fetch("/api/admin/agents/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!json.ok) {
      alert("Gagal menyimpan agen: " + (json.error || "Unknown error"));
      return;
    }

    closeEditAgentModal();
    // Reload table & stats
    loadMasterAgents();

  } catch (err) {
    alert("Koneksi gagal: " + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = "Simpan Perubahan";
    }
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// MODAL: DOWNLINE TREE INSPECTOR
// ═════════════════════════════════════════════════════════════════════════════

async function showDownlineModal(agenId, namaAgen) {
  const modal = document.getElementById("modal-downlines");
  const tbody = document.getElementById("modal-downlines-tbody");
  const title = document.getElementById("modal-downline-title");
  const subtitle = document.getElementById("modal-downline-subtitle");
  const footerInfo = document.getElementById("modal-downline-footer-info");

  if (!modal || !tbody) return;

  if (title) title.textContent = `Downline: [${agenId}] ${namaAgen}`;
  if (subtitle) subtitle.textContent = `Mengambil data pohon hierarki MLM dari database SQLite...`;
  
  tbody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">
        Mengambil daftar downline...
      </td>
    </tr>
  `;

  modal.style.display = "flex";

  try {
    const res = await fetch(`/api/admin/agents/detail?brand=${masterState.brand}&agen_id=${agenId}&t=${Date.now()}`);
    const json = await res.json();

    if (!json.ok || !json.data || !json.data.downlines) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 24px; color: #dc2626;">
            Gagal mengambil downline: ${json.error || "Data tidak ditemukan"}
          </td>
        </tr>
      `;
      return;
    }

    const downlines = json.data.downlines;
    if (subtitle) {
      subtitle.textContent = `Daftar toko reseller yang bernaung di bawah agen ${agenId}`;
    }
    if (footerInfo) {
      footerInfo.textContent = `Menampilkan ${downlines.length.toLocaleString()} toko downline`;
    }

    if (downlines.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 30px; color: var(--text-muted);">
            Tidak ada downline di bawah agen ini.
          </td>
        </tr>
      `;
      return;
    }

    let html = "";
    downlines.forEach(d => {
      const saldoRp = (d.saldo || 0).toLocaleString("id-ID");
      const isAgenSelf = d.kode_reseller === agenId;
      const rowBg = isAgenSelf ? "background: rgba(37, 99, 235, 0.04);" : "";

      html += `
        <tr style="border-bottom: 1px solid var(--surface-border); ${rowBg}">
          <td style="padding: 8px 12px; font-family: var(--font-mono); font-weight: 600; color: ${isAgenSelf ? 'var(--primary)' : 'var(--text-main)'};">
            ${d.kode_reseller} ${isAgenSelf ? '<span class="badge" style="font-size: 10px; padding: 1px 4px;">INDUL</span>' : ''}
          </td>
          <td style="padding: 8px 12px; font-weight: 500;">
            ${escapeHtml(d.nama_reseller)}
          </td>
          <td style="padding: 8px 12px; font-family: var(--font-mono); color: var(--text-muted);">
            ${d.kode_upline || '-'}
          </td>
          <td style="padding: 8px 12px;">
            <span class="badge" style="font-size: 11px;">
              ${d.leveling}
            </span>
          </td>
          <td style="padding: 8px 12px; text-align: right; font-family: var(--font-mono); font-weight: 600;">
            Rp ${saldoRp}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 24px; color: #dc2626;">
          Terjadi kesalahan koneksi server: ${err.message}
        </td>
      </tr>
    `;
  }
}

function closeDownlinesModal() {
  const modal = document.getElementById("modal-downlines");
  if (modal) modal.style.display = "none";
}



// ═════════════════════════════════════════════════════════════════════════════
// TAB 3: MASTER PRODUK & KATEGORI
// ═════════════════════════════════════════════════════════════════════════════

function selectProductBrand(brand) {
  switchAdminGlobalBrand(brand);
}

async function loadMasterProducts() {
  const tbody = document.getElementById("master-products-tbody");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align: center; padding: 36px; color: var(--text-muted);">
        <div style="display: inline-flex; align-items: center; justify-content: center; animation: spin 1s linear infinite; margin-bottom: 8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
        </div>
        <div>Memuat data master produk ${productState.brand}...</div>
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams({
      brand: productState.brand,
      kategori: productState.kategori,
      operator: productState.operator,
      paket: productState.paket,
      search: productState.search,
      page: productState.page,
      page_size: productState.pageSize,
      t: Date.now()
    });

    const res = await fetch(`/api/admin/products?${params.toString()}`);
    const json = await res.json();

    if (!json.ok || !json.data) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 30px; color: #dc2626;">
            Gagal memuat master produk: ${json.error || "Unknown error"}
          </td>
        </tr>
      `;
      return;
    }

    // 1. Update KPI Cards & Filter Options
    if (json.options) {
      productState.rawOptions = json.options;
      renderProductKPIs(json.options.stats);
      if (!productState.optionsLoaded) {
        populateProductFilterDropdowns(json.options);
        productState.optionsLoaded = true;
      }
    }

    // 2. Simpan pagination state
    productState.totalCount = json.data.total_count || 0;
    productState.totalPages = json.data.total_pages || 1;

    // 3. Render tabel produk
    renderProductsTable(json.data.rows);

    // 4. Update UI pagination
    updateProductPaginationUI();

  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 30px; color: #dc2626;">
          Terjadi kesalahan koneksi server: ${err.message}
        </td>
      </tr>
    `;
  }
}

function renderProductKPIs(stats) {
  if (!stats) return;
  const kpiTotal = document.getElementById("kpi-total-products");
  const kpiKat = document.getElementById("kpi-total-categories");
  const kpiOp = document.getElementById("kpi-total-operators");
  const kpiUnmapped = document.getElementById("kpi-unmapped-categories");

  if (kpiTotal) kpiTotal.textContent = (stats.total_products || 0).toLocaleString("id-ID");
  if (kpiKat) kpiKat.textContent = (stats.total_categories || 0).toLocaleString("id-ID");
  if (kpiOp) kpiOp.textContent = (stats.total_operators || 0).toLocaleString("id-ID");
  if (kpiUnmapped) kpiUnmapped.textContent = (stats.unmapped_categories || 0).toLocaleString("id-ID");
}

function populateProductFilterDropdowns(options) {
  const selKat = document.getElementById("prod-filter-kategori");
  const selOp = document.getElementById("prod-filter-operator");
  const selPaket = document.getElementById("prod-filter-paket");

  // Datalist modal edit
  const listKat = document.getElementById("list-prod-kategori");
  const listOp = document.getElementById("list-prod-operator");
  const listPaket = document.getElementById("list-prod-paket");

  if (selKat) {
    let katHtml = `<option value="ALL">Semua Kategori</option>`;
    (options.categories || []).forEach(k => {
      katHtml += `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`;
    });
    selKat.innerHTML = katHtml;
    selKat.value = productState.kategori;
  }

  if (selOp) {
    let opHtml = `<option value="ALL">Semua Operator</option>`;
    (options.operators || []).forEach(o => {
      opHtml += `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`;
    });
    selOp.innerHTML = opHtml;
    selOp.value = productState.operator;
  }

  if (selPaket) {
    let pakHtml = `<option value="ALL">Semua Paket</option>`;
    (options.pakets || []).forEach(p => {
      pakHtml += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
    });
    selPaket.innerHTML = pakHtml;
    selPaket.value = productState.paket;
  }

  // Isi datalists untuk modal
  if (listKat) {
    let dHtml = "";
    (options.categories || []).forEach(k => {
      dHtml += `<option value="${escapeHtml(k)}">`;
    });
    listKat.innerHTML = dHtml;
  }

  if (listOp) {
    let dHtml = "";
    (options.operators || []).forEach(o => {
      dHtml += `<option value="${escapeHtml(o)}">`;
    });
    listOp.innerHTML = dHtml;
  }

  if (listPaket) {
    let dHtml = "";
    (options.pakets || []).forEach(p => {
      dHtml += `<option value="${escapeHtml(p)}">`;
    });
    listPaket.innerHTML = dHtml;
  }
}

function renderProductsTable(rows) {
  const tbody = document.getElementById("master-products-tbody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Tidak ada produk yang cocok dengan kriteria pencarian / filter.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  rows.forEach(r => {
    // Style badge kategori
    let katBg = "#f3f4f6";
    let katColor = "#374151";
    const kUpper = (r.kategori || "").toUpperCase();
    if (kUpper === "LAINNYA" || !kUpper) {
      katBg = "#fef3c7";
      katColor = "#b45309";
    } else if (kUpper.includes("PULSA")) {
      katBg = "#eff6ff";
      katColor = "#1d4ed8";
    } else if (kUpper.includes("DATA") || kUpper.includes("KUOTA")) {
      katBg = "#f0fdf4";
      katColor = "#15803d";
    } else if (kUpper.includes("PLN")) {
      katBg = "#ecfeff";
      katColor = "#0e7490";
    } else if (kUpper.includes("E-MONEY") || kUpper.includes("WALLET")) {
      katBg = "#fdf4ff";
      katColor = "#a21caf";
    }

    // Style badge operator
    let opBg = "#f8fafc";
    let opColor = "#475569";
    const opUpper = (r.operator || "").toUpperCase();
    if (opUpper.includes("TELKOMSEL") || opUpper.includes("TSEL")) {
      opBg = "#fef2f2";
      opColor = "#b91c1c";
    } else if (opUpper.includes("INDOSAT") || opUpper.includes("ISAT")) {
      opBg = "#fffbeb";
      opColor = "#b45309";
    } else if (opUpper.includes("XL") || opUpper.includes("AXIS")) {
      opBg = "#eff6ff";
      opColor = "#1e40af";
    } else if (opUpper.includes("TRI") || opUpper.includes("THREE")) {
      opBg = "#fff7ed";
      opColor = "#c2410c";
    } else if (opUpper.includes("SMARTFREN")) {
      opBg = "#fdf2f8";
      opColor = "#be185d";
    }

    html += `
      <tr style="border-bottom: 1px solid var(--surface-border); transition: background 0.15s ease;" onmouseover="this.style.background='var(--table-row-hover)'" onmouseout="this.style.background='transparent'">
        
        <!-- KOLOM 1: KODE & NAMA PRODUK -->
        <td style="padding: 12px 16px;">
          <div style="font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 6px;">
            ${escapeHtml(r.kode_produk)}
          </div>
          <div style="font-size: 12px; font-weight: 600; color: var(--text-main); margin-top: 3px;" title="${escapeHtml(r.nama_produk)}">
            ${escapeHtml(r.nama_produk)}
          </div>
        </td>

        <!-- KOLOM 2: KATEGORI -->
        <td style="padding: 12px 14px;">
          <span class="badge" style="background: ${katBg}; color: ${katColor}; font-weight: 700; font-size: 11.5px; padding: 3px 8px; border-radius: 6px;">
            ${escapeHtml(r.kategori)}
          </span>
        </td>

        <!-- KOLOM 3: OPERATOR / PROVIDER -->
        <td style="padding: 12px 14px;">
          <span class="badge" style="background: ${opBg}; color: ${opColor}; font-weight: 700; font-size: 11.5px; padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.06);">
            ${escapeHtml(r.operator)}
          </span>
        </td>

        <!-- KOLOM 4: PAKET / JENIS PRODUK -->
        <td style="padding: 12px 14px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-main);">
            ${escapeHtml(r.paket || '-')}
          </div>
        </td>

        <!-- KOLOM 5: AKSI -->
        <td style="padding: 12px 16px; text-align: center;">
          <button type="button" onclick="openEditProductModal('${escapeHtml(r.kode_produk)}')" class="btn-sm-edit" style="display:inline-flex; align-items:center; gap:5px; justify-content:center;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Edit
          </button>
        </td>

      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function updateProductPaginationUI() {
  const infoEl = document.getElementById("product-pagination-info");
  const curEl = document.getElementById("product-page-current");
  const btnPrev = document.getElementById("product-btn-prev");
  const btnNext = document.getElementById("product-btn-next");

  const start = productState.totalCount === 0 ? 0 : (productState.page - 1) * productState.pageSize + 1;
  const end = Math.min(productState.page * productState.pageSize, productState.totalCount);

  if (infoEl) {
    infoEl.textContent = `Menampilkan ${start} - ${end} dari ${productState.totalCount.toLocaleString("id-ID")} produk`;
  }
  if (curEl) {
    curEl.textContent = `Hal ${productState.page} / ${productState.totalPages}`;
  }
  if (btnPrev) {
    btnPrev.disabled = productState.page <= 1;
  }
  if (btnNext) {
    btnNext.disabled = productState.page >= productState.totalPages;
  }
}

function goToProductPage(direction) {
  const target = productState.page + direction;
  if (target >= 1 && target <= productState.totalPages) {
    productState.page = target;
    loadMasterProducts();
  }
}

function changeProductPageSize() {
  const sel = document.getElementById("product-page-size");
  if (sel) {
    productState.pageSize = parseInt(sel.value, 10);
    productState.page = 1;
    loadMasterProducts();
  }
}

function executeProductFilter() {
  const sInput = document.getElementById("product-search-input");
  const selKat = document.getElementById("prod-filter-kategori");
  const selOp = document.getElementById("prod-filter-operator");
  const selPaket = document.getElementById("prod-filter-paket");

  productState.search = sInput ? sInput.value.trim() : "";
  productState.kategori = selKat ? selKat.value : "ALL";
  productState.operator = selOp ? selOp.value : "ALL";
  productState.paket = selPaket ? selPaket.value : "ALL";
  productState.page = 1;

  loadMasterProducts();
}

function resetProductFilter() {
  const sInput = document.getElementById("product-search-input");
  const selKat = document.getElementById("prod-filter-kategori");
  const selOp = document.getElementById("prod-filter-operator");
  const selPaket = document.getElementById("prod-filter-paket");

  if (sInput) sInput.value = "";
  if (selKat) selKat.value = "ALL";
  if (selOp) selOp.value = "ALL";
  if (selPaket) selPaket.value = "ALL";

  productState.search = "";
  productState.kategori = "ALL";
  productState.operator = "ALL";
  productState.paket = "ALL";
  productState.page = 1;

  loadMasterProducts();
}

function exportProductExcel() {
  const brand = productState.brand;
  const url = `/api/admin/products/export?brand=${brand}`;
  if (typeof window.downloadUrlSmart === "function") {
    window.downloadUrlSmart(url, `Master_Products_${brand}.xlsx`);
  } else {
    window.location.href = url;
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// MODAL: TAMBAH & EDIT DATA MASTER PRODUK
// ═════════════════════════════════════════════════════════════════════════════

function setupProductEditOptions(options, curKategori = "", curOperator = "", curPaket = "") {
  options = options || (typeof productState !== "undefined" && productState && productState.rawOptions) || {};
  const categories = options.categories || [];
  const operators = options.operators || [];
  const pakets = options.pakets || [];

  // 1. Kategori Select
  const selKat = document.getElementById("edit-prod-kategori-select");
  const custKat = document.getElementById("edit-prod-kategori-custom");
  const btnToggleKat = document.getElementById("btn-toggle-custom-kategori");
  if (selKat) {
    let html = `<option value="">-- Pilih Kategori --</option>`;
    let hasCur = false;
    categories.forEach(k => {
      if (k === curKategori) hasCur = true;
      html += `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`;
    });
    if (curKategori && !hasCur) {
      html += `<option value="${escapeHtml(curKategori)}">${escapeHtml(curKategori)}</option>`;
    }
    html += `<option value="__CUSTOM__">+ Ketik Kategori Baru...</option>`;
    selKat.innerHTML = html;
    selKat.value = curKategori || "";
    selKat.style.display = "block";
  }
  if (custKat) {
    custKat.value = "";
    custKat.style.display = "none";
  }
  if (btnToggleKat) btnToggleKat.textContent = "+ Ketik Manual";

  // 2. Operator Select
  const selOp = document.getElementById("edit-prod-operator-select");
  const custOp = document.getElementById("edit-prod-operator-custom");
  const btnToggleOp = document.getElementById("btn-toggle-custom-operator");
  if (selOp) {
    let html = `<option value="">-- Pilih Operator / Provider --</option>`;
    let hasCur = false;
    operators.forEach(o => {
      if (o === curOperator) hasCur = true;
      html += `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`;
    });
    if (curOperator && !hasCur) {
      html += `<option value="${escapeHtml(curOperator)}">${escapeHtml(curOperator)}</option>`;
    }
    html += `<option value="__CUSTOM__">+ Ketik Operator Baru...</option>`;
    selOp.innerHTML = html;
    selOp.value = curOperator || "";
    selOp.style.display = "block";
  }
  if (custOp) {
    custOp.value = "";
    custOp.style.display = "none";
  }
  if (btnToggleOp) btnToggleOp.textContent = "+ Ketik Manual";

  // 3. Paket Select
  const selPkt = document.getElementById("edit-prod-paket-select");
  const custPkt = document.getElementById("edit-prod-paket-custom");
  const btnTogglePkt = document.getElementById("btn-toggle-custom-paket");
  if (selPkt) {
    let html = `<option value="">-- Tanpa Paket / Reguler --</option>`;
    let hasCur = false;
    pakets.forEach(p => {
      if (p === curPaket) hasCur = true;
      html += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
    });
    if (curPaket && curPaket !== "-" && !hasCur) {
      html += `<option value="${escapeHtml(curPaket)}">${escapeHtml(curPaket)}</option>`;
    }
    html += `<option value="__CUSTOM__">+ Ketik Paket Baru...</option>`;
    selPkt.innerHTML = html;
    selPkt.value = (curPaket && curPaket !== "-") ? curPaket : "";
    selPkt.style.display = "block";
  }
  if (custPkt) {
    custPkt.value = "";
    custPkt.style.display = "none";
  }
  if (btnTogglePkt) btnTogglePkt.textContent = "+ Ketik Manual";

  // Sync hidden inputs
  const hidKat = document.getElementById("edit-prod-kategori");
  if (hidKat) hidKat.value = curKategori || "";
  const hidOp = document.getElementById("edit-prod-operator");
  if (hidOp) hidOp.value = curOperator || "";
  const hidPkt = document.getElementById("edit-prod-paket");
  if (hidPkt) hidPkt.value = curPaket || "";
}

function toggleCustomField(fieldName) {
  const sel = document.getElementById(`edit-prod-${fieldName}-select`);
  const cust = document.getElementById(`edit-prod-${fieldName}-custom`);
  const btn = document.getElementById(`btn-toggle-custom-${fieldName}`);
  if (!sel || !cust || !btn) return;

  if (sel.style.display === "none") {
    sel.style.display = "block";
    cust.style.display = "none";
    btn.textContent = "+ Ketik Manual";
    if (sel.value === "__CUSTOM__") sel.value = "";
  } else {
    sel.style.display = "none";
    cust.style.display = "block";
    cust.value = (sel.value && sel.value !== "__CUSTOM__") ? sel.value : "";
    btn.textContent = "Pilih dari List";
    cust.focus();
  }
}

function handleKategoriSelectChange(el) {
  if (el.value === "__CUSTOM__") {
    toggleCustomField("kategori");
  } else {
    const hid = document.getElementById("edit-prod-kategori");
    if (hid) hid.value = el.value;
  }
}

function handleOperatorSelectChange(el) {
  if (el.value === "__CUSTOM__") {
    toggleCustomField("operator");
  } else {
    const hid = document.getElementById("edit-prod-operator");
    if (hid) hid.value = el.value;
  }
}

function handlePaketSelectChange(el) {
  if (el.value === "__CUSTOM__") {
    toggleCustomField("paket");
  } else {
    const hid = document.getElementById("edit-prod-paket");
    if (hid) hid.value = el.value;
  }
}

function openAddProductModal(prefillCode = "") {
  const modal = document.getElementById("modal-edit-product");
  if (!modal) {
    console.error("Modal #modal-edit-product tidak ditemukan di DOM!");
    return;
  }

  const curBrand = (typeof productState !== "undefined" && productState && productState.brand) ? productState.brand : "OKIPAY";

  const titleEl = document.getElementById("modal-product-title");
  if (titleEl) {
    titleEl.textContent = `+ Tambah Produk Baru (${curBrand})`;
  }

  const kodeInput = document.getElementById("edit-prod-kode");
  if (kodeInput) {
    kodeInput.readOnly = false;
    kodeInput.style.cursor = "text";
    kodeInput.style.background = "var(--surface-card)";
    kodeInput.value = (prefillCode || "").trim().toUpperCase();
  }

  const brandEl = document.getElementById("edit-prod-brand");
  if (brandEl) brandEl.value = curBrand;

  const namaEl = document.getElementById("edit-prod-nama");
  if (namaEl) namaEl.value = "";

  setupProductEditOptions(productState.rawOptions, "", "", "");

  const btnSave = document.getElementById("btn-save-product");
  if (btnSave) btnSave.textContent = "Simpan Produk Baru";

  modal.style.display = "flex";

  setTimeout(() => {
    if (!prefillCode && kodeInput) {
      kodeInput.focus();
    } else if (namaEl) {
      namaEl.focus();
    }
  }, 100);
}

async function openEditProductModal(kodeProduk) {
  const modal = document.getElementById("modal-edit-product");
  if (!modal) return;

  try {
    const res = await fetch(`/api/admin/products/detail?brand=${productState.brand}&kode_produk=${encodeURIComponent(kodeProduk)}&t=${Date.now()}`);
    const json = await res.json();

    if (!json.ok || !json.data || !json.data.found) {
      alert("Gagal memuat detail produk: " + (json.error || "Produk tidak ditemukan"));
      return;
    }

    if (json.options) {
      productState.rawOptions = json.options;
    }

    const p = json.data.product;
    const titleEl = document.getElementById("modal-product-title");
    if (titleEl) {
      titleEl.textContent = `Edit Produk: ${p.kode_produk} (${productState.brand})`;
    }

    const kodeInput = document.getElementById("edit-prod-kode");
    if (kodeInput) {
      kodeInput.readOnly = true;
      kodeInput.style.cursor = "not-allowed";
      kodeInput.style.background = "var(--surface-bg)";
      kodeInput.value = p.kode_produk || "";
    }

    document.getElementById("edit-prod-brand").value = productState.brand;
    document.getElementById("edit-prod-nama").value = p.nama_produk || "";

    setupProductEditOptions(productState.rawOptions, p.kategori, p.operator, p.paket);

    const btnSave = document.getElementById("btn-save-product");
    if (btnSave) btnSave.textContent = "Simpan Perubahan";

    modal.style.display = "flex";

  } catch (err) {
    alert("Terjadi kesalahan koneksi server: " + err.message);
  }
}

function closeEditProductModal() {
  const modal = document.getElementById("modal-edit-product");
  if (modal) modal.style.display = "none";
}

async function submitEditProduct(event) {
  event.preventDefault();
  const btn = document.getElementById("btn-save-product");
  const brand = document.getElementById("edit-prod-brand").value;
  const kodeProduk = document.getElementById("edit-prod-kode").value;
  const namaProduk = document.getElementById("edit-prod-nama").value.trim();

  const selKat = document.getElementById("edit-prod-kategori-select");
  const custKat = document.getElementById("edit-prod-kategori-custom");
  const kategori = (selKat && selKat.style.display === "none" ? custKat.value : (selKat ? selKat.value : "")).trim();

  const selOp = document.getElementById("edit-prod-operator-select");
  const custOp = document.getElementById("edit-prod-operator-custom");
  const operator = (selOp && selOp.style.display === "none" ? custOp.value : (selOp ? selOp.value : "")).trim();

  const selPkt = document.getElementById("edit-prod-paket-select");
  const custPkt = document.getElementById("edit-prod-paket-custom");
  const paket = (selPkt && selPkt.style.display === "none" ? custPkt.value : (selPkt ? selPkt.value : "")).trim();

  if (!kodeProduk) {
    alert("Kode produk tidak valid!");
    return;
  }
  if (!kategori || kategori === "__CUSTOM__") {
    alert("Silakan pilih atau ketik Kategori produk!");
    return;
  }
  if (!operator || operator === "__CUSTOM__") {
    alert("Silakan pilih atau ketik Operator / Provider produk!");
    return;
  }

  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Menyimpan & Menyinkronkan...";

  try {
    const payload = {
      brand: brand,
      kode_produk: kodeProduk,
      data: {
        nama_produk: namaProduk,
        kategori: kategori,
        operator: operator,
        paket: paket
      }
    };

    const res = await fetch("/api/admin/products/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!json.ok) {
      alert("Gagal menyimpan produk: " + (json.error || "Unknown error"));
      return;
    }

    closeEditProductModal();
    // Refresh tabel & KPI
    loadMasterProducts();

  } catch (err) {
    alert("Terjadi kesalahan koneksi: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}


// ─── Helpers ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Inisialisasi otomatis jika route aktif
if (typeof ROUTES !== "undefined" && ROUTES["#admin"]) {
  ROUTES["#admin"].initFn = "loadAdmin";
}

// Global window bindings untuk inline HTML event handlers
window.loadAdmin = loadAdmin;
window.switchAdminTab = switchAdminTab;
window.openAddProductModal = openAddProductModal;
window.openEditProductModal = openEditProductModal;
window.closeEditProductModal = closeEditProductModal;
window.submitEditProduct = submitEditProduct;
window.selectProductBrand = selectProductBrand;
window.executeProductFilter = executeProductFilter;
window.resetProductFilter = resetProductFilter;
window.exportProductExcel = exportProductExcel;
window.loadMasterProducts = loadMasterProducts;
window.goToProductPage = goToProductPage;
window.changeProductPageSize = changeProductPageSize;
window.openAddAgentModal = openAddAgentModal;
window.openEditAgentModal = openEditAgentModal;
window.closeEditAgentModal = closeEditAgentModal;
window.submitEditAgent = submitEditAgent;
window.openDownlinesModal = openDownlinesModal;
window.closeDownlinesModal = closeDownlinesModal;
window.selectMasterBrand = selectMasterBrand;
window.executeMasterFilter = executeMasterFilter;
window.resetMasterFilter = resetMasterFilter;
window.exportMasterExcel = exportMasterExcel;
window.loadMasterAgents = loadMasterAgents;
window.goToMasterPage = goToMasterPage;
window.changeMasterPageSize = changeMasterPageSize;
window.renderAdminUnmappedAudit = renderAdminUnmappedAudit;
window.toggleAdminUnmappedAudit = toggleAdminUnmappedAudit;
window.openAddAgentFromAudit = openAddAgentFromAudit;
window.openAddProductFromAudit = openAddProductFromAudit;
window.handleScoSelectChange = handleScoSelectChange;
window.handleDsoSelectChange = handleDsoSelectChange;
window.handleJadwalSelectChange = handleJadwalSelectChange;
window.handleCabangSelectChange = handleCabangSelectChange;
window.handleLimitInput = handleLimitInput;
window.handleTypeSelectChange = handleTypeSelectChange;
window.populateAgentModalJadwalOptions = populateAgentModalJadwalOptions;
window.populateAgentModalSalesOptions = populateAgentModalSalesOptions;
window.checkResellerRadar = checkResellerRadar;
window.syncResellerTSV = syncResellerTSV;
window.switchAdminGlobalBrand = switchAdminGlobalBrand;
window.updateAdminGlobalBrandUI = updateAdminGlobalBrandUI;
window.toggleCustomField = toggleCustomField;
window.handleKategoriSelectChange = handleKategoriSelectChange;
window.handleOperatorSelectChange = handleOperatorSelectChange;
window.handlePaketSelectChange = handlePaketSelectChange;

// ── SINKRONISASI KE VPS CLOUD (depas.my.id) ──
async function syncToVpsCloud() {
  const btn = document.getElementById("btn-sync-vps");
  const btnText = document.getElementById("btn-sync-vps-text");
  const statusEl = document.getElementById("sync-vps-status");

  if (!confirm("Unggah database master dan cache transaksi terbaru ke VPS depas.my.id sekarang?")) {
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = "Mengunggah ke VPS...";
  if (statusEl) {
    statusEl.style.color = "var(--primary)";
    statusEl.textContent = "Sedang sinkronisasi data ke cloud...";
  }

  try {
    const res = await fetch("/api/admin/sync-vps", { method: "POST" });
    const json = await res.json();

    if (json.ok) {
      if (statusEl) {
        statusEl.style.color = "#16a34a";
        statusEl.textContent = json.message || "Berhasil disinkronkan ke depas.my.id!";
      }
      alert(json.message || "Data berhasil disinkronkan ke https://depas.my.id!\nWebsite live sudah diperbarui.");
    } else {
      throw new Error(json.error || "Gagal sinkronisasi ke VPS");
    }
  } catch (err) {
    console.error("Error syncToVpsCloud:", err);
    if (statusEl) {
      statusEl.style.color = "#dc2626";
      statusEl.textContent = "Gagal: " + err.message;
    }
    alert("Gagal sinkronisasi ke VPS: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "Sinkronkan ke depas.my.id";
  }
}
window.syncToVpsCloud = syncToVpsCloud;

// ─── USER MANAGEMENT (PENGATURAN USER) ───────────────────────────────────────
async function loadAdminUsers() {
  const tbody = document.getElementById("table-admin-users-body");
  const countBadge = document.getElementById("admin-users-count");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">
        <div style="display: inline-flex; align-items: center; gap: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
          </svg>
          <span>Memuat data pengguna...</span>
        </div>
      </td>
    </tr>
  `;

  try {
    const res = await fetch("/api/admin/users");
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: #dc2626; font-weight: 600;">Akses ditolak: Menu ini khusus untuk peran Admin.</td></tr>`;
        return;
      }
      throw new Error("HTTP error " + res.status);
    }
    const data = await res.json();
    if (!data.ok || !data.users) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: #dc2626;">${escapeHtml(data.error || "Gagal memuat pengguna")}</td></tr>`;
      return;
    }

    const users = data.users;
    if (countBadge) countBadge.textContent = `${users.length} User`;

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--text-muted);">Belum ada pengguna terdaftar.</td></tr>`;
      return;
    }

    let html = "";
    users.forEach((u, idx) => {
      const isRoleAdmin = u.role === "admin";
      const roleBadge = isRoleAdmin
        ? `<span class="badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-weight: 700; font-size: 11px;">ADMIN</span>`
        : `<span class="badge" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-weight: 700; font-size: 11px;">TAMU</span>`;
      
      const createdStr = u.created_at ? new Date(u.created_at * 1000).toLocaleString("id-ID") : "-";
      const updatedStr = u.updated_at ? new Date(u.updated_at * 1000).toLocaleString("id-ID") : "-";

      const isProtected = u.username.toLowerCase() === "admin";
      const deleteBtn = isProtected
        ? `<button type="button" disabled style="opacity: 0.35; cursor: not-allowed; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--surface-border); background: var(--surface-bg); font-size: 11.5px; color: var(--text-muted);" title="Akun admin utama tidak dapat dihapus">Hapus</button>`
        : `<button type="button" onclick="confirmDeleteUser('${escapeHtml(u.username)}')" class="btn-sm-edit" style="color: #dc2626; border-color: #fecaca; background: #fff5f5; padding: 4px 10px; font-size: 11.5px;">Hapus</button>`;

      html += `
        <tr style="border-bottom: 1px solid var(--surface-border);">
          <td style="padding: 10px 16px; font-weight: 600; color: var(--text-muted);">${idx + 1}</td>
          <td style="padding: 10px 16px;">
            <div style="font-weight: 700; font-family: var(--font-mono); color: var(--text-main); font-size: 13px;">${escapeHtml(u.username)}</div>
          </td>
          <td style="padding: 10px 16px;">${roleBadge}</td>
          <td style="padding: 10px 16px; color: var(--text-muted); font-size: 12px;">${createdStr}</td>
          <td style="padding: 10px 16px; color: var(--text-muted); font-size: 12px;">${updatedStr}</td>
          <td style="padding: 10px 16px; text-align: center;">
            <div style="display: inline-flex; align-items: center; gap: 8px;">
              <button type="button" onclick="openResetPasswordModal('${escapeHtml(u.username)}')" class="btn-sm-edit" style="padding: 4px 10px; font-size: 11.5px;">
                Reset Password
              </button>
              ${deleteBtn}
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    console.error("Gagal loadAdminUsers:", err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: #dc2626;">Koneksi error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function openAddUserModal() {
  const modal = document.getElementById("modal-add-user");
  const errDiv = document.getElementById("add-user-error");
  if (errDiv) {
    errDiv.style.display = "none";
    errDiv.textContent = "";
  }
  const uInput = document.getElementById("add-user-username");
  const pInput = document.getElementById("add-user-password");
  const rInput = document.getElementById("add-user-role");
  if (uInput) uInput.value = "";
  if (pInput) pInput.value = "";
  if (rInput) rInput.value = "tamu";
  if (modal) modal.style.display = "flex";
  if (uInput) uInput.focus();
}

function closeAddUserModal() {
  const modal = document.getElementById("modal-add-user");
  if (modal) modal.style.display = "none";
}

async function submitAddUser(e) {
  if (e) e.preventDefault();
  const username = document.getElementById("add-user-username")?.value?.trim();
  const password = document.getElementById("add-user-password")?.value;
  const role = document.getElementById("add-user-role")?.value || "tamu";
  const errDiv = document.getElementById("add-user-error");
  const submitBtn = document.getElementById("btn-submit-add-user");

  if (!username || username.length < 3) {
    if (errDiv) {
      errDiv.textContent = "Username minimal 3 karakter.";
      errDiv.style.display = "block";
    }
    return;
  }
  if (!password || password.length < 4) {
    if (errDiv) {
      errDiv.textContent = "Password minimal 4 karakter.";
      errDiv.style.display = "block";
    }
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role })
    });
    const json = await res.json();
    if (!json.ok) {
      if (errDiv) {
        errDiv.textContent = json.error || "Gagal membuat pengguna.";
        errDiv.style.display = "block";
      }
      return;
    }

    closeAddUserModal();
    alert(json.message || `Pengguna '${username}' berhasil dibuat!`);
    loadAdminUsers();
  } catch (err) {
    if (errDiv) {
      errDiv.textContent = "Error: " + err.message;
      errDiv.style.display = "block";
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function openResetPasswordModal(username) {
  const modal = document.getElementById("modal-reset-user-pwd");
  const errDiv = document.getElementById("reset-pwd-error");
  if (errDiv) {
    errDiv.style.display = "none";
    errDiv.textContent = "";
  }
  const uHidden = document.getElementById("reset-pwd-username");
  const uDisplay = document.getElementById("reset-pwd-display-user");
  const pInput = document.getElementById("reset-pwd-new-password");

  if (uHidden) uHidden.value = username;
  if (uDisplay) uDisplay.textContent = username;
  if (pInput) pInput.value = "";
  if (modal) modal.style.display = "flex";
  if (pInput) pInput.focus();
}

function closeResetPasswordModal() {
  const modal = document.getElementById("modal-reset-user-pwd");
  if (modal) modal.style.display = "none";
}

async function submitResetPassword(e) {
  if (e) e.preventDefault();
  const username = document.getElementById("reset-pwd-username")?.value;
  const password = document.getElementById("reset-pwd-new-password")?.value;
  const errDiv = document.getElementById("reset-pwd-error");
  const submitBtn = document.getElementById("btn-submit-reset-pwd");

  if (!password || password.length < 4) {
    if (errDiv) {
      errDiv.textContent = "Password baru minimal 4 karakter.";
      errDiv.style.display = "block";
    }
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await fetch("/api/admin/users/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const json = await res.json();
    if (!json.ok) {
      if (errDiv) {
        errDiv.textContent = json.error || "Gagal memperbarui password.";
        errDiv.style.display = "block";
      }
      return;
    }

    closeResetPasswordModal();
    alert(json.message || `Password pengguna '${username}' berhasil diperbarui!`);
    loadAdminUsers();
  } catch (err) {
    if (errDiv) {
      errDiv.textContent = "Error: " + err.message;
      errDiv.style.display = "block";
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function confirmDeleteUser(username) {
  if (!confirm(`Apakah Anda yakin ingin menghapus pengguna '${username}'?\nTindakan ini tidak dapat dibatalkan.`)) {
    return;
  }

  try {
    const res = await fetch("/api/admin/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const json = await res.json();
    if (!json.ok) {
      alert("Gagal menghapus: " + (json.error || "Terjadi kesalahan"));
      return;
    }
    alert(json.message || `Pengguna '${username}' berhasil dihapus.`);
    loadAdminUsers();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

window.loadAdminUsers = loadAdminUsers;
window.openAddUserModal = openAddUserModal;
window.closeAddUserModal = closeAddUserModal;
window.submitAddUser = submitAddUser;
window.openResetPasswordModal = openResetPasswordModal;
window.closeResetPasswordModal = closeResetPasswordModal;
window.submitResetPassword = submitResetPassword;
window.confirmDeleteUser = confirmDeleteUser;







// =========================================================================
// DIRECT TSV UPLOADER & DATA STREAM (FASE 2)
// =========================================================================

let directTsvSelectedFile = null;

function handleDirectTsvFileSelect(event) {
  const file = (event && event.target && event.target.files && event.target.files[0]) || directTsvSelectedFile;
  if (!file) return;
  setDirectTsvFile(file, true);
}

function setDirectTsvFile(file, autoExecute = true) {
  directTsvSelectedFile = file;

  // Auto detect brand dari nama file jika cocok
  const upper = file.name.toUpperCase();
  if (upper.includes("OKIPAY")) {
    const r = document.querySelector('input[name="direct-tsv-brand"][value="OKIPAY"]');
    if (r) r.checked = true;
  } else if (upper.includes("ASTAGA")) {
    const r = document.querySelector('input[name="direct-tsv-brand"][value="ASTAGA"]');
    if (r) r.checked = true;
  }

  const infoBanner = document.getElementById("direct-tsv-info-banner");
  const nameDisplay = document.getElementById("direct-tsv-filename-display");
  const sizeDisplay = document.getElementById("direct-tsv-filesize-display");
  const resultBox = document.getElementById("direct-tsv-result-box");

  if (infoBanner) infoBanner.style.display = "block";
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  if (nameDisplay) {
    nameDisplay.textContent = `File Terpilih: ${file.name}`;
  }
  if (sizeDisplay) {
    sizeDisplay.textContent = `Ukuran: ${sizeMb} MB (${file.size.toLocaleString("id-ID")} bytes)`;
  }
  if (resultBox) {
    resultBox.style.display = "none";
  }

  if (autoExecute) {
    executeDirectTsvUpsert();
  }
}

async function executeDirectTsvUpsert() {
  const fileInput = document.getElementById("direct-tsv-file-input");
  const file = (fileInput && fileInput.files && fileInput.files[0]) || directTsvSelectedFile;

  if (!file) {
    alert("Silakan klik tombol 'Choose File' / 'Pilih File' terlebih dahulu.");
    return;
  }

  directTsvSelectedFile = file;

  const brandRadio = document.querySelector('input[name="direct-tsv-brand"]:checked');
  const brand = brandRadio ? brandRadio.value : "ASTAGA";

  const btn = document.getElementById("btn-direct-tsv-upsert");
  const btnText = document.getElementById("btn-direct-tsv-upsert-text");
  const resultBox = document.getElementById("direct-tsv-result-box");

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = `Sedang mengunggah & upsert ${file.name}...`;
  if (resultBox) {
    resultBox.style.display = "block";
    resultBox.style.background = "#eff6ff";
    resultBox.style.border = "1px solid #bfdbfe";
    resultBox.style.color = "#1e40af";
    resultBox.innerHTML = `<strong>Memproses:</strong> Mengunggah <strong>${file.name}</strong> (${(file.size/1024/1024).toFixed(2)} MB) ke VPS &amp; melakukan upsert ke Parquet...`;
  }

  const formData = new FormData();
  formData.append("brand", brand);
  formData.append("file", file);

  try {
    const startTime = performance.now();
    const res = await fetch("/api/admin/upload-tsv", {
      method: "POST",
      body: formData
    });
    const json = await res.json();
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);

    if (!json.ok) {
      if (resultBox) {
        resultBox.style.background = "#fef2f2";
        resultBox.style.border = "1px solid #fecaca";
        resultBox.style.color = "#991b1b";
        resultBox.innerHTML = `<strong>Upsert Gagal:</strong> ${json.error || "Terjadi kesalahan pada server saat memproses data."}`;
      }
      return;
    }

    if (resultBox) {
      resultBox.style.background = "#f0fdf4";
      resultBox.style.border = "1px solid #bbf7d0";
      resultBox.style.color = "#166534";
      resultBox.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; font-size: 13.5px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Upsert Parquet Berhasil (${brand})
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px; margin: 8px 0;">
          <div>Baris mentah TSV: <strong>${(json.total_raw || 0).toLocaleString("id-ID")}</strong></div>
          <div>Baris bersih diproses: <strong>${(json.clean_rows || json.rows_clean || 0).toLocaleString("id-ID")}</strong></div>
          <div>Baris baru di-append: <strong>${(json.inserted || json.appended || 0).toLocaleString("id-ID")}</strong></div>
          <div>Baris lama di-update: <strong>${(json.updated || 0).toLocaleString("id-ID")}</strong></div>
        </div>
        <div style="margin-top: 6px; font-size: 12.5px;">Total transaksi Parquet sekarang: <strong>${(json.total_rows_now || json.total_rows || 0).toLocaleString("id-ID")} baris</strong></div>
        <div style="font-size: 11px; color: #15803d; margin-top: 4px;">Durasi engine: ${json.elapsed_sec || json.duration_sec || duration} detik. Cache memori telah di-refresh.</div>
      `;
    }

    if (typeof loadAdminStatus === "function") {
      loadAdminStatus(true);
    }
  } catch (err) {
    if (resultBox) {
      resultBox.style.background = "#fef2f2";
      resultBox.style.border = "1px solid #fecaca";
      resultBox.style.color = "#991b1b";
      resultBox.innerHTML = `<strong>Koneksi Gagal:</strong> ${err.message}`;
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "Upload & Upsert ke Parquet Sekarang";
  }
}


function downloadStreamUrl(elementId) {
  const el = document.getElementById(elementId);
  if (!el || !el.value) return;
  let url = el.value.trim();
  try {
    const u = new URL(url);
    url = `${window.location.origin}${u.pathname}${u.search}`;
  } catch (e) {}

  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", "");
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

let streamActiveBrand = "ASTAGA";

function setStreamBrand(brand, triggerUpdate = true) {
  streamActiveBrand = brand || "ASTAGA";

  const btnAstaga = document.getElementById("stream-brand-btn-astaga");
  const btnOkipay = document.getElementById("stream-brand-btn-okipay");
  if (btnAstaga && btnOkipay) {
    if (streamActiveBrand === "ASTAGA") {
      btnAstaga.classList.add("active");
      btnOkipay.classList.remove("active");
    } else {
      btnOkipay.classList.add("active");
      btnAstaga.classList.remove("active");
    }
  }

  // Update dynamic brand badges on each download row
  const badges = document.querySelectorAll(".stream-brand-badge");
  badges.forEach((b) => {
    b.textContent = streamActiveBrand;
    if (streamActiveBrand === "OKIPAY") {
      b.style.background = "#fef2f2";
      b.style.color = "#dc2626";
      b.style.borderColor = "#fecaca";
    } else {
      b.style.background = "#eff6ff";
      b.style.color = "#2563eb";
      b.style.borderColor = "#bfdbfe";
    }
  });

  if (triggerUpdate) {
    updateStreamUrls();
  }
}

function updateStreamUrls() {
  const brand = streamActiveBrand || adminActiveBrand || "ASTAGA";
  const domain = (window.location.origin && !window.location.origin.includes("localhost") && !window.location.origin.includes("127.0.0.1"))
    ? window.location.origin
    : "https://depas.my.id";

  const yearSelect = document.getElementById("stream-year-select");
  const year = yearSelect ? yearSelect.value : "2026";

  const monthSelect = document.getElementById("stream-month-select");
  const monthVal = monthSelect ? monthSelect.value : "10";
  const monthParam = (monthVal === "ALL") ? "ALL" : `${year}-${monthVal}`;

  const elCsv = document.getElementById("stream-url-csv");
  if (elCsv) elCsv.value = `${domain}/api/export/transactions.csv?brand=${brand}&year=${year}&month=${monthParam}&key=depas2026`;

  const elParquet = document.getElementById("stream-url-parquet");
  if (elParquet) elParquet.value = `${domain}/api/export/transactions.parquet?brand=${brand}&year=${year}&month=${monthParam}&key=depas2026`;

  const elAgents = document.getElementById("stream-url-agents");
  if (elAgents) elAgents.value = `${domain}/api/export/agents.csv?brand=${brand}&key=depas2026`;

  const elCust = document.getElementById("stream-url-customers");
  if (elCust) elCust.value = `${domain}/api/export/customers.csv?brand=${brand}&key=depas2026`;

  const elProd = document.getElementById("stream-url-products");
  if (elProd) elProd.value = `${domain}/api/export/products.csv?brand=${brand}&key=depas2026`;

  const elFinance = document.getElementById("stream-url-finance");
  if (elFinance) elFinance.value = `${domain}/api/export/finance-rekap.xlsx?brand=${brand}&year=${year}&month=${monthParam}&key=depas2026`;
}

function copyStreamUrl(elementId) {
  const el = document.getElementById(elementId);
  if (!el || !el.value) return;
  const url = el.value.trim();
  const brand = streamActiveBrand || "ASTAGA";
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      alert(`Link Web ${brand} berhasil disalin ke clipboard!`);
    }).catch(() => {
      fallbackCopyStream(url, brand);
    });
  } else {
    fallbackCopyStream(url, brand);
  }
}

function fallbackCopyStream(text, brand) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    alert(`Link Web ${brand} berhasil disalin ke clipboard!`);
  } catch (e) {
    prompt(`Salin link ${brand} berikut:`, text);
  }
  document.body.removeChild(ta);
}

window.handleDirectTsvFileSelect = handleDirectTsvFileSelect;
window.setDirectTsvFile = setDirectTsvFile;
window.executeDirectTsvUpsert = executeDirectTsvUpsert;
window.setStreamBrand = setStreamBrand;
window.copyStreamUrl = copyStreamUrl;
window.downloadStreamUrl = downloadStreamUrl;
window.updateStreamUrls = updateStreamUrls;



// =========================================================================
// DIRECT RESELLER TSV UPLOADER
// =========================================================================

async function handleResellerTsvFileSelect(event) {
  const file = event && event.target && event.target.files && event.target.files[0];
  if (!file) return;

  const brandRadio = document.querySelector('input[name="reseller-upload-brand"]:checked');
  let brand = brandRadio ? brandRadio.value : "ASTAGA";

  // Auto-detect brand dari nama file
  const upper = file.name.toUpperCase();
  if (upper.includes("OKIPAY")) {
    brand = "OKIPAY";
    const r = document.querySelector('input[name="reseller-upload-brand"][value="OKIPAY"]');
    if (r) r.checked = true;
  } else if (upper.includes("ASTAGA")) {
    brand = "ASTAGA";
    const r = document.querySelector('input[name="reseller-upload-brand"][value="ASTAGA"]');
    if (r) r.checked = true;
  }

  const resultBox = document.getElementById("reseller-upload-result-box");
  if (resultBox) {
    resultBox.style.display = "block";
    resultBox.style.background = "#eff6ff";
    resultBox.style.border = "1px solid #bfdbfe";
    resultBox.style.color = "#1e40af";
    resultBox.innerHTML = `<strong>Memproses:</strong> Mengunggah <strong>${file.name}</strong> (${(file.size/1024/1024).toFixed(2)} MB) ke VPS &amp; memetakan pohon cabang...`;
  }

  const formData = new FormData();
  formData.append("brand", brand);
  formData.append("file", file);

  try {
    const startTime = performance.now();
    const res = await fetch("/api/admin/upload-reseller-tsv", {
      method: "POST",
      body: formData
    });
    const json = await res.json();
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);

    if (!json.ok) {
      if (resultBox) {
        resultBox.style.background = "#fef2f2";
        resultBox.style.border = "1px solid #fecaca";
        resultBox.style.color = "#991b1b";
        resultBox.innerHTML = `<strong>Sinkronisasi Gagal:</strong> ${json.error || "Terjadi kesalahan pada server saat memproses data."}`;
      }
      return;
    }

    if (resultBox) {
      resultBox.style.background = "#f0fdf4";
      resultBox.style.border = "1px solid #bbf7d0";
      resultBox.style.color = "#166534";
      resultBox.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; font-size: 13.5px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Sinkronisasi Master Reseller Berhasil (${brand})
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px; margin: 8px 0;">
          <div>Total Toko Induk (Agen): <strong>${(json.total_agents || 0).toLocaleString("id-ID")}</strong></div>
          <div>Total Seluruh Reseller: <strong>${(json.total_resellers || 0).toLocaleString("id-ID")}</strong></div>
        </div>
        <div style="font-size: 11px; color: #15803d; margin-top: 4px;">Durasi engine: ${json.elapsed_sec || duration} detik. Database SQLite &amp; Stream Customer telah di-refresh.</div>
      `;
    }

    if (typeof loadMasterAgents === "function") {
      loadMasterAgents();
    }
  } catch (err) {
    if (resultBox) {
      resultBox.style.background = "#fef2f2";
      resultBox.style.border = "1px solid #fecaca";
      resultBox.style.color = "#991b1b";
      resultBox.innerHTML = `<strong>Koneksi Gagal:</strong> ${err.message}`;
    }
  }
}

window.handleResellerTsvFileSelect = handleResellerTsvFileSelect;


// =====================================================================
// PUSAT TIKET ESKALASI AI (HELP ME PLEASE)
// =====================================================================
let adminTicketsCache = [];

async function loadAdminTickets() {
  const tbody = document.getElementById("tickets-table-body");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding: 30px; text-align: center; color: var(--text-muted);"><span class="spinner" style="display:inline-block; margin-right:8px;"></span>Memuat antrean tiket...</td></tr>`;
  }

  try {
    const res = await fetch("/api/admin/tickets");
    const json = await res.json();
    if (!json.ok) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #ef4444;">Gagal memuat tiket: ${json.error || 'Unknown error'}</td></tr>`;
      return;
    }

    adminTicketsCache = json.tickets || [];

    // Update stats
    const elTot = document.getElementById("stat-total-tickets");
    const elPend = document.getElementById("stat-pending-tickets");
    const elRes = document.getElementById("stat-resolved-tickets");
    const elBadge = document.getElementById("badge-ticket-count");

    if (elTot) elTot.innerText = json.total || 0;
    if (elPend) elPend.innerText = json.pending || 0;
    if (elRes) elRes.innerText = json.resolved || 0;

    if (elBadge) {
      if (json.pending > 0) {
        elBadge.innerText = json.pending;
        elBadge.style.display = "inline-block";
      } else {
        elBadge.style.display = "none";
      }
    }

    renderAdminTickets(adminTicketsCache);
  } catch (err) {
    console.error("Error loading tickets:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #ef4444;">Terjadi kesalahan jaringan saat mengambil tiket.</td></tr>`;
  }
}

function filterAdminTickets() {
  const sel = document.getElementById("filter-ticket-status");
  const val = sel ? sel.value : "ALL";
  if (val === "ALL") {
    renderAdminTickets(adminTicketsCache);
  } else {
    const filtered = adminTicketsCache.filter(t => (t.status || "PENDING") === val);
    renderAdminTickets(filtered);
  }
}

function renderAdminTickets(tickets) {
  const tbody = document.getElementById("tickets-table-body");
  if (!tbody) return;

  if (!tickets || tickets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
          <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted); opacity:0.5;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span style="font-weight:600; color:var(--text-main);">Belum Ada Tiket Eskalasi</span>
            <span style="font-size:12px;">Semua pertanyaan analisis Bossque di Telegram masih ter-cover oleh data snapshot resmi.</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  let html = "";
  tickets.forEach(t => {
    const isPending = (t.status || "PENDING") === "PENDING";
    const statusBadge = isPending
      ? `<span style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700; background:rgba(245, 158, 11, 0.12); color:#d97706; border:1px solid rgba(245, 158, 11, 0.25);">
           <span style="width:6px; height:6px; border-radius:50%; background:#d97706;"></span> PENDING
         </span>`
      : `<span style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700; background:rgba(16, 185, 129, 0.12); color:#059669; border:1px solid rgba(16, 185, 129, 0.25);">
           <span style="width:6px; height:6px; border-radius:50%; background:#059669;"></span> RESOLVED
         </span>`;

    const actionBtn = isPending
      ? `<button type="button" onclick="resolveAdminTicket('${t.ticket_id}')" style="padding:4px 10px; font-size:11.5px; font-weight:600; border-radius:6px; background:var(--primary); color:#ffffff; border:none; cursor:pointer;">
           Selesaikan
         </button>`
      : `<span style="font-size:11px; color:var(--text-muted);">Selesai</span>`;

    html += `
      <tr style="border-bottom: 1px solid var(--surface-border); transition: background 0.15s;">
        <td style="padding: 12px 16px; font-weight: 700; font-family: monospace; color: var(--primary);">
          ${t.ticket_id}
        </td>
        <td style="padding: 12px 16px;">
          <div style="font-weight: 600; color: var(--text-main);">${t.user_name || 'Bossque'}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${t.created_at || '-'}</div>
        </td>
        <td style="padding: 12px 16px; color: var(--text-main); max-width: 280px; word-break: break-word;">
          "${t.prompt || '-'}"
        </td>
        <td style="padding: 12px 16px; color: var(--text-muted); max-width: 280px; word-break: break-word;">
          <div style="font-weight: 600; color: var(--text-main);">${t.requirement || '-'}</div>
          ${t.resolution_note ? `<div style="font-size: 11px; color: #059669; margin-top: 3px;">Catatan: ${t.resolution_note}</div>` : ''}
        </td>
        <td style="padding: 12px 16px; text-align: center;">
          ${statusBadge}
        </td>
        <td style="padding: 12px 16px; text-align: right;">
          ${actionBtn}
        </td>
      </tr>`;
  });

  tbody.innerHTML = html;
}

async function resolveAdminTicket(ticketId) {
  if (!confirm(`Selesaikan tiket ${ticketId}? Tandai bahwa data sudah diracik di Data Center.`)) {
    return;
  }
  try {
    const res = await fetch("/api/admin/tickets/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticketId, note: "Data sudah diracik dan disuntikkan ke snapshot AI." })
    });
    const json = await res.json();
    if (json.ok) {
      await loadAdminTickets();
    } else {
      alert("Gagal menyelesaikan tiket: " + (json.error || "Unknown error"));
    }
  } catch (err) {
    alert("Terjadi kesalahan jaringan: " + err.message);
  }
}
