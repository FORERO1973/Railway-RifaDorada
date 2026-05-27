# Deploy con PM2 — WhatsApp Bot RifaDorada

## Requisitos

- Node.js 18+ instalado
- npm/pnpm instalado

## Instalación de PM2

```powershell
npm install -g pm2
```

## Comandos

### Iniciar el bot

```powershell
cd whatsapp_bot
pm2 start ecosystem.config.cjs
```

### Ver estado

```powershell
pm2 status
```

### Verificar conexión del bot

```powershell
curl http://localhost:3008/v1/status
```

Respuesta esperada:
```json
{"status":"connected","qr":null,"timestamp":"2026-05-20T..."}
```

### Reiniciar

```powershell
pm2 restart rifadorada-bot
```

### Detener

```powershell
pm2 stop rifadorada-bot
```

### Eliminar de PM2

```powershell
pm2 delete rifadorada-bot
```

### Auto-inicio al arrancar Windows

```powershell
pm2 save
pm2 startup
```

> **Nota:** En Windows, si `pm2 startup` no funciona:
> ```powershell
> npm install -g pm2-windows-startup
> pm2-startup install
> pm2 save
> ```

## Configuración

| Parámetro | Valor |
|---|---|
| Nombre del proceso | `rifadorada-bot` |
| Puerto | `3008` |
| Auto-restart | ✅ Sí |
| Máx reintentos | 10 |
| Delay entre restart | 5s |
| Máx memoria | 500MB |

## Endpoints útiles

| Endpoint | Descripción |
|---|---|
| `GET /v1/status` | Estado de conexión del bot |
| `GET /v1/rifas` | Lista de rifas (healthcheck) |
| `GET /v1/participantes` | Lista de participantes |
