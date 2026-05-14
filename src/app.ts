import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import bodyParser from 'body-parser'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { flow } from './flows'
import { initRaffleService, syncRaffles, syncParticipants, recordPayment, getActiveRaffles as getRifas, getParticipants, getRaffleById, getParticipantByWhatsapp, generateTicketMessage, generatePaymentStatement } from './flows/services/raffleService'

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
            const { number, message } = req.body
            if (!number || !message) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: 'Faltan parámetros requeridos' }))
            }

            const jid = `${number}@s.whatsapp.net`

            try {
                await bot.sendMessage(jid, message, {})
                console.log('[SEND] to', number)
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
            syncParticipants(participantes)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', message: `${participantes.length} participantes sincronizados` }))
        })
    )

    adapterProvider.server.post(
        '/v1/sync/abono',
        handleCtx(async (bot, req, res) => {
            const { whatsapp, rifaId, monto, metodoPago, nota, nombre, numeros, total, totalPagado, abonos } = req.body
            if (!whatsapp || !rifaId || !monto) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ status: 'error', message: 'Faltan datos requeridos' }))
            }

            console.log('[ABONO] Recibido:', { whatsapp, rifaId, monto, nombre, total, totalPagado })

            try {
                await recordPayment(whatsapp, rifaId, monto, metodoPago || 'efectivo', nota)
                console.log('[ABONO] Payment recorded')
            } catch (e: any) {
                console.log('[ABONO] Error recordPayment:', e.message)
            }

            const jid = whatsapp.includes('@') ? whatsapp : `${whatsapp}@s.whatsapp.net`
            const statementMessage = generatePaymentStatement({
                nombre: nombre || 'Cliente',
                numeros: numeros || [],
                total: total || 0,
                totalPagado: totalPagado || 0,
                montoAbono: monto,
                metodoPago: metodoPago || 'efectivo',
                abonos: abonos || [],
            })

            console.log('[ABONO] Sending to:', jid, 'msg length:', statementMessage.length)
            await bot.sendMessage(jid, statementMessage, {})
            console.log('[ABONO] Message sent successfully')

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', message: 'Abono registrado y notificación enviada' }))
        })
    )

    adapterProvider.server.post(
        '/v1/send/ticket',
        handleCtx(async (bot, req, res) => {
            const { whatsapp, rifaId } = req.body
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
            const { whatsapp, message, urlMedia } = req.body
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

    httpServer(+PORT)
}

main()
