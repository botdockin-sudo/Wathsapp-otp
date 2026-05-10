const {
default: makeWASocket,
useMultiFileAuthState,
DisconnectReason,
Browsers
} = require("@whiskeysockets/baileys");

const express = require("express");

const pino = require("pino");

const NodeCache = require("node-cache");



/* =========================
   EXPRESS
========================= */

const app = express();

const port =
process.env.PORT || 10000;



/* =========================
   OTP STORE
========================= */

const otpStore =
new NodeCache({

stdTTL: 300,

checkperiod: 60

});



let sock;

let isConnected = false;

let pairingCode = "";



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

printQRInTerminal: false,

logger: pino({
level: "silent"
}),

browser:
Browsers.macOS("Desktop"),

syncFullHistory: false

});



/* SAVE CREDS */

sock.ev.on(
"creds.update",
saveCreds
);



/* PAIRING CODE */

if(
!sock.authState.creds.registered
){

const number =
process.env.NUMBER;



if(number){

pairingCode =
await sock.requestPairingCode(
number
);

console.log("");

console.log(
"================================"
);

console.log(
"PAIRING CODE:"
);

console.log(
pairingCode
);

console.log(
"================================"
);

console.log("");

}

}



/* CONNECTION UPDATE */

sock.ev.on(
"connection.update",
(update)=>{

const {
connection,
lastDisconnect
} = update;



/* CLOSE */

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



/* OPEN */

else if(connection === "open"){

isConnected = true;

pairingCode = "";



console.log("");

console.log(
"================================"
);

console.log(
"WhatsApp Connected Successfully"
);

console.log(
"================================"
);

console.log("");

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
WhatsApp Connected
</h1>

<p>
DoneKart OTP Server Running
</p>

`);

}else{

res.send(`

<h1>
WhatsApp Not Connected
</h1>

<p>
Open:
<a href="/pair">
/pair
</a>
</p>

`);

}

});



/* =========================
   PAIR URL
========================= */

app.get("/pair", (req,res)=>{

if(isConnected){

return res.send(`

<h1>
WhatsApp Already Connected
</h1>

`);

}



if(!pairingCode){

return res.send(`

<h1>
Pairing Code Generating...
</h1>

<p>
Refresh after 10 seconds
</p>

`);

}



res.send(`

<html>

<body style="
font-family:Arial;
background:#f0f2f5;
display:flex;
align-items:center;
justify-content:center;
height:100vh;
">

<div style="
background:white;
padding:30px;
border-radius:20px;
text-align:center;
box-shadow:0 2px 10px rgba(0,0,0,0.1);
">

<h2>
DoneKart Pairing Code
</h2>

<div style="
font-size:40px;
font-weight:bold;
letter-spacing:5px;
margin-top:20px;
color:#2d45a0;
">

${pairingCode}

</div>

<p style="
margin-top:20px;
color:gray;
">

WhatsApp →
Linked Devices →
Link With Phone Number

</p>

</div>

</body>

</html>

`);

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



if(!number){

return res.status(400).json({

status:"error",

message:
"Number Required"

});

}



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



/* SAVE OTP */

otpStore.set(
cleanNumber,
otp
);



/* SEND */

await sock.sendMessage(

`${cleanNumber}@s.whatsapp.net`,

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



if(!savedOtp){

return res.status(400).json({

status:"error",

message:
"OTP Expired"

});

}



/* INVALID */

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
