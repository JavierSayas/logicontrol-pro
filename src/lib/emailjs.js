import emailjs from '@emailjs/browser'

const SERVICE_ID = 'service_jbcfxy9'
const TEMPLATE_ID = 'template_liksd5k'
const PUBLIC_KEY = 'sDvAV_igGbGGQTvJ3'

export async function notificarIncidencia(params) {
  return emailjs.send(SERVICE_ID, TEMPLATE_ID, params, {
    publicKey: PUBLIC_KEY,
  })
}
