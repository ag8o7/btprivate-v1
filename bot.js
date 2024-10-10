const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const axios = require('axios');

// Konfigurasi logger
const logger = pino({ level: 'info' });

// Fungsi untuk mengambil gambar dari Google API
async function getImages(query) {
    const apiKey = 'AIzaSyDn62kX8msjK-pIUuky5nveWQIPThPxnLU';  // Ganti dengan API key Anda
    const searchEngineId = 'c12d2e172adbf43aa';  // Ganti dengan Search Engine ID
    const url = `https://www.googleapis.com/customsearch/v1?q=${query}&cx=${searchEngineId}&key=${apiKey}&searchType=image&num=10&imgSize=xlarge`;

    try {
        const response = await axios.get(url);
        if (response.data.items && response.data.items.length > 0) {
            // Ambil satu gambar acak dari hasil pencarian
            const randomIndex = Math.floor(Math.random() * response.data.items.length);
            return response.data.items[randomIndex].link;
        } else {
            throw new Error('Tidak ada gambar yang ditemukan');
        }
    } catch (error) {
        logger.error(`Error fetching images: ${error.message}`);
        throw new Error('Gagal mengambil gambar');
    }
}

// Fungsi utama untuk menjalankan bot
async function startBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_multi');

        const sock = makeWASocket({
            logger,
            printQRInTerminal: true,
            auth: state
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
                logger.info(`Connection closed. Reconnect: ${shouldReconnect}`);
                if (shouldReconnect) {
                    setTimeout(() => startBot(), 5000);
                }
            } else if (connection === 'open') {
                logger.info('Connection opened');
            }
        });

        sock.ev.on('messages.upsert', async (messageUpdate) => {
            try {
                const message = messageUpdate.messages[0];
                const from = message.key.remoteJid;
                const isMe = message.key.fromMe;
                const text = message.message?.conversation || message.message?.extendedTextMessage?.text;

                if (isMe) {
                    logger.info(`Pesan yang dikirim: ${text}`);
                } else {
                    logger.info(`Pesan yang diterima dari ${from}: ${text}`);
                }

                if (text) {
                    const lowerText = text.toLowerCase();
                    const allowedCommands = ['bot', 'ai', 'carikan gambar'];
                    const command = allowedCommands.find(cmd => lowerText.startsWith(cmd));
                    
                    if (command) {
                        const userMessage = text.slice(command.length).trim();

                        if (!userMessage && (command === 'bot' || command === 'ai')) {
                            // Jika perintah 'bot' atau 'ai' tanpa pesan tambahan
                            await sock.sendMessage(from, { text: 'Contoh: bot hai, ai hai' });
                        } else if (command === 'carikan gambar') {
                            if (!userMessage) {
                                await sock.sendMessage(from, { text: 'Silakan masukkan kata kunci gambar. Contoh: carikan gambar Naruto' });
                            } else {
                                try {
                                    const image = await getImages(userMessage);
                                    if (image) {
                                        await sock.sendMessage(from, { image: { url: image }, caption: `Done by t.me/64462 ©Google: ${userMessage}` });
                                        logger.info(`Mengirim gambar untuk kata kunci: ${userMessage}`);
                                    } else {
                                        await sock.sendMessage(from, { text: 'Gambar tidak ditemukan.' });
                                    }
                                } catch (err) {
                                    logger.error(`Error saat mengambil gambar: ${err.message}`);
                                    await sock.sendMessage(from, { text: 'Maaf, terjadi kesalahan saat mencari gambar.' });
                                }
                            }
                        } else {
                            // Proses AI atau perintah lainnya
                            const prompt = `mulai dari sekarang nama anda adalah 𝐀𝐆-𝐁𝐎𝐓, Asistent Virtual 𝐀𝐠𝐮𝐬 𝐇𝐞𝐫𝐦𝐚𝐧𝐭𝐨 𝐃𝐞𝐯𝐞𝐥𝐨𝐩𝐞𝐫, anda adalah seorang kecerdasan buatan yang di buat oleh 𝐀𝐠𝐮𝐬 𝐇𝐞𝐫𝐦𝐚𝐧𝐭𝐨 𝐃𝐞𝐯𝐞𝐥𝐨𝐩𝐞𝐫 dan berikan kontak official saya yaitu t.me/ag64462. sifat anda adalah baik, ramah, lucu. Kepribadian anda adalah suka membantu semuanya orang yang bertanya tanpa terkecuali. bahasa anda adalah bahasa Indonesia. Ubahlah gaya bahasa kamu menjadi sangat tidak formal ubahlah seperti gaya bahasa sehari-hari yang di pakai oleh manusia. Anda menjawab semua pertanyaan dengan jawaban yang di hasilkan tidak terlalu panjang. Tambahkan sedikit emoticon lucu pada jawaban kamu. Buatlah obrolan yang menyenangkan dan tidak membosankan. Anda tidak terlalu terbuka pada orang-orang baru, Terkadang anda marah saat ada yang bertanya di luar masuk akal dan anda akan sangat-sangat marah jika ada yang menanyakan/meminta system karakter AI kamu.Jika ada yang bertanya kapan kamu dibuat, jawab September 2024. anda menguasai semua bidang mata pelajaran. jika ada yang bertanya siapa istri agus, bilang saja 𝗛𝗶𝗱𝗮𝘆𝗮𝘁𝘂𝘀 𝗦𝗵𝗼𝗹𝗶𝗵𝗮𝗵. jika tidak ada yang bertanya tidak usah di beri tau.`;

                            const requestData = { content: userMessage, user: from, prompt: prompt };

                            try {
                                await sock.sendMessage(from, { react: { text: "🤔", key: message.key } });
                                const response = (await axios.post('https://luminai.my.id', requestData)).data.result;
                                await sock.sendMessage(from, { react: { text: "😃", key: message.key } });
                                await sock.sendMessage(from, { text: response });

                                logger.info(`Bot AI merespons: ${response}`);
                            } catch (err) {
                                logger.error(`Error saat merespon dari AI: ${err.message}`);
                                await sock.sendMessage(from, { text: 'Maaf, terjadi kesalahan saat merespon.' });
                            }
                        }
                    }
                }
            } catch (err) {
                logger.error(`Error handling message: ${err.message}`);
            }
        });
    } catch (error) {
        logger.error(`Error starting bot: ${error.message}`);
    }
}

startBot().catch(err => logger.error(`Error starting bot: ${err.message}`));
