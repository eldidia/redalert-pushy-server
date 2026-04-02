const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());
const PUSHY_SECRET_KEY = process.env.PUSHY_SECRET_API_KEY;
const PIKUD_URL = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
let lastAlertHash = '';
setInterval(async () => {
try {
const res = await fetch(PIKUD_URL, {
headers: {
'X-Requested-With': 'XMLHttpRequest',
'Referer': 'https://www.oref.org.il/',
},
timeout: 5000,
});
const text = await res.text();
if (!text || text.trim() === '') return;
const data = JSON.parse(text);
const hash = JSON.stringify(data);
if (hash === lastAlertHash) return;
lastAlertHash = hash;
const title = data.title || 'Red Alert!';
const areas = (data.data || []).join(', ');
await fetch('https://api.pushy.me/push?api_key=' + PUSHY_SECRET_KEY, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
to: '/topics/redalert',
data: { title, areas, time: Date.now().toString() },
notification: { title: title, body: areas || 'Alert in Israel' },
}),
});
console.log('Alert pushed:', title, areas);
} catch (e) {}
}, 2000);
app.get('/', (req, res) => res.send('RedAlert Pushy Server Running'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port', PORT));
