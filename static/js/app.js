// ── GLOBAL ENGINE LOADER CONTROLLER (SIMPLE CIRCLE FLOATING) ─────────────────
let engineLoadingCount = 0;
let engineLoadingTimer = null;

function showEngineLoader() {
  engineLoadingCount++;
  if (engineLoadingCount === 1) {
    clearTimeout(engineLoadingTimer);
    // Delay 150ms agar request super instan / cache tidak flickering
    engineLoadingTimer = setTimeout(() => {
      const loader = document.getElementById("engine-loader");
      if (loader && engineLoadingCount > 0) {
        loader.classList.add("active");
        loader.setAttribute("aria-hidden", "false");
      }
    }, 150);
  }
}
window.showEngineLoader = showEngineLoader;

function hideEngineLoader(force = false) {
  if (force) {
    engineLoadingCount = 0;
  } else {
    engineLoadingCount = Math.max(0, engineLoadingCount - 1);
  }
  if (engineLoadingCount === 0) {
    clearTimeout(engineLoadingTimer);
    const loader = document.getElementById("engine-loader");
    if (loader) {
      loader.classList.remove("active");
      loader.setAttribute("aria-hidden", "true");
    }
  }
}
window.hideEngineLoader = hideEngineLoader;

// Global Fetch Interceptor: otomatis tampil saat engine memproses data
(function() {
  if (window._engineFetchWrapped) return;
  window._engineFetchWrapped = true;
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url ? args[0].url : "");
    const options = args[1] || {};

    // Abaikan polling background berkala (services-status & auth polling)
    const isSilent = options.silent || (typeof url === "string" && (
      url.includes("/api/system/services-status") ||
      url.includes("/api/auth/status") ||
      url.includes("status.json")
    ));

    if (!isSilent) {
      showEngineLoader();
    }

    try {
      return await originalFetch.apply(this, args);
    } finally {
      if (!isSilent) {
        hideEngineLoader();
      }
    }
  };
})();

// app.js — Single Shell Router & Navigation
// ── Auth & Role-Based Access Control (RBAC) ──────────────────────────────────
let currentAuthUser = {
  authenticated: false,
  username: "Guest",
  role: "guest",
  is_local: false
};

let authCheckPromise = null;

async function checkAuthStatus(force = false) {
  if (authCheckPromise && !force) return authCheckPromise;

  authCheckPromise = (async () => {
    try {
      const res = await fetch("/api/auth/status?t=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          currentAuthUser = {
            authenticated: !!data.authenticated,
            username: data.username || "Guest",
            role: (data.role || "guest").toLowerCase(),
            is_local: !!data.is_local
          };
        }
      }
    } catch (e) {
      console.warn("Gagal memeriksa status auth:", e);
    }
    applyAuthUI();
    return currentAuthUser;
  })();

  return authCheckPromise;
}

function applyAuthUI() {
  const isLocal = currentAuthUser.is_local || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const isAdmin = isLocal || currentAuthUser.role === "admin";

  // Sembunyikan / Tampilkan seluruh item di bawah Admin & Setting jika bukan admin
  document.querySelectorAll(".nav-label-admin, .nav-item-admin").forEach(el => {
    el.style.display = isAdmin ? "block" : "none";
  });

  document.querySelectorAll(".nav-label").forEach(el => {
    if (el.textContent.includes("Admin & Setting") || el.textContent.includes("Dapur") || el.textContent.includes("Administrasi")) {
      el.style.display = isAdmin ? "block" : "none";
    }
  });

  const adminNav = document.getElementById("nav-admin-data");
  if (adminNav && adminNav.closest("li")) {
    adminNav.closest("li").style.display = isAdmin ? "block" : "none";
  }
  const pivotAdminNav = document.getElementById("nav-pivot-admin");
  if (pivotAdminNav && pivotAdminNav.closest("li")) {
    pivotAdminNav.closest("li").style.display = isAdmin ? "block" : "none";
  }
  const dailyNav = document.getElementById("nav-daily");
  if (dailyNav && dailyNav.closest("li")) {
    dailyNav.closest("li").style.display = "block";
  }
  const scoNav = document.getElementById("nav-sco");
  if (scoNav && scoNav.closest("li")) {
    scoNav.closest("li").style.display = "block";
  }

  // User Section di Sidebar
  const userSec = document.getElementById("sidebar-user-section");
  const usernameEl = document.getElementById("sidebar-username");
  const roleBadgeEl = document.getElementById("sidebar-user-role");

  if (userSec) {
    userSec.style.display = "flex";
  }
  if (usernameEl) {
    usernameEl.textContent = currentAuthUser.username || (isAdmin ? "Admin (Lokal)" : "Tamu");
  }
  if (roleBadgeEl) {
    if (isAdmin) {
      roleBadgeEl.textContent = "Admin";
      roleBadgeEl.style.background = "#eff6ff";
      roleBadgeEl.style.color = "#2563eb";
      roleBadgeEl.style.borderColor = "#bfdbfe";
    } else {
      roleBadgeEl.textContent = "Viewer";
      roleBadgeEl.style.background = "#f1f5f9";
      roleBadgeEl.style.color = "#475569";
      roleBadgeEl.style.borderColor = "#cbd5e1";
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkAuthStatus);
} else {
  checkAuthStatus();
}

const ROUTES = {
  "#admin": {
    title: "Admin & Olah Data",
    pageUrl: "./pages/admin/index.html",
    scriptUrl: "./pages/admin/admin.js",
    initFn: "loadAdmin"
  },
  "#pivot-admin": {
    title: "Pivot Admin",
    pageUrl: "./pages/pivot_admin/index.html",
    scriptUrl: "./pages/pivot_admin/pivot_admin.js",
    initFn: "loadPivotAdmin"
  },
  "#overview": {
    title: "Overview Dashboard",
    pageUrl: "./pages/home/index.html",
    scriptUrl: "./pages/home/home.js",
    initFn: "loadOverview"
  },
    "#yoy": {
    title: "Year on Year",
    pageUrl: "./pages/yoy/index.html",
    scriptUrl: "./pages/yoy/yoy.js",
    initFn: "loadYoY"
  },
  "#daily": {
    title: "Daily Summary Report",
    pageUrl: "./pages/daily/index.html",
    scriptUrl: "./pages/daily/daily.js",
    initFn: "loadDaily"
  },
  "#analisa": {
    title: "Dashboard Analisa",
    pageUrl: "./pages/analisa/index.html",
    scriptUrl: "./pages/analisa/analisa.js",
    initFn: "loadAnalisa"
  },
  "#sco": {
    title: "SCO Executive Suite",
    pageUrl: "./pages/sco/sco_view.html",
    scriptUrl: "./pages/sco/sco.js",
    initFn: "initScoView"
  },
  "#reseller": {
    title: "Agen & Reseller",
    pageUrl: "./pages/agen/index.html",
    scriptUrl: "./pages/agen/agen.js",
    initFn: "loadAgen"
  },
  "#agen": {
    title: "Agen & Reseller",
    pageUrl: "./pages/agen/index.html",
    scriptUrl: "./pages/agen/agen.js",
    initFn: "loadAgen"
  },
  "#produk": {
    title: "Rekap Fisik",
    pageUrl: "./pages/fisik/index.html",
    scriptUrl: "./pages/fisik/fisik.js",
    initFn: "loadFisik"
  },
  "#pivot": {
    title: "Pivot Transaksi Digital",
    pageUrl: "./pages/transaksi/index.html",
    scriptUrl: "./pages/transaksi/transaksi.js",
    initFn: "loadTransaksi"
  },
  "#survey": {
    title: "Survey Churn",
    pageUrl: "./pages/survey/index.html",
    scriptUrl: "./pages/survey/survey.js",
    initFn: "loadSurveyPage"
  }
,
  "#ewallet": {
    title: "E-Wallet Monitoring",
    pageUrl: "./pages/ewallet/index.html",
    scriptUrl: "./pages/ewallet/ewallet.js",
    initFn: "loadEwallet"
  },
  "#settings": {
    title: "Setting & Preferensi",
    pageUrl: "./pages/settings/index.html",
    scriptUrl: "./pages/settings/settings.js",
    initFn: "loadSettings"
  }
};

const loadedScripts = new Set();

function loadScript(url) {
  return new Promise((resolve, reject) => {
    // Cari dan hapus script lama jika nama file sama (abaikan query ?t=)
    const baseSrc = url.split("?")[0];
    const existing = Array.from(document.querySelectorAll("script")).find(s => s.src && s.src.includes(baseSrc));
    if (existing) {
      existing.remove();
    }

    const script = document.createElement("script");
    script.src = url;
    script.onload = () => {
      resolve();
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}
window.loadScript = loadScript;

function triggerBrandSwitchVisual(activeBrand, clickedEl, targetContainerId) {
  // Trigger soft content reveal fade
  const container = targetContainerId ? document.getElementById(targetContainerId) : (document.getElementById("content-area") || document.body);
  if (container) {
    container.classList.remove("brand-content-fade");
    void container.offsetWidth;
    container.classList.add("brand-content-fade");
    setTimeout(() => {
      container.classList.remove("brand-content-fade");
    }, 350);
  }
}
window.triggerBrandSwitchVisual = triggerBrandSwitchVisual;

async function navigate() {
  // Pastikan status autentikasi dari server sudah selesai diperiksa sebelum evaluasi hak akses rute
  await checkAuthStatus();

  let rawHash = window.location.hash || "#overview";
  let [hash] = rawHash.split("?");

  // Redirect legacy / bookmark routes to subtabs
  if (hash === "#transaksi") {
    window.location.replace("#admin?tab=pivot");
    return;
  }
  if (hash === "#analisa-distribusi") {
    window.location.replace("#analisa?tab=distribusi");
    return;
  }
  if (hash === "#analisa-service") {
    window.location.replace("#analisa?tab=service");
    return;
  }
  if (hash === "#analisa-supplier") {
    window.location.replace("#analisa?tab=supplier");
    return;
  }
  if (hash === "#analisa-profit") {
    window.location.replace("#analisa?tab=profit");
    return;
  }
  if (hash === "#analisa-lain") {
    window.location.replace("#analisa?tab=distribusi");
    return;
  }
  if (hash === "#reseller" || hash.startsWith("#reseller?")) {
    const qPart = hash.includes("?") ? hash.substring(hash.indexOf("?")) : "?tab=reseller";
    window.location.replace("#agen" + (qPart.includes("tab=") ? qPart : "?tab=reseller"));
    return;
  }
  if (hash === "#harga") {
    window.location.replace("#produk?tab=harga");
    return;
  }
  if (rawHash === "#agen?tab=fraud" || rawHash.includes("tab=fraud")) {
    window.location.replace("#ewallet");
    return;
  }
  if (window.location.hash.includes("#admin?tab=financial")) {
    window.location.replace("#pivot-admin");
    return;
  }
  if (window.location.hash.includes("#admin?tab=pivot")) {
    window.location.replace("#pivot-admin");
    return;
  }

  // Proteksi Menu Dapur Olah Data: Hanya dapat diakses oleh Administrator di Web EXE lokal
  const isLocal = currentAuthUser.is_local || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const isAdmin = isLocal || currentAuthUser.role === "admin";
  const adminOnlyRoutes = ["#admin", "#pivot-admin"];
  const isTargetAdminOnly = adminOnlyRoutes.some(r => hash === r || hash.startsWith(r + "?") || hash.startsWith(r + "/"));
  if (isTargetAdminOnly && !isAdmin) {
    alert("Akses ditolak: Menu Dapur Olah Data khusus dijalankan di Web EXE lokal.");
    window.location.replace("#overview");
    return;
  }

  if (!ROUTES[hash]) hash = "#overview";

  const route = ROUTES[hash];

  // Update Breadcrumb & Document Title
  document.getElementById("page-title").textContent = route.title;
  document.title = `${route.title} — Web Report`;

  // Update Active Link in Sidebar
  document.querySelectorAll(".nav-link").forEach(link => {
    const href = link.getAttribute("href");
    const [linkBase] = href ? href.split("?") : [""];
    if (
      linkBase === hash ||
      ((hash === "#agen" || hash === "#reseller") && (linkBase === "#reseller" || linkBase === "#agen")) ||
      (hash.startsWith("#analisa") && linkBase === "#analisa")
    ) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  const contentArea = document.getElementById("content-area");

  if (route.pageUrl) {
    contentArea.innerHTML = `<div class="loader">Memuat halaman...</div>`;
    try {
      const res = await fetch(route.pageUrl + "?t=" + Date.now());
      if (!res.ok) throw new Error("Gagal mengambil template halaman");
      const html = await res.text();
      contentArea.innerHTML = html;

      if (route.scriptUrl) {
        await loadScript(route.scriptUrl + "?t=" + Date.now());
        if (route.initFn && typeof window[route.initFn] === "function") {
          window[route.initFn]();
        }
      }
    } catch (err) {
      contentArea.innerHTML = `<div class="card placeholder-card"><h3>Terjadi Kesalahan</h3><p>${err.message}</p></div>`;
    }
  } else {
    contentArea.innerHTML = `
      <div class="card placeholder-card">
        <h3>${route.title}</h3>
        <p>${route.placeholder}</p>
      </div>
    `;
  }
}

function toggleSidebar() {
  const isMobile = window.innerWidth <= 768;
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");

  if (isMobile) {
    if (!sidebar) return;
    document.documentElement.classList.remove("sidebar-collapsed");
    const willOpen = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", willOpen);
    if (backdrop) backdrop.classList.toggle("active", willOpen);
    document.body.classList.toggle("sidebar-open", willOpen);
    document.body.style.overflow = willOpen ? "hidden" : "";
  } else {
    const isCollapsed = document.documentElement.classList.toggle("sidebar-collapsed");
    localStorage.setItem("sidebar_collapsed", isCollapsed ? "true" : "false");
  }
}

function closeSidebar() {
  const isMobile = window.innerWidth <= 768;
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");

  if (isMobile) {
    if (sidebar) sidebar.classList.remove("open");
    if (backdrop) backdrop.classList.remove("active");
    document.body.classList.remove("sidebar-open");
    document.body.style.overflow = "";
    document.documentElement.classList.remove("sidebar-collapsed");
  } else {
    document.documentElement.classList.add("sidebar-collapsed");
    localStorage.setItem("sidebar_collapsed", "true");
  }
}

// ─── THEME ENGINE (STYLE: MODERN/CLASSIC & MODE: DARK/LIGHT) ───────────
const SUN_SVG = `<svg class="theme-icon sun-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

const MOON_SVG = `<svg class="theme-icon moon-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

const MODERN_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;

const CLASSIC_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>`;

function getThemeConfig() {
  let style = localStorage.getItem("theme_style");
  let mode = localStorage.getItem("theme_mode");
  const legacyPref = localStorage.getItem("theme_preference");

  if (!style || !mode) {
    if (legacyPref === "classic" || legacyPref === "classic-light") {
      style = "classic";
      mode = "light";
    } else if (legacyPref === "classic-dark") {
      style = "classic";
      mode = "dark";
    } else if (legacyPref === "light" || legacyPref === "modern-light") {
      style = "modern";
      mode = "light";
    } else if (legacyPref === "dark" || legacyPref === "modern-dark") {
      style = "modern";
      mode = "dark";
    } else {
      style = "modern";
      mode = "dark";
    }
  }
  return { style, mode };
}

function applyTheme(style, mode) {
  if (style !== "modern" && style !== "classic") style = "modern";
  if (mode !== "dark" && mode !== "light") mode = "dark";

  const combo = `${style}-${mode}`;

  document.documentElement.setAttribute("data-theme-style", style);
  document.documentElement.setAttribute("data-theme-mode", mode);
  document.documentElement.setAttribute("data-theme", combo);

  localStorage.setItem("theme_style", style);
  localStorage.setItem("theme_mode", mode);
  localStorage.setItem("theme_preference", combo);

  updateThemeToggleUI();

  // Dispatch custom event for charts or components that adapt dynamically
  window.dispatchEvent(new CustomEvent("themechange", { detail: { style, mode, combo } }));

  // Otomatis re-render chart aktif agar warna datalabels & elemen chart sinkron
  try {
    if (typeof Chart !== "undefined" && Chart.instances) {
      Object.values(Chart.instances).forEach(c => {
        if (c && typeof c.update === "function") {
          c.update("none");
        }
      });
    }
  } catch (e) {
    console.debug("Chart instances update on themechange:", e);
  }
}
window.applyTheme = applyTheme;

// Helper global deteksi mode gelap yang akurat (mendukung data-theme-mode, data-theme, & system media)
function isDarkMode() {
  const mode = document.documentElement.getAttribute("data-theme-mode");
  if (mode) return mode === "dark";
  const theme = document.documentElement.getAttribute("data-theme") || "";
  if (theme.includes("dark")) return true;
  if (theme.includes("light")) return false;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
window.isDarkMode = isDarkMode;

function setThemeStyle(style) {
  const { mode } = getThemeConfig();
  applyTheme(style, mode);

  // Ambil status awal service Tunnel & AI serta refresh berkala
  fetchQuickServicesStatus();
  setInterval(fetchQuickServicesStatus, 20000);
}
window.setThemeStyle = setThemeStyle;

function setThemeMode(mode) {
  const { style } = getThemeConfig();
  applyTheme(style, mode);
}
window.setThemeMode = setThemeMode;

function toggleAppMode() {
  const { style, mode } = getThemeConfig();
  const nextMode = mode === "dark" ? "light" : "dark";
  applyTheme(style, nextMode);
}
window.toggleAppMode = toggleAppMode;

function setAppTheme(theme) {
  if (theme === "classic") {
    applyTheme("classic", "light");
  } else if (theme === "dark") {
    applyTheme("modern", "dark");
  } else if (theme === "light") {
    applyTheme("modern", "light");
  } else if (theme.includes("-")) {
    const [s, m] = theme.split("-");
    applyTheme(s, m);
  }
}
window.setAppTheme = setAppTheme;

function updateThemeToggleUI() {
  const { style, mode } = getThemeConfig();
  const checkbox = document.getElementById("theme-toggle-checkbox");
  const iconContainer = document.getElementById("theme-toggle-icon");
  const labelText = document.getElementById("theme-toggle-text");

  const isDark = mode === "dark";

  if (checkbox) checkbox.checked = isDark;
  if (iconContainer) iconContainer.innerHTML = isDark ? MOON_SVG : SUN_SVG;
  if (labelText) {
    const stylePrefix = style === "classic" ? "Classic" : "Modern";
    labelText.textContent = isDark ? `${stylePrefix} (Gelap)` : `${stylePrefix} (Terang)`;
  }

  // Sync with settings page if function exists
  if (typeof window.updateThemeButtonActiveState === "function") {
    window.updateThemeButtonActiveState();
  }

  // Sync dengan Quick Settings Panel di Sidebar
  updateQuickThemeUI();
}
window.updateThemeToggleUI = updateThemeToggleUI;

// ─── PENGATURAN CEPAT SIDEBAR (RINGKAS) ────────────────────────────────
function updateQuickThemeUI() {
  const { style, mode } = getThemeConfig();

  // 1. Mode Dark / Light
  const valMode = document.getElementById("quick-val-mode");
  const iconMode = document.getElementById("quick-icon-mode");
  const btnMode = document.getElementById("quick-btn-mode");
  const isDark = mode === "dark";
  if (valMode) valMode.textContent = isDark ? "Dark" : "Light";
  if (iconMode) iconMode.innerHTML = isDark ? MOON_SVG : SUN_SVG;
  if (btnMode) {
    btnMode.title = `Mode: ${isDark ? "Gelap (Klik untuk Ganti)" : "Terang (Klik untuk Ganti)"}`;
    btnMode.classList.toggle("active", isDark);
  }

  // 2. Style Modern / Classic
  const valStyle = document.getElementById("quick-val-style");
  const iconStyle = document.getElementById("quick-icon-style");
  const btnStyle = document.getElementById("quick-btn-style");
  const isClassic = style === "classic";
  if (valStyle) valStyle.textContent = isClassic ? "Classic" : "Modern";
  if (iconStyle) iconStyle.innerHTML = isClassic ? CLASSIC_SVG : MODERN_SVG;
  if (btnStyle) {
    btnStyle.title = `Tema: ${isClassic ? "Classic (Klik untuk Ganti)" : "Modern (Klik untuk Ganti)"}`;
    btnStyle.classList.toggle("active", isClassic);
  }
}
window.updateQuickThemeUI = updateQuickThemeUI;

function toggleQuickMode() {
  toggleAppMode();
}
window.toggleQuickMode = toggleQuickMode;

function toggleQuickStyle() {
  const { style, mode } = getThemeConfig();
  const nextStyle = style === "classic" ? "modern" : "classic";
  applyTheme(nextStyle, mode);
}
window.toggleQuickStyle = toggleQuickStyle;

function updateQuickServicesUI(data) {
  if (!data) return;

  // 3. Tunnel Status
  const isTunnel = data.tunnel && data.tunnel.running;
  const dotTunnel = document.getElementById("quick-dot-tunnel");
  const txtTunnel = document.getElementById("quick-text-tunnel");
  const btnTunnel = document.getElementById("quick-btn-tunnel");
  if (dotTunnel) {
    dotTunnel.className = "quick-dot " + (isTunnel ? "on" : "off");
  }
  if (txtTunnel) txtTunnel.textContent = isTunnel ? "On" : "Off";
  if (btnTunnel) {
    btnTunnel.classList.toggle("active", isTunnel);
    btnTunnel.title = `Cloudflare Tunnel (depas.my.id): ${isTunnel ? "AKTIF" : "OFF"} (Klik untuk Toggle)`;
  }

  // 4. AI Bot Status
  const isAi = data.ai && data.ai.running;
  const dotAi = document.getElementById("quick-dot-ai");
  const txtAi = document.getElementById("quick-text-ai");
  const btnAi = document.getElementById("quick-btn-ai");
  if (dotAi) {
    dotAi.className = "quick-dot " + (isAi ? "on" : "off");
  }
  if (txtAi) txtAi.textContent = isAi ? "On" : "Off";
  if (btnAi) {
    btnAi.classList.toggle("active", isAi);
    btnAi.title = `AI Assistant Bot: ${isAi ? "AKTIF" : "OFF"} (Klik untuk Toggle)`;
  }
}
window.updateQuickServicesUI = updateQuickServicesUI;

async function fetchQuickServicesStatus() {
  try {
    const res = await fetch("/api/system/services-status?t=" + Date.now());
    const json = await res.json();
    if (json.ok) updateQuickServicesUI(json);
  } catch (e) {
    // Silent ignore
  }
}
window.fetchQuickServicesStatus = fetchQuickServicesStatus;

async function toggleQuickTunnel() {
  const dotTunnel = document.getElementById("quick-dot-tunnel");
  const txtTunnel = document.getElementById("quick-text-tunnel");
  if (dotTunnel) dotTunnel.className = "quick-dot busy";
  if (txtTunnel) txtTunnel.textContent = "...";
  try {
    const res = await fetch("/api/system/services-toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "tunnel", action: "toggle" })
    });
    const json = await res.json();
    if (json.ok) updateQuickServicesUI(json);
  } catch (e) {
    fetchQuickServicesStatus();
  }
}
window.toggleQuickTunnel = toggleQuickTunnel;

async function toggleQuickAi() {
  const dotAi = document.getElementById("quick-dot-ai");
  const txtAi = document.getElementById("quick-text-ai");
  if (dotAi) dotAi.className = "quick-dot busy";
  if (txtAi) txtAi.textContent = "...";
  try {
    const res = await fetch("/api/system/services-toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "ai", action: "toggle" })
    });
    const json = await res.json();
    if (json.ok) updateQuickServicesUI(json);
  } catch (e) {
    fetchQuickServicesStatus();
  }
}
window.toggleQuickAi = toggleQuickAi;

function initThemeToggle() {
  const { style, mode } = getThemeConfig();
  applyTheme(style, mode);

  const checkbox = document.getElementById("theme-toggle-checkbox");
  if (checkbox) {
    checkbox.addEventListener("change", () => {
      toggleAppMode();
    });
  }

  const toggleContainer = document.getElementById("sidebar-theme-toggle");
  if (toggleContainer) {
    toggleContainer.addEventListener("click", (e) => {
      if (e.target.closest(".theme-switch")) return;
      toggleAppMode();
    });

    // Keyboard accessibility (Enter / Space)
    toggleContainer.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleAppMode();
      }
    });
  }

  // Listen to system theme changes if user has no explicit mode preference
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem("theme_mode")) {
        const { style } = getThemeConfig();
        applyTheme(style, e.matches ? "dark" : "light");
      }
    });
  }
}

// ── Hash Change & DOMContentLoaded ─────────────────────────────────────────

window.addEventListener("hashchange", navigate);
document.addEventListener("DOMContentLoaded", () => {
  // Mobile protection: ensure sidebar-collapsed is removed so drawer is full & readable
  if (window.innerWidth <= 768) {
    document.documentElement.classList.remove("sidebar-collapsed");
  }
  if (!window.location.hash) {
    window.location.hash = "#overview";
  }

  // Initialize Theme Switch Toggle
  initThemeToggle();

  // Bind Sidebar Toggle & Collapse
  const btnToggle = document.getElementById("btn-toggle-sidebar");
  if (btnToggle) btnToggle.addEventListener("click", toggleSidebar);

  const btnCollapse = document.getElementById("btn-collapse-sidebar");
  if (btnCollapse) btnCollapse.addEventListener("click", toggleSidebar);

  // Logo juga bisa diklik untuk toggle sidebar (expand/collapse)
  const brandIcon = document.querySelector(".brand-header .brand-icon");
  if (brandIcon) {
    brandIcon.style.cursor = "pointer";
    brandIcon.addEventListener("click", toggleSidebar);
  }

  const backdrop = document.getElementById("sidebar-backdrop");
  if (backdrop) backdrop.addEventListener("click", closeSidebar);

  // Mobile Topbar Theme Toggle Button
  const btnMobileTheme = document.getElementById("btn-mobile-theme-toggle");
  if (btnMobileTheme) {
    btnMobileTheme.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
      toggleAppTheme(currentTheme !== "dark");
    });
  }

  // Handle window resize between mobile and desktop
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      const sidebar = document.getElementById("sidebar");
      const backdrop = document.getElementById("sidebar-backdrop");
      if (sidebar) sidebar.classList.remove("open");
      if (backdrop) backdrop.classList.remove("active");
      document.body.classList.remove("sidebar-open");
      document.body.style.overflow = "";
    } else {
      document.documentElement.classList.remove("sidebar-collapsed");
    }
  });

  // Global Keyboard Shortcuts: F5 / Ctrl+R untuk refresh di mode desktop app
  window.addEventListener("keydown", (e) => {
    if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) {
      e.preventDefault();
      window.location.reload();
    }
  });

  // Auto-close mobile drawer on nav click
  document.querySelectorAll(".nav-link, .nav-sub-link").forEach(link => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  });

  navigate();
});

/**
 * Smart file saver compatible with pywebview (Desktop App) and Standard Web Browsers
 * @param {string} filename - Nama file beserta ekstensi (misal: "laporan.png", "data.csv")
 * @param {string|Blob} content - String (text/csv/base64 dataURL) atau objek Blob
 * @param {string} mimeType - MIME type file (misal: "image/png", "text/csv")
 */
window.saveFileSmart = async function(filename, content, mimeType = "application/octet-stream") {
  // 1. Cek apakah berjalan di dalam pywebview desktop dengan native save_file API
  if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.save_file === 'function') {
    try {
      let payload = content;
      let isBase64 = false;

      if (typeof content === 'string' && content.startsWith('data:')) {
        payload = content;
        isBase64 = true;
      } else if (content instanceof Blob) {
        payload = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(content);
        });
        isBase64 = true;
      } else if (typeof content === 'string') {
        payload = content;
        isBase64 = false;
      }

      const res = await window.pywebview.api.save_file(filename, payload, isBase64);
      if (res && res.success) {
        return res;
      }
      if (res && res.cancelled) {
        return res;
      }
    } catch (err) {
      console.warn("[saveFileSmart] Native dialog error, fallback ke standard download:", err);
    }
  }

  // 2. Fallback Standard Browser Download (<a download>)
  let url = content;
  let revoke = false;

  if (content instanceof Blob) {
    url = URL.createObjectURL(content);
    revoke = true;
  } else if (typeof content === 'string' && !content.startsWith('data:') && !content.startsWith('http') && !content.startsWith('blob:')) {
    const blob = new Blob([content], { type: mimeType });
    url = URL.createObjectURL(blob);
    revoke = true;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (revoke) {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  return { success: true };
};

/**
 * Smart URL downloader for backend endpoints (e.g. /api/admin/agents/export)
 */
window.downloadUrlSmart = function(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  if (filename) link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
