// pages/settings/settings.js — Logic & Interactivity for Sistem & Pengaturan

let _systemDataCache = null;

async function loadSettings() {
  console.log("[SETTINGS] Memuat modul Sistem & Pengaturan...");
  initThemeButtons();
  await fetchSystemInfo();
}

async function fetchSystemInfo() {
  try {
    const res = await fetch("/api/system/info?year=2026&t=" + Date.now());
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Gagal memuat status sistem");

    _systemDataCache = json.data;
    renderFreshnessCards(_systemDataCache.brands);
    renderMasterFilesTable(_systemDataCache.master_files);
    renderSummaryPlatform(_systemDataCache);
  } catch (err) {
    console.error("[SETTINGS] Error fetch system info:", err);
    const container = document.getElementById("freshness-cards-container");
    if (container) {
      container.innerHTML = `
        <div class="card-box" style="padding: 24px; color: var(--negative); text-align: center; grid-column: 1 / -1;">
          <strong>Gagal memuat informasi sistem:</strong> ${err.message}
        </div>
      `;
    }
  }
}

function renderFreshnessCards(brands) {
  const container = document.getElementById("freshness-cards-container");
  if (!container || !brands) return;

  const brandKeys = ["ASTAGA", "OKIPAY"];
  let html = "";

  brandKeys.forEach(key => {
    const b = brands[key] || {};
    const isAstaga = key === "ASTAGA";
    const brandClass = isAstaga ? "astaga" : "okipay";
    const themeColor = isAstaga ? "#2563eb" : "#0891b2";
    const bgBadge = isAstaga ? "#eff6ff" : "#ecfeff";

    const totalTrx = (b.total_rows || 0).toLocaleString("id-ID");
    const suksesTrx = (b.sukses_rows || 0).toLocaleString("id-ID");
    const pctSukses = b.total_rows > 0 ? ((b.sukses_rows / b.total_rows) * 100).toFixed(1) + "%" : "0%";

    const periodsHtml = (b.active_periods || [])
      .map(p => `<span class="period-pill">${p}</span>`)
      .join(" ");

    html += `
      <div class="freshness-card ${brandClass}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <span class="badge" style="background: ${bgBadge}; color: ${themeColor}; font-weight: 700; font-size: 11.5px; border: 1px solid currentColor;">
              ${key}
            </span>
            <div style="font-size: 17px; font-weight: 700; color: var(--text-main); margin-top: 6px;">
              Transaksional ${key} 2026
            </div>
          </div>
          <span class="badge" style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; font-weight: 600;">
            ${b.status || 'Online'}
          </span>
        </div>

        <!-- CUT OFF TIMESTAMP HERO -->
        <div style="background: var(--table-header); border: 1px solid var(--surface-border); border-radius: 8px; padding: 12px 14px;">
          <div style="font-size: 11.5px; text-transform: uppercase; font-weight: 600; color: var(--text-muted); letter-spacing: 0.3px;">
            Batas Cut-Off Data (Transaksi Terakhir)
          </div>
          <div style="font-size: 15px; font-weight: 700; font-family: var(--font-mono); color: var(--text-main); margin-top: 3px;">
            ${b.cut_off_date || '-'}
          </div>
        </div>

        <!-- QUICK STATS -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
          <div style="padding: 10px; border-radius: 8px; border: 1px solid var(--surface-border); background: var(--surface);">
            <div style="font-size: 11px; color: var(--text-muted);">Total Baris Transaksi</div>
            <div style="font-weight: 700; font-family: var(--font-mono); font-size: 14.5px; color: var(--text-main); margin-top: 2px;">
              ${totalTrx}
            </div>
            <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">
              Sukses: <strong>${suksesTrx}</strong> (${pctSukses})
            </div>
          </div>

          <div style="padding: 10px; border-radius: 8px; border: 1px solid var(--surface-border); background: var(--surface);">
            <div style="font-size: 11px; color: var(--text-muted);">Customer & Produk Terdaftar</div>
            <div style="font-weight: 700; font-family: var(--font-mono); font-size: 14.5px; color: var(--text-main); margin-top: 2px;">
              ${(b.master_reseller_count || 0).toLocaleString("id-ID")} Cust
            </div>
            <div style="font-size: 10.5px; color: #16a34a; margin-top: 2px;">
              ${(b.master_prod_count || 0).toLocaleString("id-ID")} Produk Aktif
            </div>
          </div>
        </div>

        <!-- PERIODE AKTIF -->
        <div>
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">
            Periode Transaksi Aktif Terkalkulasi:
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${periodsHtml}
          </div>
        </div>

      </div>
    `;
  });

  container.innerHTML = html;
}

function renderMasterFilesTable(masterFiles) {
  const tbody = document.getElementById("master-files-tbody");
  if (!tbody || !masterFiles) return;

  let allOptimal = true;

  let html = masterFiles.map(f => {
    if (!f.cache_synced) allOptimal = false;

    const badgeColor = f.cache_synced ? "#16a34a" : (f.exists ? "#d97706" : "#dc2626");
    const badgeBg = f.cache_synced ? "#f0fdf4" : (f.exists ? "#fffbeb" : "#fef2f2");
    const badgeBorder = f.cache_synced ? "#bbf7d0" : (f.exists ? "#fef3c7" : "#fecaca");

    return `
      <tr style="border-bottom: 1px solid var(--surface-border); transition: background 0.1s ease;">
        <td style="padding: 12px 16px; font-weight: 600; font-family: var(--font-mono); color: var(--text-main);">
          ${f.name}
        </td>
        <td style="padding: 12px 16px;">
          <div style="font-weight: 600; color: var(--text-main);">${f.role}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">${f.category}</div>
        </td>
        <td style="padding: 12px 16px; text-align: right; font-family: var(--font-mono); font-weight: 600;">
          ${f.size}
        </td>
        <td style="padding: 12px 16px; font-family: var(--font-mono); font-size: 12px; color: var(--text-main);">
          ${f.last_modified}
        </td>
        <td style="padding: 12px 16px; text-align: center;">
          <span class="badge" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; font-weight: 700;">
            ${f.status_badge}
          </span>
        </td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = html;

  const auditBadge = document.getElementById("master-audit-badge");
  if (auditBadge) {
    if (allOptimal) {
      auditBadge.style.background = "#f0fdf4";
      auditBadge.style.color = "#16a34a";
      auditBadge.style.borderColor = "#bbf7d0";
      auditBadge.textContent = "100% Selaras (0 Anomali)";
    } else {
      auditBadge.style.background = "#fffbeb";
      auditBadge.style.color = "#d97706";
      auditBadge.style.borderColor = "#fef3c7";
      auditBadge.textContent = "Perlu Sinkronisasi";
    }
  }
}

function renderSummaryPlatform(data) {
  const infoTotalTrx = document.getElementById("info-total-trx");
  if (infoTotalTrx && data.summary) {
    infoTotalTrx.textContent = (data.summary.total_transactions || 0).toLocaleString("id-ID") + " Transaksi";
  }
}

// ─── USER PREFERENCES (THEME & DEFAULT BRANCH) ───────────────────────────────

function initThemeButtons() {
  const currentTheme = localStorage.getItem("theme_preference") || (
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  updateThemeButtonActiveState(currentTheme);
}

function updateThemeButtonActiveState(theme) {
  const lightBtn = document.getElementById("theme-light-btn");
  const darkBtn = document.getElementById("theme-dark-btn");
  if (lightBtn) lightBtn.classList.toggle("active", theme === "light");
  if (darkBtn) darkBtn.classList.toggle("active", theme === "dark");
}
window.updateThemeButtonActiveState = updateThemeButtonActiveState;

function setAppTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme_preference", theme);
  updateThemeButtonActiveState(theme);
  if (typeof window.updateThemeToggleUI === "function") {
    window.updateThemeToggleUI(theme);
  }
}

async function refreshSystemData(btn) {
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = "0.6";
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="animation: spin 0.8s linear infinite;">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      <span>Memperbarui...</span>
    `;
  }

  await fetchSystemInfo();

  if (btn) {
    setTimeout(() => {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        <span>Perbarui Status</span>
      `;
    }, 400);
  }
}

// Global exports for shell router & admin integration
window.loadSettings = loadSettings;
window.refreshSystemData = refreshSystemData;
window.setAppTheme = setAppTheme;

