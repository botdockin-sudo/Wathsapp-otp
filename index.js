const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 10000;

let sock;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        // Ye line WhatsApp ko dhokha dene ke liye hai ki hum browser se hain
        browser: Browsers.macOS('Desktop') 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("-----------------------------------------");
            console.log("QR CODE NEECHE HAI:");
            qrcode.generate(qr, { small: true });
            console.log("-----------------------------------------");
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            console.log("✅ WhatsApp Connected Successfully on Render!");
        }
    });
}

app.get("/", (req, res) => {
    res.send("WhatsApp OTP Bot is Active!");
});

app.get("/send", async (req, res) => {
    const { number, otp } = req.query;
    if (!sock) return res.status(500).send("Socket not ready");
    if (!number || !otp) return res.status(400).send("Missing number or otp");

    try {
        const jid = `${number}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: `Aapka OTP: ${otp}` });
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    startWhatsApp();
});
