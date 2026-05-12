const express = require('express')
const axios = require('axios')
require('dotenv').config()

const app = express()
app.use(express.json())

// Sesiones para recordar si el cliente está eligiendo vendedor
const sesiones = {}

function obtenerRespuestas() {
  delete require.cache[require.resolve('./respuestas.json')]
  return require('./respuestas.json')
}

function detectarRespuesta(mensaje) {
  const respuestas = obtenerRespuestas()
  const texto = mensaje.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  for (const clave in respuestas) {
    if (clave === 'default' || clave === 'vendedores') continue
    const palabras = respuestas[clave].palabras_clave || []
    if (palabras.some(palabra => texto.includes(palabra))) {
      return respuestas[clave].respuesta
    }
  }

  return respuestas.default.respuesta
}

function construirMenuVendedores() {
  const respuestas = obtenerRespuestas()
  const vendedores = respuestas.vendedores || []
  let menu = '👥 *Nuestros asesores disponibles:*\n\n'
  vendedores.forEach(v => {
    menu += `${v.id}️⃣ *${v.nombre}* - ${v.zona}\n`
  })
  menu += '\nResponde con el *número* del asesor con quien deseas hablar.'
  return menu
}

function obtenerVendedor(numero) {
  const respuestas = obtenerRespuestas()
  const vendedores = respuestas.vendedores || []
  return vendedores.find(v => v.id === parseInt(numero))
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
      `https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`,
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
      const telefonoNormalizado = normalizarTelefono(telefono)
      const texto = message.text.body.trim()

      console.log(`Mensaje de ${telefono}: ${texto}`)

      // Si el cliente está en proceso de elegir vendedor
      if (sesiones[telefono] === 'eligiendo_vendedor') {
        const vendedor = obtenerVendedor(texto)
        if (vendedor) {
          delete sesiones[telefono]
          const respuesta = `✅ ¡Perfecto! Te conectamos con *${vendedor.nombre}* (${vendedor.zona}).\n\nSu número de WhatsApp es: *+${vendedor.telefono}*\n\n¡Él te atenderá con gusto! 😊`
          await enviarMensaje(telefonoNormalizado, respuesta)
        } else {
          const respuesta = `Por favor elige un número válido de la lista. 👆`
          await enviarMensaje(telefonoNormalizado, respuesta)
        }
      } else {
        // Flujo normal
        const respuesta = detectarRespuesta(texto)

        if (respuesta === 'MOSTRAR_VENDEDORES') {
          sesiones[telefono] = 'eligiendo_vendedor'
          await enviarMensaje(telefonoNormalizado, construirMenuVendedores())
        } else {
          await enviarMensaje(telefonoNormalizado, respuesta)
        }
      }

      console.log(`Procesado mensaje de ${telefono}`)
    }
  }
  res.sendStatus(200)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Bot corriendo en puerto ${PORT}`)
})