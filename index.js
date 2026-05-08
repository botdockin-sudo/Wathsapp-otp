const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    Browsers, 
    delay, 
    fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");

const app = express();
const port = process.env.PORT || 10000;

let sock;
let isConnected = false;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        auth: state,
        version: version,
        logger: pino({ level: 'silent' }),
        // Render block se bachne ke liye stable browser agent
        browser: Browsers.ubuntu("Chrome"), 
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            isConnected = false;
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log('Connection closed. Reason Code:', reason);
            
            if (reason !== DisconnectReason.loggedOut) {
                console.log("Reconnecting in 5 seconds...");
                setTimeout(startWhatsApp, 5000);
            } else {
                console.log("Logged out. Delete 'auth_info' and re-scan.");
            }
        } else if (connection === 'open') {
            isConnected = true;
            console.log("✅ WhatsApp Connected Successfully!");
        }
    });
}

// 1. Home Route
app.get("/", (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; text-align:center; padding-top:50px;">
            <h1>WhatsApp OTP Server</h1>
            <p>Status: ${isConnected ? "✅ Connected" : "❌ Not Connected"}</p>
            ${!isConnected ? "<a href='/pair'>Link Device (Pairing Code)</a>" : "<p>Use /send to send OTP</p>"}
        </body>
    `);
});

// 2. Pairing Code Route
app.get("/pair", async (req, res) => {
    let phoneNumber = req.query.number;
    
    if (!phoneNumber) {
        return res.send("<h1>Error</h1><p>URL mein number dalein. Example: /pair?number=919693521763</p>");
    }

    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

    if (isConnected) return res.send("<h1>Pehle se connected hai!</h1>");

    try {
        // Socket ko initialize hone ka time dein
        await delay(3000); 
        const code = await sock.requestPairingCode(phoneNumber);
        
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h2>Aapka Pairing Code:</h2>
                <div style="background:#25D366; color:white; display:inline-block; padding:20px; font-size:40px; border-radius:10px; font-weight:bold;">
                    ${code}
                </div>
                <p>Is code ko apne WhatsApp (Linked Devices) mein dalein.</p>
                <p><a href="/">Home par jayein</a></p>
            </div>
        `);
    } catch (err) {
        console.log(err);
        res.status(500).send("<h1>Error!</h1><p>Code nahi mil saka. Page refresh karein ya logs check karein.</p>");
    }
});

// 3. OTP Sending Route
app.get("/send", async (req, res) => {
    const { number, otp } = req.query;

    if (!isConnected) return res.status(500).json({ status: "error", message: "WhatsApp connected nahi hai." });
    if (!number || !otp) return res.status(400).json({ status: "error", message: "Number aur OTP missing hai." });

    try {
        const cleanNumber = number.replace(/[^0-9]/g, "");
        const jid = `${cleanNumber}@s.whatsapp.net`;
        
        await sock.sendMessage(jid, { text: `Your Login/Sing up OTP Is: *${otp}* This OTP is valid for 5 minutes.
Do not share this OTP with anyone.` });
        res.json({ status: "success", message: "Sent" });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    startWhatsApp();
});
