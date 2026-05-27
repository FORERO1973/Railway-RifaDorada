import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import bodyParser from 'body-parser'
import cors from 'cors'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname } from 'path'
import { flow } from './flows'
import { initRaffleService, syncRaffles, syncParticipants, getActiveRaffles as getRifas, getParticipants, getRaffleById, getParticipantByWhatsapp, generateTicketMessage, generatePaymentStatement } from './flows/services/raffleService'
import { setStatusImageUrl, setConnectionStatus, setCurrentQrBase64 } from './sharedState'

const PORT = process.env.PORT ?? 3008
const API_KEY = process.env.API_KEY
let botInstance: any = null

function requireAuth(req: any, res: any): boolean {
    if (!API_KEY) return true // No API_KEY configured = allow all (dev mode)
    const token = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '')
    if (token === API_KEY) return true
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'error', message: 'No autorizado' }))
    return false
}

const main = async () => {
    await initRaffleService()
    console.log('[APP] Servicio de rifas inicializado')

    const adapterFlow = flow

    const adapterProvider = createProvider(Provider,
        { version: [2, 3000, 1035824857] }
    )

    const adapterDB = new Database()

    const server = adapterProvider.server as any
    if (server.wares) {
        server.wares = server.wares.map((w: (...args: any[]) => any) => {
            if (w.name === 'jsonParser') {
                return bodyParser.json({ limit: '10mb' })
            }
            return w
        })
        server.wares.unshift(cors({
            origin: [
                'https://rifadorada-92112.web.app',
                'https://rifadorada-92112.firebaseapp.com',
                'http://localhost:3000',
                'http://localhost:53663',
            ],
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        }))
    }

    const { handleCtx, httpServer, bot } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    }) as any
    botInstance = bot

    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const { number, message, imageBase64 } = req.body
            try {
                const jid = typeof number === 'string' && number.includes('@')
                    ? number
                    : `${number}@s.whatsapp.net`

                if (imageBase64) {
                    const imgBuffer = Buffer.from(imageBase64, 'base64')
                    const tmpFile = join(tmpdir(), `ticket_${Date.now()}.png`)
                    writeFileSync(tmpFile, imgBuffer)

                    const caption = message?.trim() || '🎫 *Ticket RifaDorada*'
                    await adapterProvider.sendImage(jid, tmpFile, caption)
                } else {
                    await bot.sendMessage(jid, message, {})
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'ok', message: 'Mensaje enviado' }))
            } catch (e: any) {
                console.log('[MESSAGES ERROR]', e.message)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
        })
    )

    adapterProvider.server.post(
        '/v1/send/wa',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const { number, message, organizacionId } = req.body
            if (!number || !message) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: 'Faltan parámetros requeridos' }))
            }

            const jid = `${number}@s.whatsapp.net`

            try {
                await bot.sendMessage(jid, message, {})
                console.log('[SEND] to', number, organizacionId ? `(org: ${organizacionId})` : '')
                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'ok', message: 'Mensaje enviado' }))
            } catch (e: any) {
                console.log('[SEND ERROR]', e.message)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
        })
    )

    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const { number, intent } = req.body
            if (intent === 'remove') bot.blacklist.remove(number)
            if (intent === 'add') bot.blacklist.add(number)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', number, intent }))
        })
    )

    adapterProvider.server.get(
        '/v1/blacklist/list',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const blacklist = bot.blacklist.getList()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', blacklist }))
        })
    )

    // ENDPOINTS DE SINCRONIZACIÓN CON LA APP
    adapterProvider.server.post(
        '/v1/sync/rifas',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const { rifas } = req.body
            if (!Array.isArray(rifas)) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: 'rifas debe ser un array' }))
            }
            const orgs = [...new Set(rifas.map((r: any) => r.organizacionId).filter(Boolean))]
            console.log(`[SYNC] ${rifas.length} rifas sincronizadas (${orgs.length} organizaciones)`)
            syncRaffles(rifas)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', message: `${rifas.length} rifas sincronizadas` }))
        })
    )

    adapterProvider.server.post(
        '/v1/sync/participantes',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const { participantes } = req.body
            if (!Array.isArray(participantes)) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: 'participantes debe ser un array' }))
            }
            const orgs = [...new Set(participantes.map((p: any) => p.organizacionId).filter(Boolean))]
            console.log(`[SYNC] ${participantes.length} participantes sincronizados (${orgs.length} organizaciones)`)
            syncParticipants(participantes)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', message: `${participantes.length} participantes sincronizados` }))
        })
    )

    adapterProvider.server.post(
        '/v1/sync/abono',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const { whatsapp, monto, metodoPago, nota, nombre, numeros, total, totalPagado, abonos, organizacionId } = req.body
            if (!whatsapp || !monto) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: 'Faltan datos requeridos' }))
            }

            const jid = whatsapp.includes('@') ? whatsapp : `${whatsapp}@s.whatsapp.net`
            const statementMessage = await generatePaymentStatement({
                nombre: nombre || 'Cliente',
                numeros: numeros || [],
                total: total || 0,
                totalPagado: totalPagado || 0,
                montoAbono: monto,
                metodoPago: metodoPago || 'efectivo',
                abonos: abonos || [],
                nota: nota || undefined,
                organizacionId,
            })

            await bot.sendMessage(jid, statementMessage, {})
            console.log('[ABONO] Mensaje enviado a', jid)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', message: 'Abono registrado y notificación enviada' }))
        })
    )

    adapterProvider.server.post(
        '/v1/send/ticket',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const { whatsapp, rifaId, organizacionId } = req.body
            if (!whatsapp || !rifaId) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: 'Faltan datos requeridos' }))
            }

            const rifa = await getRaffleById(rifaId)
            const participante = await getParticipantByWhatsapp(whatsapp, rifaId)

            if (!rifa || !participante) {
                res.writeHead(404, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: 'Rifa o participante no encontrado' }))
            }

            const ticketMessage = await generateTicketMessage(participante, rifa)
            await bot.sendMessage(`${whatsapp}@s.whatsapp.net`, ticketMessage, {})

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', message: 'Ticket enviado' }))
        })
    )

    adapterProvider.server.post(
        '/v1/web/ticket',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const { whatsapp, rifaNombre, numeros, participanteNombre, ciudad, precioNumero, loteria, fechaSorteo, participanteId } = req.body

            console.log('[WEB-TICKET] Request recibido:', JSON.stringify(req.body, null, 2))

            if (!whatsapp || !rifaNombre || !numeros) {
                console.log('[WEB-TICKET] Faltan parámetros')
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: 'Faltan datos requeridos' }))
            }

            let cleaned = whatsapp.replace(/[^\d]/g, '')
            if (cleaned.startsWith('0')) cleaned = cleaned.substring(1)
            if (!cleaned.startsWith('57')) cleaned = '57' + cleaned

            const jid = `${cleaned}@s.whatsapp.net`
            const numerosStr = Array.isArray(numeros) ? numeros.join(', ') : numeros
            const total = numeros.length * (precioNumero || 0)
            const shortId = participanteId ? (participanteId.length > 6 ? participanteId.substring(participanteId.length - 6).toUpperCase() : participanteId.toUpperCase()) : 'N/A'

            const lines = [
                '🎫 *RIFADORADA — TICKET*',
                '━━━━━━━━━━━━━━━━━━━━━━━',
                `🏆 *Rifa:* ${rifaNombre}`,
                `🎫 *Ticket:* #${shortId}`,
                '',
                `👤 *${participanteNombre || 'Participante'}*`,
                `📱 ${whatsapp}`,
                `📍 ${ciudad || 'N/A'}`,
                '',
                `🎯 *Números:* ${numerosStr}`,
                '',
                '━━ 💰 PAGO ━━',
                `*Total:* $${total.toLocaleString('es-CO')} COP`,
                '*Estado:* ⏳ PENDIENTE',
                '',
                '━━ 📌 ━━',
                '1. Realiza el pago a la cuenta indicada',
                '2. Envía el comprobante por este chat',
                '3. ¡Listo! Ya participas',
                '',
                ...(loteria ? [`🎰 *Sorteo:* ${loteria}`] : []),
                ...(fechaSorteo ? [`📅 *Fecha:* ${fechaSorteo}`] : []),
                '',
                '🍀 *¡Mucha suerte!*',
            ]

            const message = lines.join('\n')
            console.log('[WEB-TICKET] Enviando a:', jid)
            console.log('[WEB-TICKET] Mensaje:', message)

            try {
                console.log('[WEB-TICKET] Intentando enviar con adapterProvider...')
                await adapterProvider.sendMessage(jid, message, {})
                console.log('[WEB-TICKET] ✅ Ticket enviado exitosamente con adapterProvider')
                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'ok', message: 'Ticket enviado' }))
            } catch (e: any) {
                console.log('[WEB-TICKET] adapterProvider falló, intentando bot.sendMessage...')
                try {
                    await bot.sendMessage(jid, message, {})
                    console.log('[WEB-TICKET] ✅ Ticket enviado con bot.sendMessage')
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({ status: 'ok', message: 'Ticket enviado' }))
                } catch (e2: any) {
                    console.log('[WEB-TICKET] ❌ Error final:', e2.message)
                    res.writeHead(500, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({ status: 'error', message: e2.message }))
                }
            }
        })
    )

    adapterProvider.server.post(
        '/v1/send/custom',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const { whatsapp, message, urlMedia, organizacionId } = req.body
            if (!whatsapp || !message) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: 'Faltan datos requeridos' }))
            }

            await bot.sendMessage(whatsapp, message, { media: urlMedia ?? null })

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', message: 'Mensaje enviado' }))
        })
    )

    adapterProvider.server.get(
        '/v1/rifas',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const rifas = await getRifas()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', rifas }))
        })
    )

    adapterProvider.server.get(
        '/v1/participantes',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            const participantes = await getParticipants()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', participantes }))
        })
    )

    // ===== UPLOADS DE IMÁGENES =====
    const uploadDir = join(process.cwd(), 'uploads')
    if (!existsSync(uploadDir)) {
        mkdirSync(uploadDir, { recursive: true })
        console.log('[UPLOAD] Directorio creado:', uploadDir)
    }

    adapterProvider.server.post(
        '/v1/upload-images',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            try {
                const { images } = req.body
                if (!Array.isArray(images) || images.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({ status: 'error', message: 'Se requiere un array images no vacío' }))
                }
                if (images.length > 5) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({ status: 'error', message: 'Máximo 5 imágenes' }))
                }
                const urls: string[] = []
                for (let i = 0; i < images.length; i++) {
                    const base64Data = images[i].includes('base64,')
                        ? images[i].split('base64,')[1]
                        : images[i]
                    const buffer = Buffer.from(base64Data, 'base64')
                    const filename = `rifa_${Date.now()}_${i}.jpg`
                    writeFileSync(join(uploadDir, filename), buffer)
                    urls.push(`/uploads/${filename}`)
                }
                const host = req.headers.host || `localhost:${PORT}`
                const fullUrls = urls.map(u => `http://${host}${u}`)
                console.log('[UPLOAD]', fullUrls.length, 'imagen(es) subida(s)')
                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'ok', urls: fullUrls }))
            } catch (e: any) {
                console.log('[UPLOAD ERROR]', e.message)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
        })
    )

    adapterProvider.server.get(
        '/uploads/:filename',
        handleCtx(async (bot, req, res) => {
            const filename = req.params.filename
            if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                res.writeHead(400)
                return res.end('Invalid filename')
            }
            const filePath = join(uploadDir, filename)
            if (!existsSync(filePath)) {
                res.writeHead(404)
                return res.end('Not found')
            }
            const buffer = readFileSync(filePath)
            const mime: Record<string, string> = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.png': 'image/png', '.gif': 'image/gif',
                '.webp': 'image/webp',
            }
            const ext = extname(filename).toLowerCase()
            res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
            return res.end(buffer)
        })
    )

    adapterProvider.server.get(
        '/health',
        handleCtx(async (bot, req, res) => {
            const { getConnectionStatus } = await import('./sharedState')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({
                status: 'ok',
                connection: getConnectionStatus(),
                timestamp: new Date().toISOString(),
            }))
        })
    )

    adapterProvider.server.get(
        '/v1/status',
        handleCtx(async (bot, req, res) => {
            const { getConnectionStatus, getCurrentQrBase64 } = await import('./sharedState')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({
                status: getConnectionStatus(),
                qr: getCurrentQrBase64(),
                timestamp: new Date().toISOString(),
            }))
        })
    )

    adapterProvider.server.post(
        '/v1/status-image',
        handleCtx(async (bot, req, res) => {
            if (!requireAuth(req, res)) return
            try {
                const { rifaId, imageBase64 } = req.body
                if (!rifaId || !imageBase64) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({ status: 'error', message: 'Se requiere rifaId e imageBase64' }))
                }

                const base64Data = imageBase64.includes('base64,')
                    ? imageBase64.split('base64,')[1]
                    : imageBase64
                const buffer = Buffer.from(base64Data, 'base64')
                const filename = `status_${rifaId}.png`
                writeFileSync(join(uploadDir, filename), buffer)

                const host = req.headers.host || `localhost:${PORT}`
                const url = `http://${host}/uploads/${filename}`
                setStatusImageUrl(rifaId, url)

                console.log('[STATUS-IMAGE] Guardada para rifa', rifaId, '→', url)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'ok', url }))
            } catch (e: any) {
                console.log('[STATUS-IMAGE ERROR]', e.message)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: e.message }))
            }
        })
    )

    httpServer(+PORT)

    const prov = adapterProvider as any

    prov.on('ready', () => {
        setConnectionStatus('connected')
        setCurrentQrBase64(null)
        console.log('[STATUS] WhatsApp connected')
    })

    prov.on('require_action', (data: any) => {
        if (data?.payload?.qr) {
            setConnectionStatus('qr_pending')
            setCurrentQrBase64(data.payload.qr)
            console.log('[STATUS] QR generated')
        }
    })

    prov.on('auth_failure', () => {
        setConnectionStatus('disconnected')
        setCurrentQrBase64(null)
        console.log('[STATUS] Auth failure')
    })

    if (prov.vendor?.ev) {
        prov.vendor.ev.on('connection.update', async (update: any) => {
            const { connection, qr } = update
            if (connection === 'open') {
                setConnectionStatus('connected')
                setCurrentQrBase64(null)
            } else if (connection === 'close') {
                setConnectionStatus('disconnected')
                setCurrentQrBase64(null)
            }
            if (qr) {
                setConnectionStatus('qr_pending')
                setCurrentQrBase64(qr)
            }
        })
    }

    const checkConnection = async () => {
        try {
            const vendor = prov.vendor
            if (vendor?.user) {
                setConnectionStatus('connected')
                setCurrentQrBase64(null)
            }
        } catch (_) {
        }
    }

    setInterval(checkConnection, 30000)
}

main()
