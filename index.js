const {
default: makeWASocket,
useMultiFileAuthState,
DisconnectReason,
Browsers
} = require("@whiskeysockets/baileys");

const express = require("express");

const QRCode = require("qrcode");

const pino = require("pino");

const NodeCache = require("node-cache");



/* =========================
   EXPRESS
========================= */

const app = express();

const port =
process.env.PORT || 10000;



/* =========================
   OTP STORE (RAM)
========================= */

const otpStore =
new NodeCache({

stdTTL: 300,

checkperiod: 60

});



let sock;

let latestQR = null;

let isConnected = false;



/* =========================
   START WHATSAPP
========================= */

async function startWhatsApp(){

try{



const {
state,
saveCreds
} =
await useMultiFileAuthState(
"auth_info"
);



sock =
makeWASocket({

auth: state,

logger: pino({
level: "silent"
}),

browser:
Browsers.macOS("Desktop"),

syncFullHistory: false

});



/* SAVE SESSION */

sock.ev.on(
"creds.update",
saveCreds
);



/* CONNECTION */

sock.ev.on(
"connection.update",
(update)=>{

const {
connection,
lastDisconnect,
qr
} = update;



/* QR */

if(qr){

latestQR = qr;

console.log(
"New QR Generated"
);

}



/* DISCONNECTED */

if(connection === "close"){

isConnected = false;



const shouldReconnect =

lastDisconnect?.error?.output?.statusCode
!== DisconnectReason.loggedOut;



console.log(
"Connection Closed"
);



if(shouldReconnect){

startWhatsApp();

}

}



/* CONNECTED */

else if(connection === "open"){

latestQR = null;

isConnected = true;

console.log(
"WhatsApp Connected Successfully"
);

}

});



}catch(err){

console.log(err);

}

}



/* =========================
   HOME
========================= */

app.get("/", (req,res)=>{

if(isConnected){

res.send(`

<h1>
Bot Status: Connected
</h1>

<p>
OTP Server Running
</p>

<p>
Send OTP:
<br>
/send?number=919876543210
</p>

`);

}else{

res.send(`

<h1>
Bot Status: Not Connected
</h1>

<p>
<a href="/qr">
Open QR Code
</a>
</p>

`);

}

});



/* =========================
   QR PAGE
========================= */

app.get(
"/qr",
async(req,res)=>{

if(isConnected){

return res.send(`

<h1>
WhatsApp Already Connected
</h1>

`);

}



if(!latestQR){

return res.send(`

<h1>
QR Generate Ho Raha Hai...
</h1>

<p>
10 seconds baad refresh karein.
</p>

`);

}



try{



const qrImage =
await QRCode.toDataURL(
latestQR
);



res.send(`

<html>

<body style="
text-align:center;
font-family:Arial;
background:#f0f2f5;
padding-top:50px;
">

<div style="
background:white;
display:inline-block;
padding:20px;
border-radius:10px;
box-shadow:0 2px 10px rgba(0,0,0,0.1);
">

<h2>
Scan with WhatsApp
</h2>

<img
src="${qrImage}"
style="
width:300px;
height:300px;
"
/>

<p>
Scanning ke baad page auto refresh hoga.
</p>

</div>

<script>

setTimeout(()=>{

location.reload();

},15000);

</script>

</body>

</html>

`);



}catch(err){

res.send(
"QR Error: " + err.message
);

}

});



/* =========================
   SEND OTP
========================= */

app.get(
"/send",
async(req,res)=>{

try{



const {
number
} = req.query;



/* VALIDATION */

if(!number){

return res.status(400).json({

status:"error",

message:
"Number Required"

});

}



/* CONNECTION CHECK */

if(!isConnected){

return res.status(500).json({

status:"error",

message:
"WhatsApp Not Connected"

});

}



/* CLEAN NUMBER */

const cleanNumber =

number.replace(
/[^0-9]/g,
""
);



/* GENERATE OTP */

const otp =

Math.floor(
100000 + Math.random() * 900000
).toString();



/* SAVE OTP IN RAM */

otpStore.set(
cleanNumber,
otp
);



/* JID */

const jid =
`${cleanNumber}@s.whatsapp.net`;



/* SEND MESSAGE */

await sock.sendMessage(

jid,

{

text:
`🔐 *DoneKart Verification*

Your OTP for Login / Sign Up is:

✨ *${otp}*

⏳ Valid For: *5 Minutes*

⚠️ Do not share this OTP with anyone.

— Team DoneKart`

}

);



/* RESPONSE */

res.json({

status:"success",

message:
`OTP Sent To ${cleanNumber}`

});



}catch(err){

console.log(err);

res.status(500).json({

status:"error",

message:err.message

});

}

});



/* =========================
   VERIFY OTP
========================= */

app.get(
"/verify",
async(req,res)=>{

try{



const {
number,
otp
} = req.query;



/* VALIDATION */

if(!number || !otp){

return res.status(400).json({

status:"error",

message:
"Missing Fields"

});

}



/* CLEAN NUMBER */

const cleanNumber =

number.replace(
/[^0-9]/g,
""
);



/* GET OTP */

const savedOtp =
otpStore.get(
cleanNumber
);



/* OTP EXPIRED */

if(!savedOtp){

return res.status(400).json({

status:"error",

message:
"OTP Expired"

});

}



/* WRONG OTP */

if(savedOtp !== otp){

return res.status(400).json({

status:"error",

message:
"Invalid OTP"

});

}



/* DELETE OTP */

otpStore.del(
cleanNumber
);



/* SUCCESS */

res.json({

status:"success",

verified:true

});



}catch(err){

console.log(err);

res.status(500).json({

status:"error",

message:err.message

});

}

});



/* =========================
   SERVER START
========================= */

app.listen(port, ()=>{

console.log(
`Server Started On Port ${port}`
);

startWhatsApp();

});
