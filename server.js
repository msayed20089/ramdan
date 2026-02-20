const express = require('express');
const axios = require('axios');
const app = express();
const path = require('path');

// ===== الرقم الثابت اللي بيجيب الكروت =====
const SOURCE_NUMBER = "01030631662";
const SOURCE_PASS = "Mrvip#219";

// متغيرات عامة
let token = null;
let cardsCache = [];
let lastUpdate = null;
let loopCount = 0;

const BASE_HEADERS = {
    'User-Agent': "okhttp/4.12.0",
    'Accept': "application/json, text/plain, */*",
    'Accept-Encoding': "gzip",
    'silentLogin': "true",
    'x-agent-operatingsystem': "13",
    'clientId': "AnaVodafoneAndroid",
    'Accept-Language': "ar",
    'x-agent-device': "Xiaomi 21061119AG",
    'x-agent-version': "2025.10.3",
    'x-agent-build': "1050",
    'digitalId': "28RI9U7ISU8SW",
    'device-id': "1df4efae59648ac3"
};

async function getToken() {
    const url = "https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token";
    const payload = new URLSearchParams({
        'grant_type': "password",
        'username': SOURCE_NUMBER,
        'password': SOURCE_PASS,
        'client_secret': "95fd95fb-7489-4958-8ae6-d31a525cd20a",
        'client_id': "ana-vodafone-app"
    });

    try {
        const response = await axios.post(url, payload, { 
            headers: BASE_HEADERS,
            timeout: 15000 
        });
        return response.data.access_token;
    } catch (error) {
        console.error("خطأ في الحصول على التوكن:", error.message);
        return null;
    }
}

async function getCards(token) {
    const url = "https://web.vodafone.com.eg/services/dxl/ramadanpromo/promotion";
    const params = {
        '@type': "RamadanHub",
        'channel': "website",
        'msisdn': SOURCE_NUMBER,
    };
    
    const headers = {
        'User-Agent': "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36",
        'Accept': "application/json",
        'Accept-Encoding': "gzip, deflate, br, zstd",
        'sec-ch-ua-platform': '"Android"',
        'Authorization': `Bearer ${token}`,
        'Accept-Language': "AR",
        'msisdn': SOURCE_NUMBER,
        'x-dtpc': "8$236865958_170h3vNNPAVAHHAVSOMLKCAVWUPFJLCHRGGDMJ-0e0",
        'clientId': "WebsiteConsumer",
        'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
        'sec-ch-ua-mobile': "?1",
        'api-host': "PromotionHost",
        'channel': "APP_PORTAL",
        'Content-Type': "application/json",
        'Referer': "https://web.vodafone.com.eg/portal/hub",
    };

    try {
        const response = await axios.get(url, { params, headers, timeout: 15000 });
        return response.data[1].pattern;
    } catch (error) {
        console.error("خطأ في جلب الكروت:", error.message);
        return null;
    }
}

function processCards(cards) {
    const result = [];
    if (!cards) return result;

    let count = 0;
    for (const x of cards) {
        try {
            const amount = x.action[0].characteristics[0].value;
            const units = x.action[0].characteristics[1].value;
            const card = x.action[0].characteristics[3].value;

            if (card.startsWith('014') || card.startsWith('01') || parseFloat(units) <= 1) {
                continue;
            }

            count++;
            result.push({
                number: count,
                card: card,
                units: units,
                amount: amount
            });
        } catch (e) {
            continue;
        }
    }
    return result;
}

// تحديث الكروت كل 5 ثواني
async function updateCardsLoop() {
    while (true) {
        try {
            loopCount++;
            
            // جدد التوكن كل 20 دورة
            if (loopCount % 20 === 0) {
                const newToken = await getToken();
                if (newToken) token = newToken;
            }

            if (!token) {
                token = await getToken();
            }

            if (token) {
                const newCards = await getCards(token);
                if (newCards) {
                    cardsCache = processCards(newCards);
                    lastUpdate = new Date();
                }
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            console.error("خطأ في حلقة التحديث:", error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// API Routes
app.get('/api/cards', (req, res) => {
    res.json({
        success: true,
        data: cardsCache,
        last_update: lastUpdate ? lastUpdate.toLocaleTimeString('ar-EG') : 'لم يتم التحديث بعد',
        total: cardsCache.length,
        timestamp: new Date().toLocaleTimeString('ar-EG')
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        token_valid: token !== null,
        last_update: lastUpdate ? lastUpdate.toLocaleTimeString('ar-EG') : null,
        cards_count: cardsCache.length
    });
});

app.get('/api/refresh', async (req, res) => {
    const newToken = await getToken();
    if (newToken) {
        token = newToken;
        res.json({ success: true, message: 'تم تحديث التوكن بنجاح' });
    } else {
        res.json({ success: false, message: 'فشل تحديث التوكن' });
    }
});

// تشغيل السيرفر
const PORT = 3000;
app.listen(PORT, async () => {
    console.log('━'.repeat(55));
    console.log('       ★  Vodafone Card Viewer API  ★');
    console.log('━'.repeat(55));
    console.log('\n⏳ جاري تسجيل الدخول...');
    
    token = await getToken();
    if (token) {
        console.log('✅ تم تسجيل الدخول بنجاح!');
        console.log(`🌐 السيرفر شغال على: http://localhost:${PORT}`);
        console.log('━'.repeat(55));
        
        // بدء تحديث الكروت
        updateCardsLoop();
    } else {
        console.log('❌ فشل تسجيل الدخول! تأكد من الرقم والباسورد');
        process.exit(1);
    }
});
