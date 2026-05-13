import { addKeyword } from '@builderbot/bot'
import type { BotContext, BotMethods } from '@builderbot/bot/dist/types'
import { rnd, getActiveRaffles, getRaffleById, getAvailableNumbers } from './services/raffleService'

export const numbersFlow = addKeyword(['numeros', 'disponibles', 'ver numeros'])
    .addAction(async (ctx: BotContext, { flowDynamic, state }: BotMethods) => {
        const rifas = await getActiveRaffles()
        if (rifas.length === 0) {
            await flowDynamic([{ body: '😕 *No hay rifas activas* en este momento.', delay: rnd() }])
            return
        }

        const lines = rifas.map((r, i) => `${i + 1}. *${r.nombre}* — $${r.precioNumero.toLocaleString('es-CO')}`)
        await flowDynamic([{
            body: [
                '*🎯 NÚMEROS DISPONIBLES*',
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                '',
                'Selecciona una rifa para ver sus números disponibles:',
                '',
                ...lines,
                '',
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                '',
                '_Responde con el número de la rifa_',
                '_o escribe *menu* para volver_',
            ].join('\n'),
            delay: rnd(),
        }])

        await state.update({ numbersStep: 'select_raffle' })
    })
    .addAnswer('', { capture: true, idle: 60000 },
        async (ctx: BotContext, { fallBack, state, flowDynamic }: BotMethods) => {
            const input = ctx.body.trim().toLowerCase()
            if (['menu', 'inicio', 'volver', 'atrás', 'cancelar', 'salir'].includes(input)) {
                return fallBack('Responde *menu* para volver al inicio.')
            }

            const step = state.get('numbersStep')

            if (step === 'select_raffle') {
                const opt = parseInt(input, 10)
                if (isNaN(opt) || opt < 1) {
                    return fallBack('❌ *Opción inválida.*\n\nResponde con el *número* de la rifa que quieres consultar.')
                }

                const rifas = await getActiveRaffles()
                const rifa = rifas[opt - 1]
                if (!rifa) {
                    return fallBack(`❌ *Opción inválida.*\n\nElige un número entre *1* y *${rifas.length}*.`)
                }

                const disponibles = await getAvailableNumbers(rifa.id)
                if (disponibles.length === 0) {
                    await flowDynamic([{
                        body: `😕 *${rifa.nombre}*\n\nNo hay números disponibles. Todos los números ya están vendidos.`,
                        delay: rnd(),
                    }])
                    return
                }

                const total = rifa.cantidadNumeros
                const vendidos = total - disponibles.length

                await flowDynamic([{
                    body: [
                        `🏆 *${rifa.nombre}*`,
                        `💰 $${rifa.precioNumero.toLocaleString('es-CO')} c/u`,
                        '',
                        `📊 *Disponibles:* ${disponibles.length} de ${total}`,
                        `📊 *Vendidos:* ${vendidos}`,
                    ].join('\n'),
                    delay: rnd(),
                }])

                const chunkSize = 30
                const allChunks: string[] = []
                for (let i = 0; i < disponibles.length; i += chunkSize) {
                    const chunk = disponibles.slice(i, i + chunkSize)
                    allChunks.push(`*${i + 1}–${Math.min(i + chunkSize, disponibles.length)}:* ${chunk.join(', ')}`)
                }

                for (const chunk of allChunks) {
                    await flowDynamic([{ body: chunk, delay: rnd() }])
                }

                await flowDynamic([{
                    body: [
                        '',
                        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                        '',
                        'Para comprar números, *comunícate con el organizador*',
                        'o realiza el proceso desde la *App RifaDorada*.',
                        '',
                        'Responde *menu* para volver al inicio.',
                    ].join('\n'),
                    delay: rnd(),
                }])

                return
            }
        })
