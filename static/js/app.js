// app.js — Single Shell Router & Navigation
// ── Online Public Mode & Admin Guard ──────────────────────────────────────────
(function initHostEnvironment() {
  const isOnlineHost = window.location.hostname === "depas.my.id" ||
                       window.location.hostname.includes("45.66.153.150") ||
                       window.location.hostname.includes("github.io");

  // Jika dibuka di online publik, sembunyikan menu Admin dan tombol dapur
  if (isOnlineHost) {
    const hideAdminNav = () => {
      const adminNav = document.getElementById("nav-admin-data");
      if (adminNav && adminNav.closest("li")) {
        adminNav.closest("li").style.display = "none";
      }
      // Sembunyikan label dapur
      document.querySelectorAll(".nav-label").forEach(el => {
        if (el.textContent.includes("Dapur") || el.textContent.includes("Administrasi")) {
          el.style.display = "none";
        }
      });
      // Tampilkan profil user & tombol logout untuk host online
      const userSec = document.getElementById("sidebar-user-section");
      if (userSec) {
        userSec.style.display = "flex";
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", hideAdminNav);
    } else {
      hideAdminNav();
    }
  }
})();

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
    window.location.replace("#analisa?tab=lain");
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

  // Redirect admin di Online Hosting (depas.my.id / publik) ke overview
  const isOnlineHost = window.location.hostname === "depas.my.id" || 
                       window.location.hostname.includes("45.66.153.150") ||
                       window.location.hostname.includes("github.io");
  if (isOnlineHost && hash === "#admin") {
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
