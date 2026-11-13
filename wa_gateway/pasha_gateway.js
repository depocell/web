/**
 * wa_gateway/pasha_gateway.js
 * WhatsApp Gateway khusus nomor pribadi Bossque (081389779977).
 * Berjalan di port 5006.
 * Mendukung pairing Linked Devices (Tautkan Perangkat),
 * kirim gambar ke diri sendiri (Message Yourself) & grup DepAs.
 */

const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 5006;
const AUTH_DIR = path.join(__dirname, 'auth_pasha');
const QR_PNG = path.join(__dirname, 'qr_pasha.png');

if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let isConnected = false;
let currentQr = null;
let currentQrPngBase64 = null;

function getGreetingWIB() {
    const now = new Date();
    // UTC+7 (WIB)
    const utcHours = now.getUTCHours();
    const wibHours = (utcHours + 7) % 24;

    if (wibHours >= 4 && wibHours < 11) {
        return "Selamat Pagi";
    } else if (wibHours >= 11 && wibHours < 15) {
        return "Selamat Siang";
    } else if (wibHours >= 15 && wibHours < 19) {
        return "Selamat Sore";
    } else {
        return "Selamat Malam";
    }
}

async function startGateway() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ['DepAs Web Report', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQr = qr;
            console.log('\n======================================================');
            console.log('   SCAN QR DENGAN WHATSAPP HP BOSQUE (081389779977)   ');
            console.log('   Buka: Setelan > Perangkat Tertaut > Tautkan        ');
            console.log('   Atau buka di browser: http://localhost:5006/qr     ');
            console.log('======================================================\n');
            qrcodeTerminal.generate(qr, { small: true });

            try {
                await QRCode.toFile(QR_PNG, qr, { width: 320 });
                const buf = fs.readFileSync(QR_PNG);
                currentQrPngBase64 = buf.toString('base64');
            } catch (err) {
                console.error('Gagal generate qr_pasha.png:', err.message);
            }
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[Koneksi Terputus] Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

            if (shouldReconnect) {
                setTimeout(startGateway, 3000);
            } else {
                console.log('[Logout] Sesi WhatsApp logout. Menghapus sesi lama...');
                try {
                    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                } catch (e) {}
                setTimeout(startGateway, 2000);
            }
        } else if (connection === 'open') {
            isConnected = true;
            currentQr = null;
            currentQrPngBase64 = null;
            const myJid = sock.user?.id || '';
            const myNum = myJid.split('@')[0].split(':')[0];
            console.log('\n======================================================');
            console.log(' [SUKSES] WHATSAPP PASHA (081389779977) TERHUBUNG!   ');
            console.log(` Akun Aktif: ${myNum} (${sock.user?.name || 'Bossque'})`);
            console.log(` Siap mengirim ke nomor sendiri & grup DepAs.         `);
            console.log('======================================================\n');

            if (fs.existsSync(QR_PNG)) {
                try { fs.unlinkSync(QR_PNG); } catch (e) {}
            }
        }
    });
}

// -------------------------------------------------------------
// HTTP REST API (Port 5006)
// -------------------------------------------------------------
const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // 1. GET /status
    if (req.method === 'GET' && url.pathname === '/status') {
        const myJid = sock?.user?.id || null;
        const myNum = myJid ? myJid.split('@')[0].split(':')[0] : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            ok: true,
            connected: isConnected,
            phone: myNum,
            name: sock?.user?.name || null
        }));
    }

    // 1b. GET /groups
    if (req.method === 'GET' && url.pathname === '/groups') {
        if (!isConnected || !sock) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'WhatsApp belum terhubung' }));
        }
        try {
            const groups = await sock.groupFetchAllParticipating();
            const list = Object.values(groups).map(g => ({
                id: g.id,
                subject: g.subject
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true, groups: list }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
    }

    // 2. GET /qr (HTML view)
    if (req.method === 'GET' && url.pathname === '/qr') {
        if (isConnected) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(`
                <!DOCTYPE html>
                <html>
                <head><title>WhatsApp Pasha Terhubung</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="font-family:-apple-system, sans-serif; background:#0f172a; color:#fff; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
                    <div style="background:#1e293b; padding:32px; border-radius:12px; text-align:center; max-width:400px; border:1px solid #334155;">
                        <div style="width:50px; height:50px; background:#16a34a; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <h2 style="margin:0 0 8px; color:#22c55e;">WhatsApp Terhubung!</h2>
                        <p style="color:#94a3b8; font-size:14px; margin:0;">Akun <b>${sock?.user?.id?.split('@')[0]?.split(':')[0] || '081389779977'}</b> siap mengirim laporan harian.</p>
                    </div>
                </body>
                </html>
            `);
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Tautkan WhatsApp Bossque (081389779977)</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta http-equiv="refresh" content="3">
            </head>
            <body style="font-family:-apple-system, sans-serif; background:#0f172a; color:#fff; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
                <div style="background:#1e293b; padding:28px; border-radius:14px; text-align:center; max-width:420px; border:1px solid #334155; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                    <h2 style="margin:0 0 6px; font-size:20px; color:#38bdf8;">Tautkan WhatsApp</h2>
                    <p style="color:#94a3b8; font-size:13px; margin:0 0 18px;">
                        Buka WhatsApp di HP <b>081389779977</b> &gt; Setelan &gt; <b>Perangkat Tertaut</b> &gt; <b>Tautkan Perangkat</b>
                    </p>
                    ${currentQrPngBase64 ? 
                        `<img src="data:image/png;base64,${currentQrPngBase64}" style="width:260px; height:260px; background:#fff; padding:12px; border-radius:8px;" alt="QR Code"/>` : 
                        `<div style="padding:40px 20px; color:#94a3b8;">Sedang menyiapkan QR Code...</div>`
                    }
                    <p style="color:#64748b; font-size:11px; margin:14px 0 0;">Halaman me-refresh otomatis setiap 3 detik.</p>
                </div>
            </body>
            </html>
        `);
    }

    // 3. POST /send-image
    if (req.method === 'POST' && url.pathname === '/send-image') {
        if (!isConnected || !sock) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'WhatsApp belum terhubung. Silakan buka http://localhost:5006/qr untuk scan.' }));
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                const target = data.target || 'self';
                const caption = data.caption || '';

                let targetJid = null;
                const myCleanNumber = sock.user.id.split('@')[0].split(':')[0];

                if (target === 'self' || target === 'me' || target === myCleanNumber) {
                    // Chat ke diri sendiri
                    targetJid = `${myCleanNumber}@s.whatsapp.net`;
                } else if (target === 'depas' || target === 'group') {
                    // Cari grup DepAs
                    const groups = await sock.groupFetchAllParticipating();
                    const depasGroup = Object.values(groups).find(g => 
                        g.subject && g.subject.trim().toLowerCase().includes('depas')
                    );
                    if (!depasGroup) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ ok: false, error: 'Grup WhatsApp "DepAs" tidak ditemukan di akun ini.' }));
                    }
                    targetJid = depasGroup.id;
                } else {
                    let clean = String(target).replace(/[^0-9]/g, '');
                    if (clean.startsWith('08')) clean = '628' + clean.slice(2);
                    else if (clean.startsWith('8')) clean = '628' + clean.slice(1);
                    targetJid = `${clean}@s.whatsapp.net`;
                }

                let buffer = null;
                if (data.imageBase64) {
                    const cleanBase64 = data.imageBase64.replace(/^data:image\/\w+;base64,/, '');
                    buffer = Buffer.from(cleanBase64, 'base64');
                } else if (data.imagePath) {
                    if (!fs.existsSync(data.imagePath)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ ok: false, error: `File tidak ditemukan: ${data.imagePath}` }));
                    }
                    buffer = fs.readFileSync(data.imagePath);
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ ok: false, error: 'Parameter imagePath atau imageBase64 wajib diisi.' }));
                }

                const result = await sock.sendMessage(targetJid, {
                    image: buffer,
                    caption: caption
                });

                console.log(`[WA Send] Sukses mengirim gambar ke ${targetJid}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: true, target: targetJid, messageId: result.key.id }));
            } catch (err) {
                console.error('[WA Error]:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        });
        return;
    }

    // 4. POST /send-daily-pair (Kirim ASTAGA + OKIPAY sekaligus)
    if (req.method === 'POST' && url.pathname === '/send-daily-pair') {
        if (!isConnected || !sock) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'WhatsApp belum terhubung. Buka http://localhost:5006/qr' }));
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                const target = data.target || 'self';
                const cutOffDate = data.cutOffDate || '10 Nov 2026';
                const greeting = getGreetingWIB();
                const officialCaption = `${greeting}, berikut info transaksi per ${cutOffDate}, terimakasih.`;

                let targetJid = null;
                const myCleanNumber = sock.user.id.split('@')[0].split(':')[0];

                if (target === 'self' || target === 'me' || target === myCleanNumber) {
                    targetJid = `${myCleanNumber}@s.whatsapp.net`;
                } else if (target === 'depas' || target === 'group') {
                    const groups = await sock.groupFetchAllParticipating();
                    const depasGroup = Object.values(groups).find(g => 
                        g.subject && g.subject.trim().toLowerCase().includes('depas')
                    );
                    if (!depasGroup) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ ok: false, error: 'Grup WhatsApp "DepAs" tidak ditemukan di akun ini.' }));
                    }
                    targetJid = depasGroup.id;
                } else {
                    let clean = String(target).replace(/[^0-9]/g, '');
                    if (clean.startsWith('08')) clean = '628' + clean.slice(2);
                    else if (clean.startsWith('8')) clean = '628' + clean.slice(1);
                    targetJid = `${clean}@s.whatsapp.net`;
                }

                // Ambil gambar ASTAGA (Murni In-Memory Buffer)
                let bufAstaga = null;
                if (data.astagaBase64) {
                    bufAstaga = Buffer.from(data.astagaBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                } else if (data.astagaPath && fs.existsSync(data.astagaPath)) {
                    bufAstaga = fs.readFileSync(data.astagaPath);
                }

                // Ambil gambar OKIPAY (Murni In-Memory Buffer)
                let bufOkipay = null;
                if (data.okipayBase64) {
                    bufOkipay = Buffer.from(data.okipayBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                } else if (data.okipayPath && fs.existsSync(data.okipayPath)) {
                    bufOkipay = fs.readFileSync(data.okipayPath);
                }

                if (!bufAstaga && !bufOkipay) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ ok: false, error: 'Gambar ASTAGA dan OKIPAY tidak ditemukan.' }));
                }

                // 1. Kirim ASTAGA dengan caption resmi
                if (bufAstaga) {
                    await sock.sendMessage(targetJid, {
                        image: bufAstaga,
                        caption: officialCaption
                    });
                    console.log(`[WA Send] Sukses mengirim gambar ASTAGA ke ${targetJid}`);
                }

                // Jeda 1.5 detik agar urutan rapi dan natural
                await new Promise(r => setTimeout(r, 1500));

                // 2. Kirim OKIPAY (sebagai gambar kedua)
                if (bufOkipay) {
                    await sock.sendMessage(targetJid, {
                        image: bufOkipay
                    });
                    console.log(`[WA Send] Sukses mengirim gambar OKIPAY ke ${targetJid}`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    ok: true,
                    target: targetJid,
                    caption: officialCaption,
                    sent: [bufAstaga ? 'ASTAGA' : null, bufOkipay ? 'OKIPAY' : null].filter(Boolean)
                }));
            } catch (err) {
                console.error('[WA Error send-daily-pair]:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Endpoint not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Pasha WA Gateway HTTP API berjalan di http://127.0.0.1:${PORT}`);
    startGateway();
});
