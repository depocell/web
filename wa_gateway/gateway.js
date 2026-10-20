/**
 * wa_gateway/gateway.js
 * WhatsApp Gateway Headless Service via Baileys & Express
 * Port API: 3000
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');
const http = require('http');
const path = require('path');

const PORT = 3000;
const WEB_REPORT_WEBHOOK = 'http://127.0.0.1:8000/api/survey/incoming-wa';

const app = express();
app.use(express.json());

let sock = null;
let isConnected = false;
let botPhone = null;
let lastSurveyedPhone = null;
const messageStore = new Map();

async function startWhatsApp() {
  const sessionPath = path.join(__dirname, 'session');
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    markOnlineOnConnect: true,
    browser: ['WebReport Bot', 'Chrome', '1.0.0'],
    getMessage: async (key) => {
      if (key?.id && messageStore.has(key.id)) {
        return messageStore.get(key.id);
      }
      return undefined;
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n======================================================');
      console.log('  SCAN QR CODE DI BAWAH INI MENGGUNAKAN WHATSAPP ANDA:');
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n(Buka WhatsApp di HP > Menu Titik 3 / Pengaturan > Perangkat Tertaut > Tautkan Perangkat)\n');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      isConnected = false;
      console.log('[WA Gateway] Koneksi terputus. Mencoba menghubungkan kembali:', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(startWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      isConnected = true;
      botPhone = sock.user?.id?.split(':')[0] || 'Unknown';
      console.log('\n======================================================');
      console.log(`  WHATSAPP GATEWAY TERHUBUNG SEBAGAI: +${botPhone}`);
      console.log('  GATEWAY STANDBY MENERIMA & MENGIRIM PESAN...');
      console.log('======================================================\n');
    }
  });

  // Menerima balasan dari Reseller / Agen
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || msg.key.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      // Abaikan status broadcast, group, newsletter
      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast') || remoteJid.includes('@newsletter')) return;

      let text = msg.message?.conversation || 
                 msg.message?.extendedTextMessage?.text || 
                 msg.message?.imageMessage?.caption || '';

      text = text.trim();
      if (!text) return;

      // Ekstraksi nomor HP nyata
      let targetPhone = msg.key.senderPn || msg.key.participantPn || remoteJid;
      let cleanPhone = targetPhone.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

      // Jika WhatsApp mengirimkan LID (ID privasi), fallback ke nomor survey terakhir yang dikirim
      if (cleanPhone.length > 14 && lastSurveyedPhone) {
        cleanPhone = lastSurveyedPhone;
      }

      console.log(`[Pesan Masuk dari +${cleanPhone}]: ${text}`);

      // Teruskan pesan ke Web Report backend via webhook
      forwardToWebReport(cleanPhone, text);
    } catch (err) {
      console.error('[WA Gateway Error Upsert]:', err.message);
    }
  });
}

// Forward balasan pesan ke server.py
function forwardToWebReport(phone, text) {
  try {
    const data = JSON.stringify({ phone, text });
    const url = new URL(WEB_REPORT_WEBHOOK);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 3000
    }, (res) => {
      console.log(`[Webhook Web Report]: Balasan diproses dengan status HTTP ${res.statusCode}`);
    });

    req.on('error', (e) => {
      console.error('[Webhook Web Report Gagal Terhubung]:', e.message);
    });

    req.write(data);
    req.end();
  } catch (e) {
    // silently catch
  }
}

// REST API Endpoints
app.get('/status', (req, res) => {
  res.json({
    ok: true,
    connected: isConnected,
    phone: botPhone
  });
});

app.post('/check-phone', async (req, res) => {
  try {
    if (!isConnected || !sock) {
      return res.status(503).json({ ok: false, error: 'WhatsApp Gateway belum terhubung.' });
    }
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ ok: false, error: 'Parameter phone wajib diisi.' });

    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('08')) clean = '628' + clean.slice(2);
    else if (clean.startsWith('8')) clean = '628' + clean.slice(1);

    const jid = `${clean}@s.whatsapp.net`;
    const waResults = await sock.onWhatsApp(jid);
    const waTarget = Array.isArray(waResults) && waResults.length > 0 ? waResults[0] : null;

    res.json({
      ok: true,
      phone: clean,
      exists: !!(waTarget && waTarget.exists),
      jid: waTarget?.jid || null
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/send-message', async (req, res) => {
  try {
    if (!isConnected || !sock) {
      return res.status(503).json({
        ok: false,
        error: 'WhatsApp Gateway belum terhubung. Silakan scan QR code terlebih dahulu.'
      });
    }

    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ ok: false, error: 'Parameter phone dan message wajib diisi.' });
    }

    // Format target JID: 628xxxxxxxx@s.whatsapp.net
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('08')) {
      clean = '628' + clean.slice(2);
    } else if (clean.startsWith('8')) {
      clean = '628' + clean.slice(1);
    }

    const jid = `${clean}@s.whatsapp.net`;

    // 1. Validasi keberadaan akun WhatsApp (Pre-check 0.1s via onWhatsApp)
    let waTarget = null;
    try {
      const waResults = await sock.onWhatsApp(jid);
      waTarget = Array.isArray(waResults) && waResults.length > 0 ? waResults[0] : null;
    } catch (e) {
      console.warn(`[Warning onWhatsApp]: Gagal validasi nomor ${clean}: ${e.message}`);
    }

    if (!waTarget || !waTarget.exists) {
      console.log(`[Validasi WA]: Nomor +${clean} TIDAK terdaftar di WhatsApp.`);
      return res.json({
        ok: false,
        delivered: false,
        notOnWhatsApp: true,
        phone: clean,
        error: 'Nomor tidak terdaftar di WhatsApp'
      });
    }

    const actualJid = waTarget.jid || jid;
    lastSurveyedPhone = clean;
    try {
      await sock.sendPresenceUpdate('available', actualJid);
    } catch (_) {}

    const sentMsg = await sock.sendMessage(actualJid, { text: message });
    if (sentMsg?.key?.id && sentMsg?.message) {
      messageStore.set(sentMsg.key.id, sentMsg.message);
    }

    console.log(`[Pesan Terkirim ke +${clean}]: ID ${sentMsg.key.id}`);
    res.json({
      ok: true,
      delivered: true,
      phone: clean,
      messageId: sentMsg.key.id
    });
  } catch (err) {
    console.error('[Error Send Message]:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[WA Gateway HTTP API] Berjalan di http://127.0.0.1:${PORT}`);
  startWhatsApp();
});
