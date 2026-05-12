const express = require('express')
const axios = require('axios')
require('dotenv').config()

const app = express()
app.use(express.json())

const respuestas = require('./respuestas.json')

function detectarRespuesta(mensaje) {
  const texto = mensaje.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const clave in respuestas) {
    if (clave === 'default') continue
    const palabras = respuestas[clave].palabras_clave || []
    if (palabras.some(palabra => texto.includes(palabra))) {
      return respuestas[clave].respuesta
    }
  }
  return respuestas.default.respuesta
}

function normalizarTelefono(telefono) {
  if (telefono.startsWith('521') && telefono.length === 13) {
    return '52' + telefono.slice(3)
  }
  return telefono
}

async function enviarMensaje(telefono, mensaje) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'text',
        text: { body: mensaje }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )
  } catch (error) {
    console.error('Error detallado:', error.response?.data)
  }
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    res.status(200).send(challenge)
  } else {
    res.sendStatus(403)
  }
})

app.post('/webhook', async (req, res) => {
  const body = req.body
  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    const message = value?.messages?.[0]
    if (message && message.type === 'text') {
      const telefono = message.from
      const texto = message.text.body
      console.log(`Mensaje de ${telefono}: ${texto}`)
      const respuesta = detectarRespuesta(texto)
      await enviarMensaje(normalizarTelefono(telefono), respuesta)
      console.log(`Respondido: ${respuesta}`)
    }
  }
  res.sendStatus(200)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Bot corriendo en puerto ${PORT}`)
})