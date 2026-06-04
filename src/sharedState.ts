const statusImageCache = new Map<string, string>()
let connectionStatus: 'connected' | 'disconnected' | 'qr_pending' = 'disconnected'
let currentQrBase64: string | null = null

export const getStatusImageUrl = (rifaId: string): string | undefined => {
    return statusImageCache.get(rifaId)
}

export const setStatusImageUrl = (rifaId: string, url: string): void => {
    statusImageCache.set(rifaId, url)
    console.log('[SHARED] Status image cached for rifa', rifaId)
}

export const getConnectionStatus = (): string => connectionStatus
export const setConnectionStatus = (status: 'connected' | 'disconnected' | 'qr_pending'): void => {
    connectionStatus = status
    console.log('[SHARED] Connection status changed to:', status)
}

export const getCurrentQrBase64 = (): string | null => currentQrBase64
export const setCurrentQrBase64 = (qr: string | null): void => {
    currentQrBase64 = qr
}
