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

  const adminNav = document.getElementById("nav-admin-data");
  if (adminNav && adminNav.closest("li")) {
    adminNav.closest("li").style.display = isAdmin ? "block" : "none";
  }

  // Label Dapur Administrasi
  document.querySelectorAll(".nav-label").forEach(el => {
    if (el.textContent.includes("Dapur") || el.textContent.includes("Administrasi")) {
      el.style.display = isAdmin ? "block" : "none";
    }
  });

  // User Section di Sidebar
  const userSec = document.getElementById("sidebar-user-section");
  const usernameEl = document.getElementById("sidebar-username");
  const roleBadgeEl = document.getElementById("sidebar-user-role");

  if (userSec) {
    userSec.style.display = "flex";
  }
  if (usernameEl) {
    usernameEl.textContent = currentAuthUser.username || (isAdmin ? "admin" : "tamu");
  }
  if (roleBadgeEl) {
    if (isAdmin) {
      roleBadgeEl.textContent = "Admin";
      roleBadgeEl.style.background = "#eff6ff";
      roleBadgeEl.style.color = "#2563eb";
      roleBadgeEl.style.borderColor = "#bfdbfe";
    } else {
      roleBadgeEl.textContent = "Tamu";
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
  "#overview": {
    title: "Overview Dashboard",
    pageUrl: "./pages/home/index.html",
    scriptUrl: "./pages/home/home.js",
    initFn: "loadOverview"
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
    title: "Produk Fisik",
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
    title: "Survei AI & Reaktivasi",
    pageUrl: "./pages/survey/index.html",
    scriptUrl: "./pages/survey/survey.js",
    initFn: "loadSurveyPage"
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
  if (hash === "#settings") {
    window.location.replace("#admin?tab=system");
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
  if (hash === "#reseller") {
    window.location.replace("#agen?tab=reseller");
    return;
  }
  if (hash === "#harga") {
    window.location.replace("#produk?tab=harga");
    return;
  }
  if (window.location.hash.includes("#admin?tab=pivot")) {
    window.location.replace("#pivot");
    return;
  }

  // Proteksi Menu Admin: Hanya dapat diakses oleh Administrator
  const isLocal = currentAuthUser.is_local || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const isAdmin = isLocal || currentAuthUser.role === "admin";
  if (hash === "#admin" && !isAdmin) {
    alert("Akses ditolak: Menu Admin & Olah Data hanya dapat diakses oleh Administrator.");
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
    sidebar.classList.toggle("open");
    if (backdrop) backdrop.classList.toggle("active", sidebar.classList.contains("open"));
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
    sidebar.classList.remove("open");
    if (backdrop) backdrop.classList.remove("active");
  } else {
    document.documentElement.classList.add("sidebar-collapsed");
    localStorage.setItem("sidebar_collapsed", "true");
  }
}

// ─── THEME TOGGLE (DARK / LIGHT MODE) ──────────────────────
const SUN_SVG = `<svg class="theme-icon sun-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

const MOON_SVG = `<svg class="theme-icon moon-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

function getEffectiveTheme() {
  const currentAttr = document.documentElement.getAttribute("data-theme");
  if (currentAttr === "dark" || currentAttr === "light") {
    return currentAttr;
  }
  const saved = localStorage.getItem("theme_preference");
  if (saved === "dark" || saved === "light") {
    return saved;
  }
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function updateThemeToggleUI(theme) {
  const checkbox = document.getElementById("theme-toggle-checkbox");
  const iconContainer = document.getElementById("theme-toggle-icon");
  const labelText = document.getElementById("theme-toggle-text");

  const isDark = theme === "dark";
  if (checkbox) checkbox.checked = isDark;
  if (iconContainer) iconContainer.innerHTML = isDark ? MOON_SVG : SUN_SVG;
  if (labelText) labelText.textContent = isDark ? "Mode Gelap" : "Mode Terang";

  // Sync with settings page if function exists
  if (typeof window.updateThemeButtonActiveState === "function") {
    window.updateThemeButtonActiveState(theme);
  }
}
window.updateThemeToggleUI = updateThemeToggleUI;

function toggleAppTheme(isDark) {
  const theme = isDark ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme_preference", theme);
  updateThemeToggleUI(theme);

  // Dispatch custom event for charts or components that adapt dynamically
  window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
}
window.toggleAppTheme = toggleAppTheme;

function initThemeToggle() {
  const effectiveTheme = getEffectiveTheme();
  document.documentElement.setAttribute("data-theme", effectiveTheme);
  updateThemeToggleUI(effectiveTheme);

  const checkbox = document.getElementById("theme-toggle-checkbox");
  if (checkbox) {
    checkbox.addEventListener("change", (e) => {
      toggleAppTheme(e.target.checked);
    });
  }

  const toggleContainer = document.getElementById("sidebar-theme-toggle");
  if (toggleContainer) {
    toggleContainer.addEventListener("click", (e) => {
      // If clicking directly on or inside label.theme-switch, checkbox change event handles it
      if (e.target.closest(".theme-switch")) return;
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        toggleAppTheme(checkbox.checked);
      }
    });

    // Keyboard accessibility (Enter / Space)
    toggleContainer.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          toggleAppTheme(checkbox.checked);
        }
      }
    });
  }

  // Listen to system theme changes if user has no stored preference
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem("theme_preference")) {
        const newTheme = e.matches ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", newTheme);
        updateThemeToggleUI(newTheme);
      }
    });
  }
}

window.addEventListener("hashchange", navigate);
document.addEventListener("DOMContentLoaded", () => {
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

// ── Live Server Telemetry & Status Bar Pulse ────────────────────────────────
(function() {
  let isTerminalOpen = false;
  let pulseTimer = null;
  let lastLogHash = "";
  let userScrolledUp = false;

  function formatLogClass(msg) {
    if (msg.includes("[READ]")) return "log-read";
    if (msg.includes("[CACHE]")) return "log-cache";
    if (msg.includes("[OK]")) return "log-ok";
    if (msg.includes("[PROCESS]") || msg.includes("[BOOT]")) return "log-process";
    if (msg.includes("[READY]")) return "log-ready";
    if (msg.includes("[ERROR]") || msg.includes("Gagal")) return "log-error";
    return "log-info";
  }

  async function fetchServerPulse() {
    try {
      const res = await fetch("/api/system/pulse?t=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data || !data.ok) return;

      const dotEl = document.getElementById("status-pulse-dot");
      const badgeEl = document.getElementById("status-pulse-badge");
      const actionEl = document.getElementById("status-ticker-action");
      const detailEl = document.getElementById("status-ticker-detail");
      const uptimeEl = document.getElementById("status-uptime-text");
      const streamEl = document.getElementById("terminal-log-stream");

      const state = (data.state || "idle").toLowerCase();

      // Update dot & badge
      if (dotEl) {
        dotEl.className = "status-pulse-dot state-" + state;
      }
      if (badgeEl) {
        badgeEl.className = "status-pulse-badge state-" + state;
        badgeEl.textContent = state === "busy" ? "BUSY" : (state === "error" ? "ERR" : (state === "warning" ? "WARN" : "READY"));
      }

      // Update ticker text
      if (actionEl && data.action) {
        actionEl.textContent = data.action;
      }
      if (detailEl && data.detail) {
        detailEl.textContent = data.detail;
        detailEl.style.display = "inline";
      } else if (detailEl) {
        detailEl.style.display = "none";
      }

      // Update uptime
      if (uptimeEl && data.uptime) {
        uptimeEl.textContent = "Uptime: " + data.uptime;
      }

      // Update Terminal Drawer logs
      if (streamEl && Array.isArray(data.logs)) {
        const currentHash = JSON.stringify(data.logs);
        if (currentHash !== lastLogHash) {
          lastLogHash = currentHash;
          const isAtBottom = streamEl.scrollHeight - streamEl.scrollTop <= streamEl.clientHeight + 50;
          
          let html = "";
          data.logs.forEach(item => {
            const cls = formatLogClass(item.message || "");
            const ts = item.timestamp || "";
            const msg = (item.message || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            html += `<div class="terminal-log-row">
              <span class="terminal-log-time">[${ts}]</span>
              <span class="terminal-log-msg ${cls}">${msg}</span>
            </div>`;
          });
          streamEl.innerHTML = html;

          if (isAtBottom || !userScrolledUp) {
            streamEl.scrollTop = streamEl.scrollHeight;
          }
        }
      }

      // Adaptive polling interval: 1.2s when busy, 4s when idle
      const nextDelay = state === "busy" ? 1200 : 4000;
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(fetchServerPulse, nextDelay);

    } catch (err) {
      const dotEl = document.getElementById("status-pulse-dot");
      const badgeEl = document.getElementById("status-pulse-badge");
      if (dotEl) dotEl.className = "status-pulse-dot state-warning";
      if (badgeEl) {
        badgeEl.className = "status-pulse-badge state-warning";
        badgeEl.textContent = "OFFLINE";
      }
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(fetchServerPulse, 6000);
    }
  }

  function toggleTerminal(force) {
    const drawer = document.getElementById("server-terminal-drawer");
    const toggleBtn = document.getElementById("btn-toggle-terminal");
    if (!drawer) return;

    if (typeof force === "boolean") {
      isTerminalOpen = force;
    } else {
      isTerminalOpen = !isTerminalOpen;
    }

    drawer.style.display = isTerminalOpen ? "flex" : "none";
    if (toggleBtn) {
      if (isTerminalOpen) toggleBtn.classList.add("active");
      else toggleBtn.classList.remove("active");
    }

    if (isTerminalOpen) {
      const streamEl = document.getElementById("terminal-log-stream");
      if (streamEl) streamEl.scrollTop = streamEl.scrollHeight;
      userScrolledUp = false;
    }
  }

  function setupTerminalUI() {
    const toggleBtn = document.getElementById("btn-toggle-terminal");
    const closeBtn = document.getElementById("btn-close-terminal");
    const copyBtn = document.getElementById("btn-copy-terminal");
    const tickerWrap = document.getElementById("status-ticker-wrapper");
    const pulseWrap = document.getElementById("status-pulse-wrapper");
    const streamEl = document.getElementById("terminal-log-stream");

    if (toggleBtn) toggleBtn.addEventListener("click", () => toggleTerminal());
    if (closeBtn) closeBtn.addEventListener("click", () => toggleTerminal(false));
    if (tickerWrap) tickerWrap.addEventListener("click", () => toggleTerminal());
    if (pulseWrap) pulseWrap.addEventListener("click", () => toggleTerminal());

    if (streamEl) {
      streamEl.addEventListener("scroll", () => {
        const isAtBottom = streamEl.scrollHeight - streamEl.scrollTop <= streamEl.clientHeight + 40;
        userScrolledUp = !isAtBottom;
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        if (!streamEl) return;
        const rows = Array.from(streamEl.querySelectorAll(".terminal-log-row"))
          .map(r => r.innerText.trim())
          .join("\n");
        try {
          await navigator.clipboard.writeText(rows);
          const origHtml = copyBtn.innerHTML;
          copyBtn.innerHTML = `<span>Tersalin!</span>`;
          setTimeout(() => { copyBtn.innerHTML = origHtml; }, 1800);
        } catch (e) {
          console.warn("Gagal copy log:", e);
        }
      });
    }

    // Start polling immediately
    fetchServerPulse();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupTerminalUI);
  } else {
    setupTerminalUI();
  }
})();
