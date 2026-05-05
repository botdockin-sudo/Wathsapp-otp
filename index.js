const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, delay } = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 10000;

let sock;
let isConnected = false;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'), // Important
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            isConnected = false;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            isConnected = true;
            console.log("✅ WhatsApp Connected!");
        }
    });
}

// 1. Pairing Page (Yahan apna number daal kar code lein)
app.get("/pair", async (req, res) => {
    let num = req.query.number;
    if (!num) return res.send("<h1>Apna number URL mein daalein</h1><p>Example: /pair?number=919876543210</p>");
    
    try {
        num = num.replace(/[^0-9]/g, '');
        if (isConnected) return res.send("<h1>WhatsApp Pehle se connected hai!</h1>");
        
        // WhatsApp se pairing code maangein
        await delay(3000); // Thoda ruk kar request karein
        let code = await sock.requestPairingCode(num);
        
        res.send(`
            <body style="text-align:center; font-family:sans-serif; padding-top:50px;">
                <h1>Aapka Pairing Code:</h1>
                <div style="background:#25D366; color:white; display:inline-block; padding:20px; font-size:40px; border-radius:10px; letter-spacing:5px;">
                    ${code}
                </div>
                <p>1. WhatsApp kholein apne phone mein.</p>
                <p>2. Linked Devices > Link a Device > <b>Link with phone number instead</b> par jayein.</p>
                <p>3. Ye 8-digit code wahan dalein.</p>
            </body>
        `);
    } catch (err) {
        res.send("Error: " + err.message + ". Ek baar logs check karein ya refresh karein.");
    }
});

app.get("/", (req, res) => {
    res.send(isConnected ? "Connected ✅" : "Not Connected ❌. Go to <a href='/pair'>/pair</a>");
});

app.get("/send", async (req, res) => {
    const { number, otp } = req.query;
    if (!isConnected) return res.send("Bot connected nahi hai.");
    try {
        await sock.sendMessage(`${number}@s.whatsapp.net`, { text: `OTP: ${otp}` });
        res.send("Sent ✅");
    } catch (e) {
        res.send("Error: " + e.message);
    }
});

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
    startWhatsApp();
});
