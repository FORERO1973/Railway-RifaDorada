import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getFirestoreDb } from './flows/services/firebaseService'

const AUTH_DIR = join(process.cwd(), 'bot_sessions')
const SESSION_COLLECTION = 'bot_sessions'
const SESSION_DOC_ID = 'whatsapp_session'
const BACKUP_INTERVAL_MS = 30000
// Firestore limita cada documento a 1 MB. La sesión de Baileys pesa pocos KB,
// pero se avisa si crece demasiado para no guardar credenciales incompletas.
const MAX_DOC_BYTES = 900 * 1024

let _backupTimer: ReturnType<typeof setInterval> | null = null
let _backupInProgress = false

async function readDocRef() {
    const db = getFirestoreDb()
    if (!db) return null
    return db.collection(SESSION_COLLECTION).doc(SESSION_DOC_ID)
}

export async function restoreSessionFromFirestore(): Promise<boolean> {
    try {
        const docRef = await readDocRef()
        if (!docRef) {
            console.log('[AUTH-FB] Firebase no disponible, se omite la restauración de sesión.')
            return false
        }

        const snap = await docRef.get()

        if (!snap.exists) {
            console.log('[AUTH-FB] No hay sesión guardada en Firestore. Limpiando directorio local.')
            if (existsSync(AUTH_DIR)) {
                rmSync(AUTH_DIR, { recursive: true, force: true })
            }
            return false
        }

        const data = snap.data()!
        const files: Record<string, string> = data.files ?? {}

        if (Object.keys(files).length === 0) {
            console.log('[AUTH-FB] Sesión vacía en Firestore. Limpiando directorio local.')
            if (existsSync(AUTH_DIR)) {
                rmSync(AUTH_DIR, { recursive: true, force: true })
            }
            return false
        }

        // Se reemplaza el directorio completo para no mezclar credenciales
        // viejas con las restauradas.
        if (existsSync(AUTH_DIR)) {
            rmSync(AUTH_DIR, { recursive: true, force: true })
        }
        mkdirSync(AUTH_DIR, { recursive: true })

        for (const [filename, base64Content] of Object.entries(files)) {
            const buffer = Buffer.from(base64Content, 'base64')
            writeFileSync(join(AUTH_DIR, filename), buffer)
        }

        console.log(`[AUTH-FB] Sesión restaurada: ${Object.keys(files).length} archivos`)
        return true
    } catch (e) {
        console.error('[AUTH-FB] Error restaurando sesión:', e)
        return false
    }
}

async function backupSessionToFirestore(): Promise<void> {
    if (_backupInProgress) return

    try {
        if (!existsSync(AUTH_DIR)) {
            return
        }

        const fileNames = readdirSync(AUTH_DIR)
        // Sin creds.json la sesión está incompleta (p. ej. mientras se
        // regenera tras un 401) y no debe sobrescribir el backup bueno.
        if (!fileNames.includes('creds.json')) return

        const files: Record<string, string> = {}

        for (const name of fileNames) {
            const filePath = join(AUTH_DIR, name)
            try {
                const content = readFileSync(filePath)
                files[name] = content.toString('base64')
            } catch (err) {
                console.warn(`[AUTH-FB] No se pudo leer ${name}:`, err)
            }
        }

        const totalBytes = Object.values(files).reduce((sum, v) => sum + v.length, 0)
        if (totalBytes > MAX_DOC_BYTES) {
            console.error(
                `[AUTH-FB] Sesión demasiado grande para Firestore (${(totalBytes / 1024).toFixed(1)} KB > ${(MAX_DOC_BYTES / 1024).toFixed(0)} KB). Backup omitido.`
            )
            return
        }

        const docRef = await readDocRef()
        if (!docRef) return

        _backupInProgress = true
        await docRef.set({
            files,
            updatedAt: new Date().toISOString(),
        })

        const totalKB = totalBytes / 1024
        console.log(`[AUTH-FB] Backup completado: ${Object.keys(files).length} archivos (${totalKB.toFixed(1)} KB)`)
    } catch (e) {
        console.error('[AUTH-FB] Error en backup:', e)
    } finally {
        _backupInProgress = false
    }
}

export function startAutoBackup(): void {
    if (_backupTimer) {
        clearInterval(_backupTimer)
    }
    console.log(`[AUTH-FB] Backup automático cada ${BACKUP_INTERVAL_MS / 1000}s`)
    backupSessionToFirestore()
    _backupTimer = setInterval(backupSessionToFirestore, BACKUP_INTERVAL_MS)
}

export function stopAutoBackup(): void {
    if (_backupTimer) {
        clearInterval(_backupTimer)
        _backupTimer = null
    }
}

export async function clearFirestoreSession(): Promise<void> {
    try {
        const docRef = await readDocRef()
        if (!docRef) return
        await docRef.delete()
        console.log('[AUTH-FB] Sesión eliminada de Firestore (sesión expirada o inválida)')
    } catch (e) {
        console.error('[AUTH-FB] Error eliminando sesión de Firestore:', e)
    }
}
