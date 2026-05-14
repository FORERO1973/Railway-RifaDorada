import { addKeyword, EVENTS } from '@builderbot/bot'
import type { BotContext, BotMethods } from '@builderbot/bot/dist/types'
import { rnd } from './services/raffleService'

export const receiptFlow = addKeyword(EVENTS.MEDIA)
    .addAction(async (ctx: BotContext, { flowDynamic, endFlow, provider }: BotMethods) => {
        const p = provider as any
        const jid = ctx.key?.remoteJid || ctx.from
        if (jid) {
            try { await p.vendor.sendPresenceUpdate('composing', jid) } catch { }
        }
        await new Promise(r => setTimeout(r, 1500))

        await flowDynamic([{
            body: '✅ *¡Comprobante recibido!*\n\nEn breve lo revisaremos y actualizaremos tu estado de pago.\n\n📌 _Responde *menu* para volver al inicio._',
            delay: rnd(),
        }])

        if (jid) {
            try { await p.vendor.sendPresenceUpdate('paused', jid) } catch { }
        }

        return endFlow('')
    })
