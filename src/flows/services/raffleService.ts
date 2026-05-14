import 'dotenv/config'
import { 
    initializeFirebase,
    getRifasFromFirestore,
    getRifaFromFirestore,
    getParticipantesFromFirestore,
    getAllParticipantesFromFirestore,
    getParticipanteByWhatsappFromFirestore,
    saveParticipanteToFirestore,
    recordPaymentToFirestore,
    getAppConfigFromFirestore,
    type FirestoreRifa,
    type FirestoreParticipante
} from './firebaseService'

export const normalizePhoneNumber = (phone: string): string => {
    let cleaned = phone.replace(/[^\d]/g, '')
    
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1)
    }
    
    if (cleaned.startsWith('57') && cleaned.length === 12) {
        return cleaned.substring(2)
    }
    
    return cleaned
}

console.log('[RAFFLE] GOOGLE_APPLICATION_CREDENTIALS existe:', !!process.env.GOOGLE_APPLICATION_CREDENTIALS)

export interface Rifa {
    id: string
    nombre: string
    descripcion: string
    precioNumero: number
    cantidadNumeros: number
    tipoRifa: '2 cifras' | '3 cifras'
    activa: boolean
    fechaSorteo?: string
    loteria?: string
    diaSorteo?: string
    imagenUrl?: string
    numerosVendidos: string[]
    responsable?: string
    contactoResponsable?: string
    organizacion?: string
    imagenes?: string[]
    numeroGanador?: string
}

export interface Participante {
    id: string
    rifaId: string
    nombre: string
    whatsapp: string
    ciudad: string
    documento?: string
    numeros: string[]
    estadoPago: 'pendiente' | 'abonado' | 'pagado'
    totalPagado: number
    fechaRegistro: string
    abonos: Abono[]
}

export interface Abono {
    id: string
    fecha: string
    monto: number
    nota?: string
    metodoPago: string
}

export interface Venta {
    rifaId: string
    numeros: number[]
    participante: {
        nombre: string
        whatsapp: string
        ciudad: string
    }
    estadoPago: string
    total: number
}

let isFirebaseReady = false

export const initRaffleService = async (): Promise<void> => {
    isFirebaseReady = initializeFirebase()
    console.log('[RAFFLE] Servicio inicializado. Firebase:', isFirebaseReady ? 'Conectado' : 'Sin conexión')
}

export const rnd = () => Math.floor(Math.random() * 800) + 500

export const syncRaffles = async (newRifas: Rifa[]): Promise<void> => {
    console.log(`[SYNC] ${newRifas.length} rifas sincronizadas desde la App`)
}

export const syncParticipants = async (newParticipants: Participante[]): Promise<void> => {
    console.log(`[SYNC] ${newParticipants.length} participantes sincronizados desde la App`)
}

export const getActiveRaffles = async (): Promise<Rifa[]> => {
    console.log('[RAFFLE] getActiveRaffles llamada, isFirebaseReady =', isFirebaseReady)
    if (isFirebaseReady === true) {
        console.log('[RAFFLE] Intentando obtener rifas de Firebase...')
        try {
            const firestoreRifas = await getRifasFromFirestore()
            console.log('[RAFFLE] Rifas de Firebase:', firestoreRifas.length)
            if (firestoreRifas.length > 0) {
                return firestoreRifas.map(r => ({
                    id: r.id,
                    nombre: r.nombre,
                    descripcion: r.descripcion,
                    precioNumero: r.precioNumero,
                    cantidadNumeros: r.cantidadNumeros,
                    tipoRifa: r.tipoRifa as '2 cifras' | '3 cifras',
                    activa: r.activa,
                    fechaSorteo: r.fechaSorteo,
                    loteria: r.loteria,
                    diaSorteo: r.diaSorteo,
                    numerosVendidos: r.numerosVendidos || [],
                    responsable: r.responsable,
                    contactoResponsable: r.contactoResponsable,
                    organizacion: r.organizacion,
                    imagenes: r.imagenes || [],
                    numeroGanador: r.numeroGanador,
                }))
            }
        } catch (error) {
            console.error('[RAFFLE] Error obteniendo rifas de Firebase:', error)
        }
    }
    return []
}

export const getRaffleById = async (id: string): Promise<Rifa | undefined> => {
    if (isFirebaseReady) {
        try {
            const rifa = await getRifaFromFirestore(id)
            if (!rifa) return undefined

            return {
                id: rifa.id,
                nombre: rifa.nombre,
                descripcion: rifa.descripcion,
                precioNumero: rifa.precioNumero,
                cantidadNumeros: rifa.cantidadNumeros,
                tipoRifa: rifa.tipoRifa as '2 cifras' | '3 cifras',
                activa: rifa.activa,
                fechaSorteo: rifa.fechaSorteo,
                loteria: rifa.loteria,
                diaSorteo: rifa.diaSorteo,
                numerosVendidos: rifa.numerosVendidos || [],
                responsable: rifa.responsable,
                contactoResponsable: rifa.contactoResponsable,
                organizacion: rifa.organizacion,
                imagenes: rifa.imagenes || [],
                numeroGanador: rifa.numeroGanador,
            }
        } catch (error) {
            console.error('[RAFFLE] Error obteniendo rifa de Firebase:', error)
        }
    }
    return undefined
}

export const getParticipants = async (): Promise<Participante[]> => {
    if (isFirebaseReady) {
        try {
            const participantes = await getAllParticipantesFromFirestore()
            console.log('[RAFFLE] Total participantes desde Firebase:', participantes.length)
            return participantes.map(p => ({
                id: p.id,
                rifaId: p.rifaId,
                nombre: p.nombre,
                whatsapp: p.whatsapp,
                ciudad: p.ciudad,
                documento: p.documento,
                numeros: p.numeros || [],
                estadoPago: p.estadoPago as 'pendiente' | 'abonado' | 'pagado',
                totalPagado: p.totalPagado || 0,
                fechaRegistro: p.fechaRegistro || new Date().toISOString(),
                abonos: p.abonos || [],
            }))
        } catch (error) {
            console.error('[RAFFLE] Error obteniendo todos los participantes:', error)
        }
    }
    return []
}

export const getParticipantByWhatsapp = async (whatsapp: string, rifaId?: string): Promise<Participante | undefined> => {
    if (isFirebaseReady) {
        try {
            const normalizedPhone = normalizePhoneNumber(whatsapp)
            console.log('[RAFFLE] Buscando participante con teléfono normalizado:', normalizedPhone)
            
            const p = await getParticipanteByWhatsappFromFirestore(normalizedPhone, rifaId)
            if (!p) return undefined

            console.log('[RAFFLE] Participante encontrado:', p.nombre, '- Estado:', p.estadoPago, '- Total pagado:', p.totalPagado)

            return {
                id: p.id,
                rifaId: p.rifaId,
                nombre: p.nombre,
                whatsapp: p.whatsapp,
                ciudad: p.ciudad,
                documento: p.documento,
                numeros: p.numeros || [],
                estadoPago: p.estadoPago as 'pendiente' | 'abonado' | 'pagado',
                totalPagado: p.totalPagado || 0,
                fechaRegistro: p.fechaRegistro || new Date().toISOString(),
                abonos: p.abonos || [],
            }
        } catch (error) {
            console.error('[RAFFLE] Error obteniendo participante de Firebase:', error)
        }
    }
    return undefined
}

export const getAllParticipantsByPhone = async (whatsapp: string): Promise<Participante[]> => {
    if (isFirebaseReady) {
        try {
            const normalizedPhone = normalizePhoneNumber(whatsapp)
            console.log('[RAFFLE] Buscando TODOS los participantes con teléfono:', normalizedPhone)
            
            const participantes = await getAllParticipantesFromFirestore()
            const phoneFormats = getPhoneSearchFormats(normalizedPhone)
            
            const filtered = participantes.filter(p => {
                const phoneTrim = (p.whatsapp || '').trim()
                return phoneFormats.some(f => phoneTrim === f.replace('@s.whatsapp.net', ''))
            })
            
            console.log('[RAFFLE] Participantes encontrados:', filtered.length)
            
            return filtered.map(p => ({
                id: p.id,
                rifaId: p.rifaId,
                nombre: p.nombre,
                whatsapp: p.whatsapp,
                ciudad: p.ciudad,
                documento: p.documento,
                numeros: p.numeros || [],
                estadoPago: p.estadoPago as 'pendiente' | 'abonado' | 'pagado',
                totalPagado: p.totalPagado || 0,
                fechaRegistro: p.fechaRegistro || new Date().toISOString(),
                abonos: p.abonos || [],
            }))
        } catch (error) {
            console.error('[RAFFLE] Error obteniendo participantes por teléfono:', error)
        }
    }
    return []
}

const getPhoneSearchFormats = (phone: string): string[] => {
    let cleaned = phone.replace(/[^\d]/g, '')
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1)
    
    const formats: string[] = []
    if (cleaned.length === 10) {
        formats.push('57' + cleaned)
        formats.push(cleaned)
    } else if (cleaned.startsWith('57') && cleaned.length === 12) {
        formats.push(cleaned)
        formats.push(cleaned.substring(2))
    } else {
        formats.push(cleaned)
    }
    
    return formats
}

export const getParticipantsByRaffle = async (rifaId: string): Promise<Participante[]> => {
    if (isFirebaseReady) {
        try {
            const participantes = await getParticipantesFromFirestore(rifaId)
            return participantes.map(p => ({
                id: p.id,
                rifaId: p.rifaId,
                nombre: p.nombre,
                whatsapp: p.whatsapp,
                ciudad: p.ciudad,
                documento: p.documento,
                numeros: p.numeros || [],
                estadoPago: p.estadoPago as 'pendiente' | 'abonado' | 'pagado',
                totalPagado: p.totalPagado || 0,
                fechaRegistro: p.fechaRegistro || new Date().toISOString(),
                abonos: p.abonos || [],
            }))
        } catch (error) {
            console.error('[RAFFLE] Error obteniendo participantes de Firebase:', error)
        }
    }
    return []
}

export const getSales = async (): Promise<Venta[]> => {
    return []
}

export const getAvailableNumbers = async (rifaId: string): Promise<string[]> => {
    const rifa = await getRaffleById(rifaId)
    if (!rifa) return []

    const vendidos = new Set(rifa.numerosVendidos || [])
    const disponibles: string[] = []
    const total = rifa.cantidadNumeros

    for (let i = 0; i < total; i++) {
        const num = i.toString().padStart(rifa.tipoRifa === '3 cifras' ? 3 : 2, '0')
        if (!vendidos.has(num)) {
            disponibles.push(num)
        }
    }
    console.log('[RAFFLE] Números disponibles:', disponibles.length)
    return disponibles
}

export const getSoldNumbers = async (rifaId: string): Promise<string[]> => {
    const rifa = await getRaffleById(rifaId)
    if (!rifa) return []
    return rifa.numerosVendidos || []
}

export const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Por definir'
    try {
        const date = new Date(dateStr)
        return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
    } catch {
        return 'Por definir'
    }
}

export const recordSale = async (
    rifaId: string,
    numeros: number[],
    participanteData: { nombre: string; whatsapp: string; ciudad: string },
    estadoPago: 'pendiente' | 'abonado' | 'pagado',
    total: number
): Promise<string> => {
    if (isFirebaseReady) {
        try {
            const id = await saveParticipanteToFirestore(rifaId, numeros, participanteData, estadoPago, total)
            console.log(`[SALE] Venta registrada en Firebase: ${participanteData.nombre}`)
            return id
        } catch (error) {
            console.error('[SALE] Error registrando venta en Firebase:', error)
        }
    }
    return ''
}

export const recordPayment = async (
    whatsapp: string,
    rifaId: string,
    monto: number,
    metodoPago: string,
    nota?: string
): Promise<Participante | null> => {
    if (isFirebaseReady) {
        try {
            const participante = await recordPaymentToFirestore(whatsapp, rifaId, monto, metodoPago, nota)
            if (participante) {
                console.log(`[PAYMENT] Pago de ${monto} registrado en Firebase`)
                return {
                    id: participante.id,
                    rifaId: participante.rifaId,
                    nombre: participante.nombre,
                    whatsapp: participante.whatsapp,
                    ciudad: participante.ciudad,
                    documento: participante.documento,
                    numeros: participante.numeros || [],
                    estadoPago: participante.estadoPago as 'pendiente' | 'abonado' | 'pagado',
                    totalPagado: participante.totalPagado || 0,
                    fechaRegistro: participante.fechaRegistro || new Date().toISOString(),
                    abonos: participante.abonos || [],
                }
            }
        } catch (error) {
            console.error('[PAYMENT] Error registrando pago en Firebase:', error)
        }
    }
    return null
}

export const generateTicketMessage = async (participante: Participante, rifa: Rifa): Promise<string> => {
    const total = rifa.precioNumero * participante.numeros.length
    const restante = total - participante.totalPagado

    const estadoEmoji = participante.estadoPago === 'pagado' ? '✅' : participante.estadoPago === 'abonado' ? '💳' : '⏳'
    const estadoTexto = participante.estadoPago === 'pagado' ? 'PAGADO' : participante.estadoPago === 'abonado' ? 'ABONADO' : 'PENDIENTE'

    const fecha = new Date(participante.fechaRegistro).toLocaleDateString('es-CO', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })

    let labelCuenta = 'la cuenta indicada'
    try {
        const config = await getAppConfigFromFirestore()
        if (config?.numeroCuenta?.trim()) {
            labelCuenta = `${config.numeroCuenta.trim()} (*${(config.metodoPago || '').toUpperCase()})`
        }
    } catch { }

    const numeros = [...participante.numeros].sort((a, b) => parseInt(a) - parseInt(b)).join(', ')

    const lines = [
        '🎫 *RIFADORADA — TICKET*',
        '━━━━━━━━━━━━━━━━━━━━━━━',
        `🏆 *Rifa:* ${rifa.nombre}`,
        `📅 ${fecha}`,
        '',
        `👤 *${participante.nombre}*`,
        `📱 ${participante.whatsapp}`,
        `📍 ${participante.ciudad}`,
        '',
        `🎯 *Números:* ${numeros}`,
        '',
        '━━ 💰 PAGO ━━',
        `*Total:* $${total.toLocaleString('es-CO')} COP`,
        `*Pagado:* $${participante.totalPagado.toLocaleString('es-CO')} COP`,
        ...(restante > 0 ? [`*Restante:* $${restante.toLocaleString('es-CO')} COP`] : []),
        `*Estado:* ${estadoEmoji} ${estadoTexto}`,
        '',
        '━━ 📌 ━━',
        `1. Transfiere a ${labelCuenta}`,
        '2. Envía el comprobante por este chat',
        '3. ¡Listo! Ya participas',
        '',
        '📞 _¿Dudas? Escribe y te ayudamos_',
        '',
        '🍀 *¡Mucha suerte!*',
    ]

    return lines.join('\n')
}

export const generatePaymentConfirmation = (participante: Participante, rifa: Rifa, monto: number): string => {
    const total = rifa.precioNumero * participante.numeros.length
    const restante = total - participante.totalPagado

    return [
        '💰 *PAGO REGISTRADO*',
        '━━━━━━━━━━━━━━━━━━━',
        `🏆 *${rifa.nombre}*`,
        `👤 ${participante.nombre}`,
        `🎯 ${participante.numeros.join(', ')}`,
        '',
        `✅ *Abono:* $${monto.toLocaleString('es-CO')} COP`,
        `💵 *Pagado:* $${participante.totalPagado.toLocaleString('es-CO')} COP`,
        restante > 0 ? `⏳ *Restante:* $${restante.toLocaleString('es-CO')} COP` : '✅ *¡Totalmente pagado!*',
        '',
        participante.estadoPago === 'pagado'
            ? '🎉 ¡Felicidades! Completaste el pago.'
            : '📌 _Recuerda que aún falta por pagar._',
    ].join('\n')
}

export interface AbonoData {
    fecha: string
    monto: number
    metodoPago: string
}

export interface StatementInput {
    nombre: string
    numeros: string[]
    total: number
    totalPagado: number
    montoAbono: number
    metodoPago: string
    abonos: AbonoData[]
}

export const generatePaymentStatement = (input: StatementInput): string => {
    const { nombre, numeros, total, totalPagado, montoAbono, metodoPago, abonos } = input
    const restante = total - totalPagado
    const estadoTotal = restante <= 0 ? '✅ PAGADO' : totalPagado > 0 ? '💳 ABONADO' : '⏳ PENDIENTE'

    const abonosLines = abonos.map((a, i) => {
        const fecha = new Date(a.fecha).toLocaleDateString('es-CO', {
            day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit',
        })
        return `${i + 1}. ${fecha} — $${a.monto.toLocaleString('es-CO')} (${a.metodoPago})`
    })

    const lines: string[] = [
        '💰 *ESTADO DE CUENTA*',
        '━━━━━━━━━━━━━━━━━━━━━━',
        `👤 *${nombre}*`,
        `🎯 Números: ${numeros.join(', ')}`,
        '',
        '━━ 💰 RESUMEN ━━',
        `*Total:* $${total.toLocaleString('es-CO')} COP`,
        `*Pagado:* $${totalPagado.toLocaleString('es-CO')} COP`,
        ...(restante > 0 ? [`*Restante:* $${restante.toLocaleString('es-CO')} COP`] : []),
        `*Estado:* ${estadoTotal}`,
        '',
    ]

    if (abonosLines.length > 0) {
        lines.push('━━ 📋 ABONOS ━━')
        lines.push(...abonosLines)
        lines.push('')
    }

    lines.push(
        `✅ *Nuevo abono:* $${montoAbono.toLocaleString('es-CO')} (${metodoPago})`,
        '',
        restante <= 0
            ? '🎉 *¡Totalmente pagado!* Gracias por tu compromiso.'
            : `📌 _Restante: $${restante.toLocaleString('es-CO')} COP_`,
    )

    return lines.join('\n')
}

export const getContactInfo = async (): Promise<{ responsable?: string; contactoResponsable?: string; organizacion?: string } | null> => {
    if (isFirebaseReady) {
        try {
            const config = await getAppConfigFromFirestore()
            if (config && (config.responsable || config.telefono || config.organizacion)) {
                return {
                    responsable: config.responsable,
                    contactoResponsable: config.telefono,
                    organizacion: config.organizacion,
                }
            }

            const rifas = await getRifasFromFirestore()
            const activas = rifas.filter(r => r.activa)
            for (const r of activas) {
                if (r.responsable || r.contactoResponsable || r.organizacion) {
                    return {
                        responsable: r.responsable,
                        contactoResponsable: r.contactoResponsable,
                        organizacion: r.organizacion,
                    }
                }
            }
        } catch (error) {
            console.error('[RAFFLE] Error obteniendo info de contacto:', error)
        }
    }
    return null
}

export const generateAvailableNumbersMessage = async (rifa: Rifa): Promise<{ text: string; chunks: string[] }> => {
    const disponibles = await getAvailableNumbers(rifa.id)
    const chunks: string[] = []

    for (let i = 0; i < disponibles.length; i += 30) {
        chunks.push(disponibles.slice(i, i + 30).join(', '))
    }

    const text = [
        `🎯 *Números disponibles - ${rifa.nombre}*`,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        `Total: *${disponibles.length}* de *${rifa.cantidadNumeros}*`,
        '',
        chunks.join('\n\n'),
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        '_Responde *comprar* para participar_',
    ].join('\n')

    return { text, chunks }
}