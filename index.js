const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 10000; // Render automatically assigns a port

let sock; // Socket ko global rakha hai taaki API access kar sake

async function startWhatsApp() {
    // Session data 'auth_info' folder mein save hoga
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Isse Render ke logs mein QR dikhega
        logger: pino({ level: 'silent' })
    });

    // Jab session update ho to save karein
    sock.ev.on('creds.update', saveCreds);

    // Connection updates monitor karein
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("========================================");
            console.log("QR CODE NEECHE HAI, ISSE SCAN KAREIN:");
            console.log("========================================");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting: ', shouldReconnect);
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            console.log("✅ WhatsApp Connected Successfully!");
        }
    });
}

// 1. Home Route (Fixed)
app.get("/", (req, res) => {
    res.send("WhatsApp OTP Server is Running! Check Logs for QR Code.");
});

// 2. OTP Sending Route
// Example URL: /send?number=919876543210&otp=1234
app.get("/send", async (req, res) => {
    const { number, otp } = req.query;

    if (!sock) {
        return res.status(500).json({ status: "error", message: "WhatsApp initialize nahi hua hai." });
    }

    if (!number || !otp) {
        return res.status(400).json({ status: "error", message: "Number aur OTP query parameters zaroori hain." });
    }

    try {
        // Number format check (9198XXXXXXXX)
        const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
        
        await sock.sendMessage(jid, { 
            text: `*Verification Code*\n\nAapka OTP hai: *${otp}*\n\nIse kisi ke sath share na karein.` 
        });

        res.json({ status: "success", message: `OTP sent to ${number}` });
    } catch (err) {
        console.error("Message send failed:", err);
        res.status(500).json({ status: "error", message: "OTP bhejne mein galti hui." });
    }
});

// Server Start
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
    startWhatsApp();
});
