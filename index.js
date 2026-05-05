const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");
const express = require("express");
const QRCode = require("qrcode");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 10000;

let sock;
let latestQR = null;
let isConnected = false;

async function startWhatsApp() {
    // 'auth_info' folder mein login data save hoga
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'), // WhatsApp block se bachne ke liye
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQR = qr;
            console.log("Naya QR Code generate hua hai. /qr check karein.");
        }

        if (connection === 'close') {
            isConnected = false;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection band hui. Reconnecting:', shouldReconnect);
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            latestQR = null;
            isConnected = true;
            console.log("✅ WhatsApp Successfully Connected!");
        }
    });
}

// 1. Home Page
app.get("/", (req, res) => {
    if (isConnected) {
        res.send("<h1>Bot Status: ✅ Connected</h1><p>OTP bhejne ke liye /send use karein.</p>");
    } else {
        res.send("<h1>Bot Status: ❌ Not Connected</h1><p>QR scan karne ke liye <a href='/qr'>Yahan Click Karein</a></p>");
    }
});

// 2. QR Code Page (Yahan aapko QR dikhega)
app.get("/qr", async (req, res) => {
    if (isConnected) return res.send("<h1>Bot pehle se connected hai!</h1>");
    if (!latestQR) return res.send("<h1>QR generate ho raha hai... 10 seconds baad refresh karein.</h1>");

    try {
        const qrImage = await QRCode.toDataURL(latestQR);
        res.send(`
            <html>
                <body style="text-align:center; font-family:Arial; background:#f0f2f5; padding-top:50px;">
                    <div style="background:white; display:inline-block; padding:20px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                        <h2>Scan with WhatsApp</h2>
                        <img src="${qrImage}" style="width:300px; height:300px;" />
                        <p>Scanning ke baad ye page apne aap band ho jayega.</p>
                    </div>
                    <script>setTimeout(() => { location.reload(); }, 15000);</script>
                </body>
            </html>
        `);
    } catch (err) {
        res.send("QR Error: " + err.message);
    }
});

// 3. OTP Bhejne ka Link
// Example: /send?number=919876543210&otp=556677
app.get("/send", async (req, res) => {
    const { number, otp } = req.query;

    if (!isConnected) return res.status(500).json({ status: "error", message: "WhatsApp connected nahi hai." });
    if (!number || !otp) return res.status(400).json({ status: "error", message: "Number aur OTP dalna zaroori hai." });

    try {
        const cleanNumber = number.replace(/[^0-9]/g, ""); // Sirf numbers rakhega
        const jid = `${cleanNumber}@s.whatsapp.net`;
        
        await sock.sendMessage(jid, { 
            text: `*OTP Verification*\n\nAapka code hai: *${otp}*\n\nIse kisi ko na batayein.` 
        });

        res.json({ status: "success", message: `OTP sent to ${cleanNumber}` });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
    startWhatsApp();
});
