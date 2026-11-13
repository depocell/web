// pages/bot_ai/bot_ai.js — Pengaturan & Eskalasi Bot AI

let activeBotTab = "tickets";
let botTicketsCache = [];

function loadBotAI() {
  const hash = window.location.hash || "";
  if (hash.includes("tab=tickets")) {
    switchBotAITab("tickets");
  } else {
    switchBotAITab("tickets");
  }
}

function switchBotAITab(tabName) {
  activeBotTab = tabName;
  try {
    history.replaceState(null, null, "#bot-ai?tab=" + tabName);
  } catch (e) {}

  const btnTickets = document.getElementById("tab-btn-tickets");
  const viewTickets = document.getElementById("content-tab-tickets");

  if (btnTickets) btnTickets.classList.add("active");
  if (viewTickets) viewTickets.style.display = "flex";

  if (tabName === "tickets") {
    loadBotAITickets();
  }
}

async function loadBotAITickets() {
  const tbody = document.getElementById("bot-tickets-table-body");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 30px; text-align: center; color: var(--text-muted);">
          Memuat antrean tiket eskalasi...
        </td>
      </tr>`;
  }

  try {
    const res = await fetch("/api/admin/tickets?t=" + Date.now());
    const json = await res.json();

    if (!json.ok) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="padding: 30px; text-align: center; color: #dc2626;">
              Gagal memuat antrean tiket: ${json.error || 'Terjadi kesalahan sistem'}
            </td>
          </tr>`;
      }
      return;
    }

    botTicketsCache = json.tickets || [];

    const statTotal = document.getElementById("stat-total-tickets");
    const statPending = document.getElementById("stat-pending-tickets");
    const statResolved = document.getElementById("stat-resolved-tickets");

    if (statTotal) statTotal.textContent = json.total || 0;
    if (statPending) statPending.textContent = json.pending || 0;
    if (statResolved) statResolved.textContent = json.resolved || 0;

    filterBotAITickets();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 30px; text-align: center; color: #dc2626;">
            Terjadi kesalahan koneksi server: ${err.message}
          </td>
        </tr>`;
    }
  }
}

function filterBotAITickets() {
  const sel = document.getElementById("filter-ticket-status");
  const val = sel ? sel.value : "ALL";
  if (val === "ALL") {
    renderBotAITickets(botTicketsCache);
  } else {
    const filtered = botTicketsCache.filter(t => (t.status || "PENDING") === val);
    renderBotAITickets(filtered);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderBotAITickets(tickets) {
  const tbody = document.getElementById("bot-tickets-table-body");
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
            <span style="font-weight:600; color:var(--text-main);">Tidak Ada Tiket yang Cocok</span>
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
      ? `<span style="display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:12px; font-size:11px; font-weight:700; background:rgba(245, 158, 11, 0.12); color:#d97706; border:1px solid rgba(245, 158, 11, 0.25);">
           <span style="width:6px; height:6px; border-radius:50%; background:#d97706;"></span> PENDING
         </span>`
      : `<span style="display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:12px; font-size:11px; font-weight:700; background:rgba(16, 185, 129, 0.12); color:#059669; border:1px solid rgba(16, 185, 129, 0.25);">
           <span style="width:6px; height:6px; border-radius:50%; background:#059669;"></span> RESOLVED
         </span>`;

    const actionBtn = isPending
      ? `<button type="button" onclick="resolveBotAITicket('${t.ticket_id}')" style="padding:5px 12px; font-size:11.5px; font-weight:600; border-radius:6px; background:var(--primary); color:#ffffff; border:none; cursor:pointer; box-shadow:0 1px 2px rgba(37,99,235,0.2);">
           Selesaikan
         </button>`
      : `<span style="font-size:11px; font-weight:600; color:var(--text-muted);">Selesai</span>`;

    html += `
      <tr style="border-bottom: 1px solid var(--surface-border); transition: background 0.15s;">
        <td style="padding: 12px 16px; font-weight: 700; font-family: var(--font-mono); color: var(--primary);">
          ${escapeHtml(t.ticket_id)}
        </td>
        <td style="padding: 12px 16px;">
          <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(t.user_name || 'Bossque')}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(t.created_at || '-')}</div>
        </td>
        <td style="padding: 12px 16px; color: var(--text-main); max-width: 280px; word-break: break-word;">
          "${escapeHtml(t.prompt || '-')}"
        </td>
        <td style="padding: 12px 16px; color: var(--text-muted); max-width: 280px; word-break: break-word;">
          <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(t.requirement || '-')}</div>
          ${t.resolution_note ? `<div style="font-size: 11px; color: #059669; margin-top: 3px;">Catatan: ${escapeHtml(t.resolution_note)}</div>` : ''}
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

async function resolveBotAITicket(ticketId) {
  const note = prompt(
    `Selesaikan tiket ${ticketId}?\nMasukkan catatan resolusi untuk menandai bahwa data sudah diracik:`,
    "Data sudah diracik dan disuntikkan ke snapshot AI."
  );
  if (note === null) return;

  try {
    const res = await fetch("/api/admin/tickets/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticketId, note: note || "Data sudah diracik dan disuntikkan ke snapshot AI." })
    });
    const json = await res.json();
    if (json.ok) {
      await loadBotAITickets();
    } else {
      alert("Gagal menyelesaikan tiket: " + (json.error || "Unknown error"));
    }
  } catch (err) {
    alert("Terjadi kesalahan jaringan: " + err.message);
  }
}

window.loadBotAI = loadBotAI;
window.switchBotAITab = switchBotAITab;
window.loadBotAITickets = loadBotAITickets;
window.filterBotAITickets = filterBotAITickets;
window.resolveBotAITicket = resolveBotAITicket;
