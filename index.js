const {
default: makeWASocket,
useMultiFileAuthState,
DisconnectReason,
Browsers
} = require("@whiskeysockets/baileys");

const express = require("express");

const pino = require("pino");

const NodeCache = require("node-cache");

const readline = require("readline");



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



/* =========================
   READLINE
========================= */

const rl =
readline.createInterface({

input: process.stdin,

output: process.stdout

});



let sock;

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

printQRInTerminal: false,

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



/* PAIRING CODE */

if(
!sock.authState.creds.registered
){

rl.question(

"Enter WhatsApp Number With Country Code: ",

async(number)=>{

try{



const cleanNumber =

number.replace(
/[^0-9]/g,
""
);



const code =
await sock.requestPairingCode(
cleanNumber
);



console.log("");

console.log(
"================================"
);

console.log(
"Your Pairing Code:"
);

console.log(code);

console.log(
"================================"
);

console.log("");

console.log(
"WhatsApp > Linked Devices > Link With Phone Number"
);



}catch(err){

console.log(err);

}

}

);

}



/* CONNECTION UPDATE */

sock.ev.on(
"connection.update",
(update)=>{

const {
connection,
lastDisconnect
} = update;



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

isConnected = true;

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
Bot Status: Connected
</h1>

<p>
DoneKart OTP Server Running
</p>

`);

}else{

res.send(`

<h1>
Bot Status: Not Connected
</h1>

<p>
Check Render Logs For Pairing Code
</p>

`);

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



/* SAVE OTP */

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

console.log("");

console.log(
"================================"
);

console.log(
`Server Started On Port ${port}`
);

console.log(
"================================"
);

console.log("");

startWhatsApp();

});
