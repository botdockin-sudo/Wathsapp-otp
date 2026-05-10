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

const NodeCache = require("node-cache");



const app = express();

const port = process.env.PORT || 10000;



/* OTP STORE */

const otpStore = new NodeCache({
    stdTTL: 300,
    checkperiod: 60
});



let sock;

let isConnected = false;



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



    sock.ev.on('connection.update', async (update) => {

        const { connection, lastDisconnect } = update;



        if (connection === 'close') {

            isConnected = false;

            const reason = lastDisconnect?.error?.output?.statusCode;

            console.log('Connection closed. Reason Code:', reason);



            if (reason !== DisconnectReason.loggedOut) {

                console.log("Reconnecting in 5 seconds...");

                setTimeout(startWhatsApp, 5000);

            }

        } 
        
        else if (connection === 'open') {

            isConnected = true;

            console.log("✅ WhatsApp Connected Successfully!");

        }

    });

}



/* HOME */

app.get("/", (req, res) => {

    res.send(`
    
        <body style="font-family:sans-serif; text-align:center; padding-top:50px;">
        
            <h1>WhatsApp OTP Server</h1>

            <p>Status: ${isConnected ? "✅ Connected" : "❌ Not Connected"}</p>

            <p>
                Send OTP:
                <br>
                /send?number=919693521763
            </p>

            <p>
                Verify OTP:
                <br>
                /verify?number=919693521763&otp=123456
            </p>

        </body>

    `);

});



/* SEND OTP */

app.get("/send", async (req, res) => {

    const { number } = req.query;



    if (!isConnected) {

        return res.status(500).json({ 
            status: "error", 
            message: "WhatsApp connected nahi hai." 
        });

    }



    if (!number) {

        return res.status(400).json({ 
            status: "error", 
            message: "Number missing hai." 
        });

    }



    try {

        const cleanNumber = number.replace(/[^0-9]/g, "");

        const jid = `${cleanNumber}@s.whatsapp.net`;



        /* GENERATE OTP */

        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();



        /* SAVE OTP */

        otpStore.set(cleanNumber, otp);



        /* SEND MESSAGE */

        await sock.sendMessage(jid, { 

            text: `🔐 *DoneKart Verification *

Your OTP for Login / Sign Up is:

✨ *${otp}*

⏳ Valid for: *5 Minutes*

⚠️ Do not share this OTP with anyone for security reasons.

— Team DoneKart`

        });



        res.json({ 
            status: "success", 
            message: "OTP Sent",
            number: cleanNumber
        });



    } catch (err) {

        res.status(500).json({ 
            status: "error", 
            message: err.message 
        });

    }

});



/* VERIFY OTP */

app.get("/verify", async (req, res) => {

    const { number, otp } = req.query;



    try {

        if (!number || !otp) {

            return res.status(400).json({

                status: "error",

                message: "Number aur OTP missing hai."

            });

        }



        const cleanNumber = number.replace(/[^0-9]/g, "");



        /* GET OTP */

        const savedOtp = otpStore.get(cleanNumber);



        /* EXPIRED */

        if (!savedOtp) {

            return res.status(400).json({

                status: "error",

                message: "OTP Expired"

            });

        }



        /* INVALID */

        if (savedOtp !== otp) {

            return res.status(400).json({

                status: "error",

                message: "Invalid OTP"

            });

        }



        /* DELETE OTP */

        otpStore.del(cleanNumber);



        /* SUCCESS */

        res.json({

            status: "success",

            verified: true

        });



    } catch (err) {

        res.status(500).json({

            status: "error",

            message: err.message

        });

    }

});



app.listen(port, () => {

    console.log(`Server is running on port ${port}`);

    startWhatsApp();

});
