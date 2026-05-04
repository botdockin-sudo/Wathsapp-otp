const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 3000;

async function startWhatsApp() {
    // Session save karne ke liye 'auth_info' folder banega
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Render logs mein QR dikhega
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            console.log("✅ WhatsApp Connected Successfully!");
        }
    });

    // API Endpoint: OTP Bhejne ke liye
    // Example: /send?number=919876543210&otp=1234
    app.get("/send", async (req, res) => {
        const { number, otp } = req.query;
        if (!number || !otp) return res.status(400).json({ error: "Number aur OTP missing hai" });

        try {
            const formattedNumber = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
            await sock.sendMessage(formattedNumber, { 
                text: `*OTP Verification*\n\nAapka secret code hai: *${otp}*\n\nYe code kisi ko na batayein.` 
            });
            res.json({ status: "Success", message: `OTP sent to ${number}` });
        } catch (err) {
            res.status(500).json({ status: "Error", error: err.message });
        }
    });
}

app.get("/", (res) => res.send("WhatsApp OTP Server is Running!"));

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
    startWhatsApp();
});
