#!/usr/bin/env node
import 'dotenv/config'
import { createBot, createProvider } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { flow } from './src/flows/index.js'
import { initRaffleService } from './src/flows/services/raffleService.js'

const PORT = process.env.PORT ?? 3008
let botInstance = null

const main = async () => {
    await initRaffleService()
    console.log('[APP] Servicio de rifas inicializado')

    const adapterFlow = flow

    const adapterProvider = createProvider(Provider, {
        version: [2, 3000, 1035824857]
    })
    const adapterDB = new Database()

    const { handleCtx, httpServer, bot } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })
    botInstance = bot

    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            const { number, message } = req.body
            try {
                await bot.sendMessage(number, message)
                return res.end('sended')
            } catch (e) {
                return res.end('error')
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
                await bot.sendMessage(jid, message)
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

    httpServer(+PORT)
    console.log(`[APP] Bot iniciado en puerto ${PORT}`)
}

main()