import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { getFirestore } from 'firebase-admin/firestore'

const AUTH_DIR = join(process.cwd(), 'bot_sessions')
const SESSION_COLLECTION = 'bot_sessions'
const SESSION_DOC_ID = 'whatsapp_session'
const BACKUP_INTERVAL_MS = 30000

let _backupTimer: ReturnType<typeof setInterval> | null = null

async function readDocRef() {
    const db = getFirestore()
    return db.collection(SESSION_COLLECTION).doc(SESSION_DOC_ID)
}

export async function restoreSessionFromFirestore(): Promise<boolean> {
    try {
        const docRef = await readDocRef()
        const snap = await docRef.get()

        if (!snap.exists) {
            console.log('[AUTH-FB] No hay sesión guardada en Firestore. Se generará una nueva.')
            return false
        }

        const data = snap.data()!
        const files: Record<string, string> = data.files ?? {}

        if (Object.keys(files).length === 0) {
            console.log('[AUTH-FB] Sesión vacía en Firestore.')
            return false
        }

        if (!existsSync(AUTH_DIR)) {
            mkdirSync(AUTH_DIR, { recursive: true })
        }

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
    try {
        if (!existsSync(AUTH_DIR)) {
            console.log('[AUTH-FB] Directorio de sesión no existe, saltando backup.')
            return
        }

        const fileNames = readdirSync(AUTH_DIR)
        if (fileNames.length === 0) return

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

        const docRef = await readDocRef()
        await docRef.set({
            files,
            updatedAt: new Date().toISOString(),
        })

        const totalKB = Object.entries(files).reduce((sum, [,v]) => sum + v.length, 0) / 1024
        console.log(`[AUTH-FB] Backup completado: ${Object.keys(files).length} archivos (${totalKB.toFixed(1)} KB)`)
    } catch (e) {
        console.error('[AUTH-FB] Error en backup:', e)
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
