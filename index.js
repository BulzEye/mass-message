// const { MessageType, MessageOptions, Mimetype } = require('@adiwajshing/baileys');
// const makeWASocket = require('@adiwajshing/baileys-md').default;
// const { WASocket, AuthenticationState, DisconnectReason, AnyMessageContent, BufferJSON, initInMemoryKeyStore, delay } = require('@adiwajshing/baileys-md');

const activateCmd = "Test";

const makeWASocket = require("@adiwajshing/baileys").default;
const { AnyMessageContent, delay, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, useSingleFileAuthState, MessageType, MessageOptions, Mimetype } = require("@adiwajshing/baileys");

const fs = require("fs");
const P = require("pino");
const pretty = require('pino-pretty');
const { Boom } = require("@hapi/boom");

const store = makeInMemoryStore({ logger: P().child({ level: 'debug', stream: 'store' }) })
store.readFromFile('./baileys_store_multi.json')
// save every 10s
setInterval(() => {
	store.writeToFile('./baileys_store_multi.json')
}, 10_000)

const { state, saveState } = useSingleFileAuthState('./auth_info_multi.json')

async function connectToWhatsApp () {

    const { version, isLatest } = await fetchLatestBaileysVersion()
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

    const sock = makeWASocket({
        // can provide additional config here
        logger: P({
            transport: {
                target: 'pino-pretty',
                options: {
                    translateTime: "SYS:standard"
                }
            },
        }),

        printQRInTerminal: true,
        auth: state,
		// implement to handle retries
		getMessage: async key => {
			return {
				conversation: 'hello'
			}
		}
    })

    store.bind(sock.ev);

    // listen for connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect)
            // reconnect if not logged out
            if(shouldReconnect) {
                connectToWhatsApp()
            }
        } else if(connection === 'open') {
            console.log('opened connection')
        }
    })
    sock.ev.on('messages.upsert', async m => {
        // console.log(JSON.stringify(m, undefined, 2))
        
		const msg = m.messages[0];
        // console.log(msg);
        const msgType = Object.keys(msg.message)[0];
        // console.log(msgType);

        if(msg.key.fromMe && msg.status !== 2) return;

		if(/*!msg.key.fromMe &&*/ m.type === 'notify') {
			// console.log('replying to', m.messages[0].key.remoteJid)
			// await sock.sendReadReceipt(msg.key.remoteJid, msg.key.participant, [msg.key.id])
			// await sock.sendMessage(m.messages[0].key.remoteJid, { text: 'Hello there!' })

            if(msgType === "conversation") {
                // console.log(msg);
                const msgText = msg.message.conversation;
                if(msgText.startsWith("!")) {
                    // console.log("triggered");
                    // const cmd = msgText.split(" ")[0].substring(1);
                    // let cmdContent = (msgText.indexOf(" ") < 0) ? "" : msgText.substring(msgText.indexOf(" ") + 1);
                    // switch(cmd) {
                    //     case "helloBot":
                    //         console.log("Received greeting");
                    //         const response = await sock.sendMessage(msg.key.remoteJid, {text: "Hello, World!"});
                    //         break;
                    // }
                }
                if(msgText === activateCmd && msg.key.fromMe) {
                    let myself = msg.key.participant;
                    // console.log(res);
                    // let info = Object.keys(msg.key.remoteJid)[0];
                    sock.groupMetadata(msg.key.remoteJid)
                    .then(async (meta) => {
                        console.log(meta.participants);
                        meta.participants.forEach((part) => {
                            if(part.id !== myself) {
                                fs.readFile("./msg.txt", async (err, data) => {
                                    if(err) {console.log("error in opening file: " + err);}
                                    else {
                                        sock.sendMessage(
                                            part.id, 
                                            { 
                                                image: fs.readFileSync("./manimage.jpeg"), 
                                                caption: data
                                            }
                                        )
                                        sock.sendMessage(part.id, {text: data});
                                    }
                                });
                            }
                        });
                        console.log("Sent dm to every group member");
                    });
                }
            }
            else if(msgType === "extendedTextMessage") {
                console.log(msg);
                const msgText = msg.message.extendedTextMessage.text;
                if(msgText === "!save") {
                    console.log("detected cmd");
                    console.log("Received tagged TTS");

                    console.log(msg.message.extendedTextMessage.contextInfo.quotedMessage);

                    let ogMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation;
                    fs.writeFile("./msg.txt", ogMsg, () => {
                        console.log("File updated.");
                        sock.sendMessage(msg.key.remoteJid, {text: "Updated file!"}, {quoted:msg});
                    });
                }
            }
		}
        else {
            console.log(msg);
        }
    })

    // listen for when the auth credentials is updated
	sock.ev.on('creds.update', saveState)
}

// run in main file
connectToWhatsApp().catch((err) => {console.log("ERROR in connecting: " + err);});