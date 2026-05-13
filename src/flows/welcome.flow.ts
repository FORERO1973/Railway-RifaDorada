import { addKeyword, EVENTS } from '@builderbot/bot'
import type { BotContext, BotMethods } from '@builderbot/bot/dist/types'
import {
    rnd,
    getActiveRaffles,
    getRaffleById,
    getAllParticipantsByPhone,
    getAvailableNumbers,
    normalizePhoneNumber,
    getContactInfo,
} from './services/raffleService'
import { numbersFlow } from './numbers.flow'

const waitT = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const MENU_TEXT = [
    '*📋 MENÚ PRINCIPAL*',
    '',
    '*1* 🎯 Ver rifas disponibles',
    '*2* 🎟️ Mis números',
    '*3* 💳 Estado de pago',
    '*4* 🔢 Números disponibles',
    '*5* 📞 Contactar',
    '',
    '_Responde con el número de tu opción_',
].join('\n')

const INVALID_OPT = 'Responde *1*, *2*, *3*, *4* o *5*'
const VALID_OPTS = ['1', '2', '3', '4', '5']

export const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAnswer('👋 *¡Hola! Bienvenido a RifaDorada* 🎉', { delay: rnd() })
    .addAnswer(MENU_TEXT, { capture: true, idle: 60000 },
        async (ctx: BotContext, { fallBack, state }: BotMethods) => {
            const opt = ctx.body.trim()
            if (opt.toLowerCase() === 'menu' || opt.toLowerCase() === 'inicio') return
            if (!VALID_OPTS.includes(opt)) {
                return fallBack(INVALID_OPT)
            }
            await state.update({ menuOption: opt })
        })
    .addAction(async (ctx: BotContext, { flowDynamic, state, gotoFlow, provider }: BotMethods) => {
        const opt = state.get('menuOption')
        const userNumber = normalizePhoneNumber(ctx.from || '')
        const jid = ctx.key?.remoteJid || ctx.from

        const p = provider as any
        const sendWithPresence = async (body: string, delayMs: number = rnd()) => {
            if (jid) {
                try { await p.vendor.sendPresenceUpdate('composing', jid) } catch {}
            }
            await waitT(800)
            await flowDynamic([{ body, delay: delayMs }])
            if (jid) {
                try { await p.vendor.sendPresenceUpdate('paused', jid) } catch {}
            }
        }

        if (opt === '1') {
            const rifas = await getActiveRaffles()
            if (rifas.length === 0) {
                await sendWithPresence('😕 *No hay rifas activas* en este momento.\n\nVuelve a intentar más tarde.')
                return
            }
            const lines = rifas.map((r, i) => {
                const disp = r.cantidadNumeros - (r.numerosVendidos?.length || 0)
                const estado = r.fechaSorteo ? `📅 Sorteo: ${r.fechaSorteo}` : ''
                return `${i + 1}. *${r.nombre}*\n   💰 $${r.precioNumero.toLocaleString('es-CO')} c/u\n   🎯 ${disp} de ${r.cantidadNumeros} disponibles\n   ${estado}`
            })
            await sendWithPresence('🎯 *RIFAS DISPONIBLES*\n\n' + lines.join('\n\n'))
            await sendWithPresence('Para ver los números disponibles de una rifa, elige la opción *4* en el menú.')
            return
        }

        if (opt === '2') {
            await sendWithPresence('🔍 *Buscando tus números...*', 100)
            const participantes = await getAllParticipantsByPhone(userNumber)

            if (participantes.length === 0) {
                await sendWithPresence([
                    '❌ *No encontramos números registrados*',
                    '',
                    `📱 Tu número: ${userNumber}`,
                    '',
                    'Si compraste números, espera unos minutos y vuelve a intentar.',
                    'Si el problema persiste, contacta al organizador.',
                ].join('\n'))
                return
            }

            const lines = []
            for (const p of participantes) {
                const rifa = await getRaffleById(p.rifaId)
                if (rifa) {
                    const estado = p.estadoPago === 'pagado' ? '✅ PAGADO' : p.estadoPago === 'abonado' ? '💳 ABONADO' : '⏳ PENDIENTE'
                    const total = rifa.precioNumero * p.numeros.length
                    const faltante = total - p.totalPagado
                    lines.push([
                        `🏆 *${rifa.nombre}*`,
                        `🎯 Números: ${p.numeros.join(', ')}`,
                        `💰 Total: $${total.toLocaleString('es-CO')}`,
                        `💵 Pagado: $${p.totalPagado.toLocaleString('es-CO')}`,
                        `📊 Estado: ${estado}`,
                    ].join('\n'))
                }
            }

            await sendWithPresence('🎟️ *TUS NÚMEROS*\n\n' + lines.join('\n\n'))
            return
        }

        if (opt === '3') {
            await sendWithPresence('🔍 *Consultando tu estado de pago...*', 100)
            const participantes = await getAllParticipantsByPhone(userNumber)

            if (participantes.length === 0) {
                await sendWithPresence('❌ *No encontramos registros* con tu número.\n\nSi compraste números, espera unos minutos y vuelve a intentar.')
                return
            }

            const lines = []
            for (const p of participantes) {
                const rifa = await getRaffleById(p.rifaId)
                if (rifa) {
                    const total = rifa.precioNumero * p.numeros.length
                    const faltante = total - p.totalPagado
                    const estadoEmoji = p.estadoPago === 'pagado' ? '✅' : p.estadoPago === 'abonado' ? '💳' : '⏳'
                    const estadoTexto = p.estadoPago === 'pagado' ? 'PAGADO' : p.estadoPago === 'abonado' ? 'ABONADO' : 'PENDIENTE'
                    lines.push([
                        `🏆 *${rifa.nombre}*`,
                        `🎯 Números: ${p.numeros.join(', ')}`,
                        `💰 Total: $${total.toLocaleString('es-CO')}`,
                        `💵 Pagado: $${p.totalPagado.toLocaleString('es-CO')}`,
                        faltante > 0 ? `⏳ Faltante: $${faltante.toLocaleString('es-CO')}` : '✅ *¡Totalmente pagado!*',
                        '',
                        `📊 ${estadoEmoji} ${estadoTexto}`,
                    ].join('\n'))
                }
            }

            await sendWithPresence('💳 *ESTADO DE PAGO*\n\n' + lines.join('\n\n---\n\n'))

            const pendientes = participantes.filter(p => p.estadoPago !== 'pagado')
            if (pendientes.length > 0) {
                await sendWithPresence('📌 *¿Cómo pagar?*\n\n1. Realiza la consignación al número de cuenta indicado por el organizador\n2. Envía el comprobante al organizador\n3. ¡Listo! Actualizaremos tu estado')
            }
            return
        }

        if (opt === '4') {
            return gotoFlow(numbersFlow)
        }

        if (opt === '5') {
            const contacto = await getContactInfo()
            if (contacto) {
                await sendWithPresence([
                    '📞 *CONTACTO*',
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    '',
                    contacto.organizacion ? `🏢 *${contacto.organizacion}*` : '',
                    contacto.responsable ? `👤 *Responsable:* ${contacto.responsable}` : '',
                    contacto.contactoResponsable ? `📱 *Teléfono:* ${contacto.contactoResponsable}` : '',
                    '',
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    '',
                    'Responde *menu* para volver al inicio.',
                ].filter(Boolean).join('\n'))
            } else {
                await sendWithPresence('📞 *CONTACTO*\n\nPor favor, comunícate con el organizador de tu rifa.\n\nResponde *menu* para volver al inicio.')
            }
            return
        }

        await sendWithPresence('Usa *menu* para volver')
    })
