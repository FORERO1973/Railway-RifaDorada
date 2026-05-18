import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import bodyParser from 'body-parser'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname } from 'path'
import { flow } from './flows'
import { initRaffleService, syncRaffles, syncParticipants, getActiveRaffles as getRifas, getParticipants, getRaffleById, getParticipantByWhatsapp, generateTicketMessage, generatePaymentStatement } from './flows/services/raffleService'
import { setStatusImageUrl } from './sharedState'

const PORT = process.env.PORT ?? 3008
let botInstance: any = null


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
            const blacklist = bot.blacklist.getList()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', blacklist }))
        })
    )

    // ENDPOINTS DE SINCRONIZACIÓN CON LA APP
    adapterProvider.server.post(
        '/v1/sync/rifas',
        handleCtx(async (bot, req, res) => {
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
        '/v1/send/custom',
        handleCtx(async (bot, req, res) => {
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
            const rifas = await getRifas()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', rifas }))
        })
    )

    adapterProvider.server.get(
        '/v1/participantes',
        handleCtx(async (bot, req, res) => {
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

    // ===== STATUS IMAGE (desde la App) =====
    adapterProvider.server.post(
        '/v1/status-image',
        handleCtx(async (bot, req, res) => {
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
}

main()
