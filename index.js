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
            <p>Status: ${isConnected ? "<span style='color:green'>✅ Connected</span>" : "<span style='color:red'>❌ Not Connected</span>"}</p>
            <p>API Endpoint: <code>/send?number=91XXXXXXXXXX</code></p>
        </div>
    `);
});

// 2. Pairing Code Route (Mobile Login ke liye)
app.get("/pair", async (req, res) => {
    let phoneNumber = req.query.number;
    if (!phoneNumber) return res.send("Phone number missing!");
    
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    try {
        if (isConnected) return res.send("<h1>Already Connected!</h1>");
        
        // WhatsApp system ko thoda time chahiye hota hai session initialize karne ke liye
        await delay(3000); 
        const code = await sock.requestPairingCode(phoneNumber);
        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding-top:50px;">
                <h2>Your Pairing Code:</h2>
                <h1 style="background:#f4f4f4; display:inline-block; padding:10px 20px; border-radius:10px; letter-spacing:5px;">${code}</h1>
                <p>Open WhatsApp > Linked Devices > Link with Phone Number</p>
            </div>
        `);
    } catch (err) {
        console.error("Pairing Error:", err);
        res.send("Error generating code. Please restart server or check number.");
    }
});

// 3. Send OTP (OTP Hide kar diya gaya hai response se)
app.get("/send", async (req, res) => {
    const { number } = req.query;

    if (!isConnected) return res.status(500).json({ status: "error", message: "WhatsApp connected nahi hai." });
    if (!number) return res.status(400).json({ status: "error", message: "Number required." });

    const cleanNumber = number.replace(/[^0-9]/g, "");
    const jid = `${cleanNumber}@s.whatsapp.net`;

    // 6 digit random OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        await sock.sendMessage(jid, {
            text: `🔐 *DoneKart Verification*\n\nYour OTP is: *${generatedOtp}*\n\n⏳ Valid for: *5 Minutes*\n\n— Team DoneKart`
        });

        // Save in RAM
        otpStore.set(cleanNumber, generatedOtp);

        // Delete from RAM after 5 Minutes
        setTimeout(() => {
            otpStore.delete(cleanNumber);
        }, 5 * 60 * 1000);

        // Sirf success message bhejna hai, OTP nahi
        res.json({ 
            status: "success", 
            message: "OTP sent successfully."
        });

    } catch (err) {
        res.status(500).json({ status: "error", message: "Failed to send message." });
    }
});

// 4. Verify OTP Route
app.get("/verify", (req, res) => {
    const { number, otp } = req.query;
    
    if (!number || !otp) {
        return res.json({ status: "error", message: "Number aur OTP dono chahiye." });
    }

    const cleanNumber = number.replace(/[^0-9]/g, "");
    const savedOtp = otpStore.get(cleanNumber);

    if (!savedOtp) {
        return res.json({ status: "error", message: "OTP expired ya invalid hai." });
    }

    // String comparison taaki type error na ho
    if (savedOtp === otp.toString()) {
        otpStore.delete(cleanNumber); // Ek baar verify hone par delete kar dein
        res.json({ status: "success", message: "Verification Successful!" });
    } else {
        res.json({ status: "error", message: "Galat OTP code entered." });
    }
});

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
    startWhatsApp();
});
