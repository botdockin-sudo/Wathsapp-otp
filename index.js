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

// OTP ko RAM mein store karne ke liye
const otpStore = new Map();

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        auth: state,
        version: version,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu("Chrome"), 
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            isConnected = false;
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                setTimeout(startWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            isConnected = true;
            console.log("✅ WhatsApp Connected!");
        }
    });
}

// 1. Home Page
app.get("/", (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; padding-top:50px;">
            <h1>DoneKart OTP Server</h1>
            <p>Status: ${isConnected ? "✅ Connected" : "❌ Not Connected"}</p>
            <p>Send OTP: <code>/send?number=91XXXXXXXXXX</code></p>
        </div>
    `);
});

// 2. Pairing Code Route
app.get("/pair", async (req, res) => {
    let phoneNumber = req.query.number;
    if (!phoneNumber) return res.send("Number missing!");
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    try {
        await delay(2000);
        const code = await sock.requestPairingCode(phoneNumber);
        res.send(`<h1>Pairing Code: ${code}</h1>`);
    } catch (err) {
        res.send("Error generating code.");
    }
});

// 3. Send OTP (Auto-Generate & RAM-expiry)
app.get("/send", async (req, res) => {
    const { number } = req.query;

    if (!isConnected) return res.status(500).json({ status: "error", message: "WhatsApp connect nahi hai." });
    if (!number) return res.status(400).json({ status: "error", message: "Number chahiye." });

    const cleanNumber = number.replace(/[^0-9]/g, "");
    const jid = `${cleanNumber}@s.whatsapp.net`;

    // 6 digit random OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        // WhatsApp par message bhejna
        await sock.sendMessage(jid, {
            text: `🔐 *DoneKart Verification*\n\nYour OTP is: *${generatedOtp}*\n\n⏳ Valid for: *5 Minutes*\n\n— Team DoneKart`
        });

        // RAM (Map) mein save karna
        otpStore.set(cleanNumber, generatedOtp);

        // 5 Minute baad RAM se delete karna (WhatsApp se nahi)
        setTimeout(() => {
            otpStore.delete(cleanNumber);
            console.log(`OTP Expired for ${cleanNumber} (Removed from RAM)`);
        }, 5 * 60 * 1000);

        res.json({ 
            status: "success", 
            message: "OTP Sent", 
            number: cleanNumber,
            verify_url: `/verify?number=${cleanNumber}&otp=${generatedOtp}`
        });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// 4. Verify OTP Route
app.get("/verify", (req, res) => {
    const { number, otp } = req.query;
    const cleanNumber = number?.replace(/[^0-9]/g, "");
    
    const savedOtp = otpStore.get(cleanNumber);

    if (!savedOtp) {
        return res.json({ status: "error", message: "OTP expired ya invalid hai." });
    }

    if (savedOtp === otp) {
        otpStore.delete(cleanNumber); // Verify hone par RAM se hata do
        res.json({ status: "success", message: "OTP Sahi Hai!" });
    } else {
        res.json({ status: "error", message: "Galat OTP!" });
    }
});

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
    startWhatsApp();
});
