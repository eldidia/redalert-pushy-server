import express from 'express'
import axios   from 'axios'
import pikudHaoref from 'pikud-haoref-api'

const app  = express()
const PORT = process.env.PORT || 3000
const PUSHY_SECRET = process.env.PUSHY_SECRET_API_KEY

app.use(express.json())

const devices = new Map()
let lastAlertIds = new Set()

app.post('/register', (req, res) => {
  const { token, cities } = req.body
  if (!token) return res.status(400).json({ error: 'token required' })
  devices.set(token, { cities: cities || [] })
  console.log(`[REG] devices: ${devices.size}`)
  res.json({ ok: true })
})

app.post('/update-cities', (req, res) => {
  const { token, cities } = req.body
  if (!token || !devices.has(token)) return res.status(404).json({ error: 'not found' })
  devices.get(token).cities = cities || []
  res.json({ ok: true })
})

// cache ישובים
let citiesCache = []
let citiesCacheTime = 0

app.get('/cities', (req, res) => {
  try {
    // הרשימה המלאה מובנית בתוך החבילה
    const cities = Object.keys(pikudHaoref.getCities())
    res.json(cities.sort())
  } catch (e) {
    res.json([])
  }
})

app.get('/cities/version', (req, res) => {
  try {
    const count = Object.keys(pikudHaoref.getCities()).length
    res.json({ count })
  } catch (e) {
    res.json({ count: 0 })
  }
})
  
app.get('/health', (req, res) => {
  res.json({ ok: true, devices: devices.size, uptime: process.uptime() })
})

async function poll() {
  try {
    const { data } = await axios.get('https://api.tzevaadom.co.il/notifications', { timeout: 3000 })
    if (!data || !Array.isArray(data) || data.length === 0) {
      if (lastAlertIds.size > 0) lastAlertIds.clear()
      return
    }
    for (const alert of data) {
  const alertId   = alert.notificationId || ''
  const cities    = alert.cities || []
  const threat    = String(alert.threat || 'missiles')
  const countdown = alert.countdown || 90
  const isDrill   = alert.isDrill || false

  if (isDrill) continue
  if (lastAlertIds.has(alertId)) continue
  lastAlertIds.add(alertId)

  console.log(`[ALERT] cities: ${cities.join(', ')} | threat: ${threat}`)

  // שלח התראה לכל עיר
  for (const city of cities) {
    await dispatch(city, threat, countdown)
  }
}
    
  } catch (e) {
    if (e.code !== 'ECONNABORTED') console.warn('[POLL]', e.message)
  }
}

async function dispatch(city, threat, countdown) {
  const targets = []
  for (const [token, device] of devices) {
    const match = device.cities.length === 0 ||
      device.cities.some(c => city.includes(c) || c.includes(city))
    if (match) targets.push(token)
  }
  if (targets.length === 0) return
  console.log(`[PUSH] → ${targets.length} devices`)
  for (let i = 0; i < targets.length; i += 100) {
    const chunk = targets.slice(i, i + 100)
    try {
      const payload = { data: { city, threat, countdown: String(countdown) }, time_to_live: 30 }
      if (chunk.length === 1) payload.to = chunk[0]
      else payload.registration_ids = chunk
      await axios.post(`https://api.pushy.me/push?api_key=${PUSHY_SECRET}`, payload, { timeout: 5000 })
    } catch (e) {
      console.error('[PUSHY]', e.response?.data || e.message)
    }
  }
}

app.listen(PORT, () => console.log(`Server on port ${PORT}`))
setInterval(poll, 500)
poll()
