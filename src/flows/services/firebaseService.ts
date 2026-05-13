import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import 'dotenv/config'

let db: Firestore | null = null
let isInitialized = false

export const initializeFirebase = (): boolean => {
    if (isInitialized) return true
    
    try {
        const credEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS
        if (!credEnv) {
            console.log('[FIREBASE] No se encontraron credenciales. Usando modo local.')
            return false
        }

        const serviceAccount = typeof credEnv === 'string' ? JSON.parse(credEnv) : credEnv

        if (!serviceAccount) {
            console.log('[FIREBASE] No se encontraron credenciales. Usando modo local.')
            return false
        }

        if (getApps().length === 0) {
            initializeApp({
                credential: cert(serviceAccount),
            })
        }

        db = getFirestore()
        isInitialized = true
        console.log('[FIREBASE] Conectado a Firebase Firestore')
        return true
    } catch (error) {
        console.error('[FIREBASE] Error al inicializar:', error)
        return false
    }
}

export const getFirestoreDb = (): Firestore | null => db

export interface FirestoreRifa {
    id: string
    nombre: string
    descripcion: string
    precioNumero: number
    cantidadNumeros: number
    tipoRifa: string
    activa: boolean
    fechaSorteo?: string
    loteria?: string
    diaSorteo?: string
    numerosVendidos?: string[]
    fechaCreacion?: string
    responsable?: string
    contactoResponsable?: string
    organizacion?: string
    imagenes?: string[]
    numeroGanador?: string
}

export interface FirestoreParticipante {
    id: string
    rifaId: string
    nombre: string
    whatsapp: string
    ciudad: string
    documento?: string
    numeros: string[]
    estadoPago: string
    totalPagado: number
    fechaRegistro: string
    abonos?: any
}

const parseAbonos = (abonosData: any): Array<{ id: string; fecha: string; monto: number; metodoPago: string; nota?: string }> => {
    if (!abonosData) return []
    
    if (Array.isArray(abonosData)) {
        return abonosData
    }
    
    if (typeof abonosData === 'object') {
        return Object.entries(abonosData).map(([id, data]: [string, any]) => ({
            id,
            fecha: data.fecha || '',
            monto: data.monto || 0,
            metodoPago: data.metodoPago || 'efectivo',
            nota: data.nota,
        }))
    }
    
    return []
}

export const getRifasFromFirestore = async (): Promise<FirestoreRifa[]> => {
    if (!db) return []

    try {
        const rifasSnapshot = await db.collection('rifas').get()

        const rifas: FirestoreRifa[] = []
        for (const doc of rifasSnapshot.docs) {
            const data = doc.data()
            
            let numerosVendidos: string[] = []
            
            if (data.numeros && Array.isArray(data.numeros)) {
                numerosVendidos = data.numeros.map(String)
            } else {
                const numerosDoc = await db.collection('rifas').doc(doc.id).collection('numeros').get()
                numerosDoc.forEach(numDoc => {
                    const numData = numDoc.data()
                    if (numData.estado === 'pagado' || numData.estado === 'reservado') {
                        numerosVendidos.push(numDoc.id)
                    }
                })
            }

            const estaActiva = data.activa === true || data.activa === undefined

            rifas.push({
                id: doc.id,
                nombre: data.nombre || '',
                descripcion: data.descripcion || '',
                precioNumero: data.precioNumero || 0,
                cantidadNumeros: data.cantidadNumeros || 0,
                tipoRifa: data.tipoRifa || '2 cifras',
                activa: estaActiva,
                fechaSorteo: data.fechaSorteo,
                loteria: data.loteria,
                diaSorteo: data.diaSorteo,
                numerosVendidos,
                fechaCreacion: data.fechaCreacion,
                responsable: data.responsable,
                contactoResponsable: data.contactoResponsable,
                organizacion: data.organizacion,
                imagenes: data.imagenes || [],
                numeroGanador: data.numeroGanador,
            })
        }
        return rifas
    } catch (error) {
        console.error('[FIREBASE] Error obteniendo rifas:', error)
        return []
    }
}

export const debugRifas = async (): Promise<void> => {
    if (!db) return
    const rifasSnapshot = await db.collection('rifas').get()
    console.log('[DEBUG] Total rifas en Firestore:', rifasSnapshot.size)
    for (const doc of rifasSnapshot.docs) {
        const data = doc.data()
        console.log('[DEBUG] Rifa:', doc.id, '-', data.nombre, '- numeros:', data.numeros?.length || 0)
    }
}

export const getRifaFromFirestore = async (id: string): Promise<FirestoreRifa | null> => {
    if (!db) return null

    try {
        const doc = await db.collection('rifas').doc(id).get()
        if (!doc.exists) return null

        const data = doc.data()!
        
        let numerosVendidos: string[] = []
        
        if (data.numeros && Array.isArray(data.numeros)) {
            numerosVendidos = data.numeros.map(String)
        } else {
            const numerosDoc = await db.collection('rifas').doc(id).collection('numeros').get()
            numerosDoc.forEach(numDoc => {
                const numData = numDoc.data()
                if (numData.estado === 'pagado' || numData.estado === 'reservado') {
                    numerosVendidos.push(numDoc.id)
                }
            })
        }

        return {
            id: doc.id,
            nombre: data.nombre || '',
            descripcion: data.descripcion || '',
            precioNumero: data.precioNumero || 0,
            cantidadNumeros: data.cantidadNumeros || 0,
            tipoRifa: data.tipoRifa || '2 cifras',
            activa: data.activa ?? true,
            fechaSorteo: data.fechaSorteo,
            loteria: data.loteria,
            diaSorteo: data.diaSorteo,
            numerosVendidos,
            fechaCreacion: data.fechaCreacion,
            responsable: data.responsable,
            contactoResponsable: data.contactoResponsable,
            organizacion: data.organizacion,
            imagenes: data.imagenes || [],
            numeroGanador: data.numeroGanador,
        }
    } catch (error) {
        console.error('[FIREBASE] Error obteniendo rifa:', error)
        return null
    }
}

export const getAllParticipantesFromFirestore = async (): Promise<FirestoreParticipante[]> => {
    if (!db) return []

    try {
        const snapshot = await db.collection('participantes').get()

        return snapshot.docs.map(doc => {
            const data = doc.data()
            return {
                id: doc.id,
                rifaId: data.rifaId || '',
                nombre: data.nombre || '',
                whatsapp: data.whatsapp || '',
                ciudad: data.ciudad || '',
                documento: data.documento,
                numeros: Array.isArray(data.numeros) ? data.numeros : [],
                estadoPago: data.estadoPago || 'pendiente',
                totalPagado: data.totalPagado || 0,
                fechaRegistro: data.fechaRegistro || new Date().toISOString(),
                abonos: parseAbonos(data.abonos),
            }
        })
    } catch (error) {
        console.error('[FIREBASE] Error obteniendo todos los participantes:', error)
        return []
    }
}

export const getParticipantesFromFirestore = async (rifaId: string): Promise<FirestoreParticipante[]> => {
    if (!db) return []

    try {
        const snapshot = await db.collection('participantes')
            .where('rifaId', '==', rifaId)
            .get()

        return snapshot.docs.map(doc => {
            const data = doc.data()
            return {
                id: doc.id,
                rifaId: data.rifaId || '',
                nombre: data.nombre || '',
                whatsapp: data.whatsapp || '',
                ciudad: data.ciudad || '',
                documento: data.documento,
                numeros: Array.isArray(data.numeros) ? data.numeros : [],
                estadoPago: data.estadoPago || 'pendiente',
                totalPagado: data.totalPagado || 0,
                fechaRegistro: data.fechaRegistro || new Date().toISOString(),
                abonos: parseAbonos(data.abonos),
            }
        })
    } catch (error) {
        console.error('[FIREBASE] Error obteniendo participantes:', error)
        return []
    }
}

const getPhoneSearchFormats = (phone: string): string[] => {
    let cleaned = phone.replace(/[^\d]/g, '')
    
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1)
    }
    
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
    
    return formats.flatMap(f => [f, f + '@s.whatsapp.net'])
}

export const getParticipanteByWhatsappFromFirestore = async (whatsapp: string, rifaId?: string): Promise<FirestoreParticipante | null> => {
    if (!db) return null

    try {
        const formatsToTry = getPhoneSearchFormats(whatsapp)

        console.log('[FIREBASE] Buscando participante con formatos:', formatsToTry)

        for (const phoneFormat of formatsToTry) {
            let snapshot
            if (rifaId) {
                snapshot = await db.collection('participantes')
                    .where('whatsapp', '==', phoneFormat)
                    .where('rifaId', '==', rifaId)
                    .limit(1)
                    .get()
            } else {
                snapshot = await db.collection('participantes')
                    .where('whatsapp', '==', phoneFormat)
                    .limit(1)
                    .get()
            }

            if (!snapshot.empty) {
                const doc = snapshot.docs[0]
                const data = doc.data()
                console.log('[FIREBASE] Participante encontrado con formato:', phoneFormat, '- Nombre:', data.nombre)

                return {
                    id: doc.id,
                    rifaId: data.rifaId || '',
                    nombre: data.nombre || '',
                    whatsapp: data.whatsapp || '',
                    ciudad: data.ciudad || '',
                    documento: data.documento,
                    numeros: Array.isArray(data.numeros) ? data.numeros : [],
                    estadoPago: data.estadoPago || 'pendiente',
                    totalPagado: data.totalPagado || 0,
                    fechaRegistro: data.fechaRegistro || new Date().toISOString(),
                    abonos: parseAbonos(data.abonos),
                }
            }
        }

        console.log('[FIREBASE] No se encontró participante para:', whatsapp)
        return null
    } catch (error) {
        console.error('[FIREBASE] Error obteniendo participante:', error)
        return null
    }
}

export const saveParticipanteToFirestore = async (
    rifaId: string,
    numeros: number[],
    participante: { nombre: string; whatsapp: string; ciudad: string },
    estadoPago: string,
    total: number
): Promise<string> => {
    if (!db) return ''

    try {
        const rifa = await getRifaFromFirestore(rifaId)
        if (!rifa) return ''

        const docRef = db.collection('participantes').doc()
        const participanteId = docRef.id

        const rifaDigits = rifa.tipoRifa === '3 cifras' ? 3 : 2
        const numerosStr = numeros.map(n => n.toString().padStart(rifaDigits, '0'))

        await docRef.set({
            rifaId,
            nombre: participante.nombre,
            whatsapp: participante.whatsapp,
            ciudad: participante.ciudad,
            numeros: numerosStr,
            estadoPago,
            totalPagado: estadoPago === 'pagado' ? total : 0,
            fechaRegistro: new Date().toISOString(),
            abonos: [],
        })

        const batch = db.batch()
        for (const num of numerosStr) {
            const numRef = db.collection('rifas').doc(rifaId).collection('numeros').doc(num)
            batch.set(numRef, {
                estado: estadoPago === 'pagado' ? 'pagado' : 'reservado',
                participanteId,
                rifaId,
            })
        }
        await batch.commit()

        console.log('[FIREBASE] Participante guardado:', participante.nombre)
        return participanteId
    } catch (error) {
        console.error('[FIREBASE] Error guardando participante:', error)
        return ''
    }
}

export const recordPaymentToFirestore = async (
    whatsapp: string,
    rifaId: string,
    monto: number,
    metodoPago: string,
    nota?: string
): Promise<FirestoreParticipante | null> => {
    if (!db) return null

    try {
        const snapshot = await db.collection('participantes')
            .where('whatsapp', '==', whatsapp)
            .where('rifaId', '==', rifaId)
            .limit(1)
            .get()

        if (snapshot.empty) return null

        const docRef = db.collection('participantes').doc(snapshot.docs[0].id)
        const doc = await docRef.get()
        const data = doc.data()!

        const nuevoTotalPagado = (data.totalPagado || 0) + monto
        const rifa = await getRifaFromFirestore(rifaId)
        const totalAPagar = rifa ? rifa.precioNumero * (data.numeros?.length || 0) : 0

        let nuevoEstado = 'abonado'
        if (nuevoTotalPagado >= totalAPagar) {
            nuevoEstado = 'pagado'
        }

        const abono = {
            id: `abono-${Date.now()}`,
            fecha: new Date().toISOString(),
            monto,
            metodoPago,
            nota,
        }

        await docRef.update({
            totalPagado: nuevoTotalPagado,
            estadoPago: nuevoEstado,
            abonos: [...(data.abonos || []), abono],
        })

        console.log('[FIREBASE] Pago registrado:', monto)

        return {
            id: doc.id,
            rifaId: data.rifaId,
            nombre: data.nombre,
            whatsapp: data.whatsapp,
            ciudad: data.ciudad,
            documento: data.documento,
            numeros: data.numeros || [],
            estadoPago: nuevoEstado,
            totalPagado: nuevoTotalPagado,
            fechaRegistro: data.fechaRegistro,
            abonos: [...(data.abonos || []), abono],
        }
    } catch (error) {
        console.error('[FIREBASE] Error registrando pago:', error)
        return null
    }
}