import express from 'express'
import axios   from 'axios'

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
      const city      = alert.city || alert.name || alert.value || ''
      const alertId   = `${city}-${alert.threat || 'alert'}`
      const countdown = alert.countdown || 90
      const threat    = alert.threat || 'missiles'
      if (lastAlertIds.has(alertId)) continue
      lastAlertIds.add(alertId)
      console.log(`[ALERT] ${city} | ${threat} | ${countdown}s`)
      await dispatch(city, threat, countdown)
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
