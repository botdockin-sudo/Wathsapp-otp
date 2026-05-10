const {
default: makeWASocket,
useMultiFileAuthState,
DisconnectReason
} = require("@whiskeysockets/baileys");

const express = require("express");

const qrcode = require("qrcode-terminal");

const pino = require("pino");

const admin = require("firebase-admin");



/* =========================
   FIREBASE
========================= */

const serviceAccount =
require("./serviceAccountKey.json");



admin.initializeApp({

credential:
admin.credential.cert(serviceAccount),

databaseURL:
"https://donekart-1f33e-default-rtdb.firebaseio.com"

});



const db =
admin.database();



/* =========================
   EXPRESS
========================= */

const app = express();

const port =
process.env.PORT || 10000;



let sock;



/* =========================
   WHATSAPP START
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
})

});



/* SAVE SESSION */

sock.ev.on(
"creds.update",
saveCreds
);



/* CONNECTION */

sock.ev.on(
"connection.update",
async(update)=>{

const {
connection,
lastDisconnect,
qr
} = update;



/* QR */

if(qr){

console.log("");
console.log("================================");
console.log("SCAN THIS QR CODE");
console.log("================================");

qrcode.generate(qr,{
small:true
});

}



/* DISCONNECTED */

if(connection === "close"){

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
   HOME ROUTE
========================= */

app.get("/", (req,res)=>{

res.send(
"DoneKart OTP Server Running"
);

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
message:"Number Required"

});

}



/* WHATSAPP CHECK */

if(!sock){

return res.status(500).json({

status:"error",
message:"WhatsApp Not Connected"

});

}



/* GENERATE OTP */

const otp =

Math.floor(
100000 + Math.random() * 900000
).toString();



/* SAVE OTP IN FIREBASE */

await db
.ref("otp/" + number)
.set({

code: otp,

createdAt:
Date.now(),

expiresAt:
Date.now() + 300000

});



/* JID */

const jid =

number.includes("@s.whatsapp.net")
? number
: `${number}@s.whatsapp.net`;



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
message:"OTP Sent"

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
message:"Missing Fields"

});

}



/* GET OTP */

const snapshot =
await db
.ref("otp/" + number)
.once("value");



/* OTP NOT FOUND */

if(!snapshot.exists()){

return res.status(400).json({

status:"error",
message:"OTP Expired"

});

}



const otpData =
snapshot.val();



/* EXPIRED */

if(
Date.now() >
otpData.expiresAt
){

await db
.ref("otp/" + number)
.remove();



return res.status(400).json({

status:"error",
message:"OTP Expired"

});

}



/* WRONG OTP */

if(
otpData.code !== otp
){

return res.status(400).json({

status:"error",
message:"Invalid OTP"

});

}



/* DELETE OTP */

await db
.ref("otp/" + number)
.remove();



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
`Server started on port ${port}`
);

startWhatsApp();

});
