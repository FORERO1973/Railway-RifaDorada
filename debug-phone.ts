import 'dotenv/config'
import { initializeFirebase, getAllParticipantesFromFirestore } from './src/flows/services/firebaseService.js'
import { normalizePhoneNumber } from './src/flows/services/raffleService.js'

initializeFirebase()

console.log('=== Simular búsqueda de número de usuario ===')

const participantes = await getAllParticipantesFromFirestore()

const phones = Array.from(new Set(participantes.map(p => p.whatsapp)))
console.log('Números en Firebase:', phones)

console.log('\n--- Probando diferentes formatos de números de usuario ---')

const testNumbers = [
    '573144178751',  // Con 57
    '3144178751',    // Sin 57
    '314178751',     // Sin 0
    '573143178751',  // Otro formato
]

for (const testNum of testNumbers) {
    const normalized = normalizePhoneNumber(testNum)
    const found = participantes.find(p => {
        const pPhone = normalizePhoneNumber(p.whatsapp)
        return pPhone === normalized
    })
    console.log(`${testNum} -> ${normalized} : ${found ? found.nombre + ' (' + found.whatsapp + ')' : 'NO ENCONTRADO'}`)
}