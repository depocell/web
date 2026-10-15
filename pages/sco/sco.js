// pages/sco/sco.js — Controller untuk Modul SCO Executive Suite

async function initScoView() {
  console.log("[SCO] Initialized SCO view controller.");
  // Auto-check: jika data_sco.json stale → regenerate otomatis
  await autoCheckSco();
}

async function autoCheckSco() {
  const banner = document.getElementById("sco-status-banner");
  const frame = document.getElementById("sco-app-frame");
  const btn = document.getElementById("btn-sco-generate");
  const label = document.getElementById("label-sco-calc");

  try {
    // 1. Cek apakah ada data transaksi baru (instan < 0.05s)
    const checkRes = await fetch("/api/sco/check?check_only=1");
    const checkJson = await checkRes.json();
    if (!checkJson.ok || !checkJson.stale) {
      if (banner) banner.style.display = "none";
      return;
    }

    // 2. Data stale -> Tampilkan banner "Sedang meng-update..." secara jelas & visual
    if (banner) {
      banner.style.display = "flex";
      banner.style.alignItems = "center";
      banner.style.gap = "12px";
      banner.style.background = "#eff6ff";
      banner.style.border = "1px solid #bfdbfe";
      banner.style.color = "#1e40af";
      banner.style.padding = "12px 18px";
      banner.innerHTML = `
        <span style="display:inline-block; width:18px; height:18px; border:2.5px solid #bfdbfe; border-top-color:#2563eb; border-radius:50%; animation:sco-spin 0.8s linear infinite; flex-shrink:0;"></span>
        <div>
          <div style="font-size:13.5px; font-weight:700;">Sedang Meng-update Data SCO...</div>
          <div style="font-size:12px; color:#3b82f6; margin-top:2px;">Terdeteksi data transaksi baru dari server. Sistem sedang menyinkronkan laporan KPI & performa agen (mohon tunggu sebentar).</div>
        </div>
      `;
    }
    if (btn) btn.disabled = true;
    if (label) label.textContent = "Meng-update...";

    // 3. Jalankan regenerasi data
    const res = await fetch("/api/sco/generate", { method: "POST" });
    const json = await res.json();

    if (json.ok) {
      if (banner) {
        banner.style.display = "flex";
        banner.style.alignItems = "center";
        banner.style.gap = "10px";
        banner.style.background = "#dcfce7";
        banner.style.border = "1px solid rgba(22, 163, 74, 0.25)";
        banner.style.color = "#15803d";
        banner.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #16a34a; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><polyline points="9 12 11 14 15 10"></polyline></svg>
          <div>
            <div style="font-size:13.5px; font-weight:700;">Data SCO Berhasil Diperbarui!</div>
            <div style="font-size:12px; color:#16a34a; margin-top:1px;">Cutoff transaksi s/d: <strong>${json.cutoff_date || '-'}</strong>. Tampilan dashboard telah disinkronkan.</div>
          </div>
        `;
      }
      // Reload iframe agar membaca data_sco.json terbaru
      if (frame) {
        frame.src = "/pages/sco/index.html?t=" + Date.now();
      }
      // Auto-hide banner setelah 6 detik
      setTimeout(() => { if (banner) banner.style.display = "none"; }, 6000);
    } else {
      throw new Error(json.error || "Gagal meng-update data SCO");
    }
  } catch (err) {
    if (banner) {
      banner.style.display = "flex";
      banner.style.alignItems = "center";
      banner.style.gap = "8px";
      banner.style.background = "#fee2e2";
      banner.style.border = "1px solid rgba(239, 68, 68, 0.25)";
      banner.style.color = "#b91c1c";
      banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #b91c1c; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><div><strong>Gagal meng-update data SCO:</strong> ${err.message}</div>`;
    }
  } finally {
    if (btn) btn.disabled = false;
    if (label) label.textContent = "Refresh (Parquet)";
  }
}

async function handleScoGenerate() {
  const btn = document.getElementById("btn-sco-generate");
  const label = document.getElementById("label-sco-calc");
  const banner = document.getElementById("sco-status-banner");
  const frame = document.getElementById("sco-app-frame");

  if (btn) btn.disabled = true;
  if (label) label.textContent = "Menghitung...";
  if (banner) {
    banner.style.display = "flex";
    banner.style.alignItems = "center";
    banner.style.gap = "12px";
    banner.style.background = "#eff6ff";
    banner.style.border = "1px solid #bfdbfe";
    banner.style.color = "#1e40af";
    banner.style.padding = "12px 18px";
    banner.innerHTML = `
      <span style="display:inline-block; width:18px; height:18px; border:2.5px solid #bfdbfe; border-top-color:#2563eb; border-radius:50%; animation:sco-spin 0.8s linear infinite; flex-shrink:0;"></span>
      <div>
        <div style="font-size:13.5px; font-weight:700;">Sedang Meng-update Data SCO...</div>
        <div style="font-size:12px; color:#3b82f6; margin-top:2px;">Memproses kalkulasi transaksi Parquet, KPI, dan rute agen SCO...</div>
      </div>
    `;
  }

  try {
    const res = await fetch("/api/sco/generate", { method: "POST" });
    const json = await res.json();

    if (json.ok) {
      if (banner) {
        banner.style.display = "flex";
        banner.style.alignItems = "center";
        banner.style.gap = "10px";
        banner.style.background = "#dcfce7";
        banner.style.border = "1px solid rgba(22, 163, 74, 0.25)";
        banner.style.color = "#15803d";
        banner.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #16a34a; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><polyline points="9 12 11 14 15 10"></polyline></svg>
          <div>
            <div style="font-size:13.5px; font-weight:700;">Data SCO Berhasil Dihitung Ulang!</div>
            <div style="font-size:12px; color:#16a34a; margin-top:1px;">Cutoff s/d: <strong>${json.cutoff_date || '-'}</strong>. Tampilan diperbarui.</div>
          </div>
        `;
      }
      // Reload iframe agar membaca data_sco.json terbaru
      if (frame) {
        frame.src = "/pages/sco/index.html?t=" + Date.now();
      }
      setTimeout(() => { if (banner) banner.style.display = "none"; }, 6000);
    } else {
      throw new Error(json.error || "Gagal meng-generate data SCO");
    }
  } catch (err) {
    if (banner) {
      banner.style.display = "flex";
      banner.style.alignItems = "center";
      banner.style.gap = "8px";
      banner.style.background = "#fee2e2";
      banner.style.border = "1px solid rgba(239, 68, 68, 0.25)";
      banner.style.color = "#b91c1c";
      banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #b91c1c; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><div><strong>Gagal:</strong> ${err.message}</div>`;
    }
  } finally {
    if (btn) btn.disabled = false;
    if (label) label.textContent = "Refresh (Parquet)";
  }
}

async function handleScoPush() {
  const btn = document.getElementById("btn-sco-push");
  const label = document.getElementById("label-sco-push");
  const banner = document.getElementById("sco-status-banner");

  if (btn) btn.disabled = true;
  if (label) label.textContent = "Pushing to GitHub...";
  if (banner) {
    banner.style.display = "flex";
    banner.style.alignItems = "center";
    banner.style.gap = "8px";
    banner.style.background = "#e0f2fe";
    banner.style.border = "1px solid rgba(2, 132, 199, 0.25)";
    banner.style.color = "#0369a1";
    banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #0284c7; flex-shrink: 0;"><path d="M16 16l1.5-1.5A4.95 4.95 0 0 0 19 11a5 5 0 0 0-9.9-1A4 4 0 0 0 2 14a4 4 0 0 0 4 4h10"></path><polyline points="12 12 12 21"></polyline><polyline points="8 17 12 21 16 17"></polyline></svg><div>Sedang melakukan commit dan push ke repositori GitHub Pages...</div>`;
  }

  try {
    const res = await fetch("/api/sco/push", { method: "POST" });
    const json = await res.json();

    if (json.ok) {
      if (banner) {
        banner.style.display = "flex";
        banner.style.alignItems = "center";
        banner.style.gap = "8px";
        banner.style.background = "#dcfce7";
        banner.style.border = "1px solid rgba(22, 163, 74, 0.25)";
        banner.style.color = "#15803d";
        banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #16a34a; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><polyline points="9 12 11 14 15 10"></polyline></svg><div><strong>${json.message || "Berhasil push ke GitHub!"}</strong> (${json.timestamp || "Baru saja"}). Live di <a href="https://depocell.github.io/SCO/" target="_blank" style="color: #15803d; font-weight: 700; text-decoration: underline;">https://depocell.github.io/SCO/</a></div>`;
      }
    } else {
      throw new Error(json.error || "Gagal push ke GitHub");
    }
  } catch (err) {
    if (banner) {
      banner.style.display = "flex";
      banner.style.alignItems = "center";
      banner.style.gap = "8px";
      banner.style.background = "#fee2e2";
      banner.style.border = "1px solid rgba(239, 68, 68, 0.25)";
      banner.style.color = "#b91c1c";
      banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #b91c1c; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><div><strong>Push Gagal:</strong> ${err.message}</div>`;
    }
  } finally {
    if (btn) btn.disabled = false;
    if (label) label.textContent = "Push ke GitHub";
  }
}

async function handleScoDownloadPng() {
  const btn = document.getElementById("btn-sco-download");
  const label = document.getElementById("label-sco-download");
  const banner = document.getElementById("sco-status-banner");
  const frame = document.getElementById("sco-app-frame");

  if (btn) btn.disabled = true;
  if (label) label.textContent = "Mengambil foto...";

  try {
    if (!frame || !frame.contentWindow || !frame.contentDocument) {
      throw new Error("Iframe SCO belum siap untuk diambil gambarnya.");
    }

    const iframeDoc = frame.contentDocument || frame.contentWindow.document;
    const targetEl = iframeDoc.querySelector(".app-main") || iframeDoc.querySelector("main") || iframeDoc.body;

    if (!targetEl) {
      throw new Error("Konten laporan tidak ditemukan.");
    }

    // Pastikan html2canvas tersedia
    const html2canvasFn = window.html2canvas || frame.contentWindow.html2canvas;
    if (!html2canvasFn) {
      throw new Error("Library html2canvas belum dimuat.");
    }

    if (banner) {
      banner.style.display = "flex";
      banner.style.alignItems = "center";
      banner.style.gap = "8px";
      banner.style.background = "#e0f2fe";
      banner.style.border = "1px solid rgba(2, 132, 199, 0.25)";
      banner.style.color = "#0369a1";
      banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #0284c7; flex-shrink: 0;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg><div>Sedang merender screenshot potret HD...</div>`;
    }

    let canvas;
    if (frame.contentWindow && typeof frame.contentWindow.captureReportCanvas === 'function') {
      canvas = await frame.contentWindow.captureReportCanvas();
    } else {
      const html2canvasFn = frame.contentWindow.html2canvas || window.html2canvas;
      if (!html2canvasFn) {
        throw new Error("Library html2canvas belum dimuat.");
      }
      const isDark = (iframeDoc.documentElement.getAttribute('data-theme') === 'dark') || (iframeDoc.body && iframeDoc.body.classList.contains('dark-theme'));
      canvas = await html2canvasFn(targetEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: isDark ? "#0b1120" : "#ffffff",
        windowWidth: 760
      });
    }

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const filename = `Laporan_SCO_${dateStr}.png`;

    const dataUrl = canvas.toDataURL("image/png");
    if (typeof window.saveFileSmart === "function") {
      await window.saveFileSmart(filename, dataUrl, "image/png");
    } else {
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    }

    if (banner) {
      banner.style.display = "flex";
      banner.style.alignItems = "center";
      banner.style.gap = "8px";
      banner.style.background = "#dcfce7";
      banner.style.border = "1px solid rgba(22, 163, 74, 0.25)";
      banner.style.color = "#15803d";
      banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #16a34a; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><polyline points="9 12 11 14 15 10"></polyline></svg><div><strong>Berhasil mengunduh gambar!</strong> Disimpan sebagai: <strong>${filename}</strong></div>`;
      setTimeout(() => { if (banner) banner.style.display = "none"; }, 5000);
    }
  } catch (err) {
    console.error("[SCO Download Error]", err);
    if (banner) {
      banner.style.display = "flex";
      banner.style.alignItems = "center";
      banner.style.gap = "8px";
      banner.style.background = "#fee2e2";
      banner.style.border = "1px solid rgba(239, 68, 68, 0.25)";
      banner.style.color = "#b91c1c";
      banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #b91c1c; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><div><strong>Gagal membuat gambar:</strong> ${err.message}</div>`;
    }
  } finally {
    if (btn) btn.disabled = false;
    if (label) label.textContent = "Download PNG";
  }
}
