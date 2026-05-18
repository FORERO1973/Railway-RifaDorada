const statusImageCache = new Map<string, string>()

export const getStatusImageUrl = (rifaId: string): string | undefined => {
    return statusImageCache.get(rifaId)
}

export const setStatusImageUrl = (rifaId: string, url: string): void => {
    statusImageCache.set(rifaId, url)
    console.log('[SHARED] Status image cached for rifa', rifaId)
}
