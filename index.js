const express = require("express");
const cors = require("cors");

const admin = require("firebase-admin");

const {
default: makeWASocket,
DisconnectReason,
useMultiFileAuthState
} = require("@whiskeysockets/baileys");



const app = express();

const port = process.env.PORT || 3000;



app.use(cors());
app.use(express.json());



// FIREBASE

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



let sock;



// START WHATSAPP

async function startWhatsApp(){

const {
state,
saveCreds
} =
await useMultiFileAuthState("./auth");



sock = makeWASocket({

auth: state,

browser: [
"DoneKart",
"Chrome",
"1.0.0"
]

});



sock.ev.on(
"creds.update",
saveCreds
);



sock.ev.on(
"connection.update",
(update)=>{

const {
connection,
lastDisconnect
} = update;



if(connection === "close"){

const shouldReconnect =

lastDisconnect?.error?.output?.statusCode
!== DisconnectReason.loggedOut;



console.log("Disconnected");



if(shouldReconnect){

startWhatsApp();

}

}



if(connection === "open"){

console.log(
"WhatsApp Connected"
);

}

});

}



// SEND OTP

app.post(
"/send-otp",
async(req,res)=>{

try{

const number =
req.body.number;



if(!number){

return res.status(400).json({

status:"error",
message:"Number required"

});

}



// GENERATE OTP

const otp =

Math.floor(
100000 + Math.random() * 900000
).toString();



// SAVE OTP IN FIREBASE

await db
.ref("otp/" + number)
.set({

code: otp,

createdAt:
Date.now(),

expiresAt:
Date.now() + 300000

});



// SEND WHATSAPP MESSAGE

await sock.sendMessage(

number + "@s.whatsapp.net",

{

text:
`🔐 *DoneKart Verification*

Your OTP for Login / Sign Up is:

✨ *${otp}*

⏳ Valid for: *5 Minutes*

⚠️ Do not share this OTP with anyone for security reasons.

— Team DoneKart`

}

);



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



// VERIFY OTP

app.post(
"/verify-otp",
async(req,res)=>{

try{

const number =
req.body.number;

const otp =
req.body.otp;



if(!number || !otp){

return res.status(400).json({

status:"error",
message:"Missing fields"

});

}



// GET OTP FROM FIREBASE

const snapshot =
await db
.ref("otp/" + number)
.once("value");



if(!snapshot.exists()){

return res.status(400).json({

status:"error",
message:"OTP Expired"

});

}



const otpData =
snapshot.val();



// CHECK EXPIRY

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



// WRONG OTP

if(otpData.code !== otp){

return res.status(400).json({

status:"error",
message:"Invalid OTP"

});

}



// DELETE OTP AFTER SUCCESS

await db
.ref("otp/" + number)
.remove();



// VERIFIED

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



app.listen(port, ()=>{

console.log(
`Server running on port ${port}`
);

startWhatsApp();

});
