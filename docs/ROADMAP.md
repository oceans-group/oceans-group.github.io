# Roadmap — Oceans Analytics

Abarca `oceans-frontend` (Vue, GitHub Pages) y `oceans-proxy` (Express, Render).
Cada fase se entrega y verifica por separado; no se empieza la siguiente hasta cerrar la anterior.

Leyenda: `[x]` hecho · `[ ]` pendiente · 👤 depende del cliente

---

## Fase 0 — Seguridad e infraestructura

- [x] Quitar el token de facturaofitec del bundle del frontend (los documentos van por `/proxy/api/...`)
- [x] Proxy: un 401 de facturaofitec se responde como 502 (no cierra la sesión del usuario)
- [x] Proxy: verificación TLS activa, con la cadena intermedia en `certs/facturaofitec-chain.pem`
- [x] Commits en ramas: `fix/seguridad-tls` (proxy) y `feat/analytics-v2` (frontend)
- [ ] Despliegue — **primero el proxy** (incluye `certs/`), después el frontend
- [ ] Rotar `FACTURAOFITEC_TOKEN` en facturaofitec y actualizarlo en Render (el anterior estuvo publicado)
- [ ] Borrar los secrets `VITE_API_BASE_URL` y `VITE_API_TOKEN` de GitHub
- [ ] Proxy: CORS cerrado por defecto si falta `ALLOWED_ORIGIN`
- [ ] Proxy: limitar intentos en `/login`
- [ ] Unificar Node 22 LTS (`.nvmrc`, `engines`, CI y Render)
- [ ] Actualizar dependencias dentro del rango (`npm update` + `npm audit fix`) en ambos proyectos
- [ ] Reemplazar `xlsx@0.18.5` (sin parches en npm) por la versión del CDN de SheetJS

Riesgo conocido: si Let's Encrypt cambia el intermedio de facturaofitec, el proxy falla con
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Solución de fondo: que facturaofitec sirva la cadena completa.

## Fase 1 — Reestructurar el dashboard *(hecha)*

Objetivo: dejar la base lista para las fases 2–4 sin cambiar lo que ya funciona.

- [x] Excluir gastos anulados (hoy se suman; S/ 375.33 en 2026) y limpiar su caché
- [x] Separar la lógica de datos de la vista (`composables/useAnalyticsData.ts`)
- [x] Dividir `ProductsDashboard.vue` (1 977 líneas) en componentes por sección
- [x] Pestañas **Resultados** (finanzas y productos) y **Clientes** (top, tipo, inactivos, perdidos)
- [x] Barra de resumen: Ventas · Gastos diversos · Flujo de caja · Docs · Clientes
      ("Utilidad" pasa a llamarse Flujo de caja: hoy resta compras de inventario como gasto)
- [x] Cargar cada vista solo al abrirla (lazy routes): carga inicial de 697 KB a ~140 KB

Hecho cuando: build y type-check pasan, y las cifras coinciden con la versión anterior
(salvo los gastos anulados).

## Fase 2 — Compras de mercadería *(hecha)*

- [x] Servicio de compras: lista por fechas (`/reports/purchases/records`) + detalle con productos
      (`/purchases/record/{id}`), con caché por mes igual que ventas y gastos
- [x] Excluir compras anuladas y el saldo inicial (proveedor "SALDO INICIAL INVENTARIO", si se usa)
- [x] KPI "Compras mercadería" y sección Compras por proveedor / por producto (con drill-down)
- [x] Flujo de caja = Ventas − Compras − Gastos diversos
- [x] Compras en dólares convertidas con el tipo de cambio de la compra; notas de crédito restan

Pendiente de validar con datos reales: compras en dólares y notas de crédito (aún no hay ninguna).

Hecho cuando: la suma coincide con el reporte de compras de facturaofitec para el mismo rango.

## Fase 3 — Costo de ventas y utilidad *(hecha; cifras reales cuando se corrijan los costos)*

- [ ] 👤 El cliente corrige los costos de compra en el catálogo (TAPAS LARGAS, productos en 0)
- [x] Catálogo de productos (costo sin IGV, stock, stock mínimo), se lee en cada carga (2 páginas)
- [x] Costo de ventas = Σ cantidad vendida × costo (facturas, boletas y notas de venta)
- [x] KPIs Utilidad bruta (margen %) y Utilidad neta; columnas costo y margen en Top productos
- [x] Estado de resultados mensual con selector Utilidad / Flujo de caja (reemplaza Balance mensual)
- [x] Tarjeta "Costos a revisar": productos sin costo y con costo mayor que la venta

Hecho cuando: el margen por producto es razonable y no hay ventas sin costo sin avisar.

## Fase 4 — Inventario en el tiempo

- [ ] 👤 Conteo físico con fecha de corte y ajuste del stock en facturaofitec (Inventario → Movimientos)
- [ ] 👤 Registrar un movimiento de prueba para conocer la estructura de `/inventory/records`
- [ ] 👤 Definir qué productos son mercadería (excluir producidos/servicios: recargas, maquila, etc.)
- [ ] 👤 Definir si el inventario se ve total o por almacén (hay 4; todo el stock está en Oficina Principal)
- [ ] Reconstrucción: stock(fecha) = saldo inicial + compras − ventas ± movimientos
- [ ] Sección Mercadería: stock inicial, entradas, salidas, stock final, valor, por producto
- [ ] Evolución mensual del inventario valorizado; alertas de stock negativo y bajo mínimo
- [ ] Control: el stock calculado para hoy debe coincidir con el de facturaofitec (avisar si no)

Limitación: no hay historial antes de la fecha de corte; facturaofitec solo entrega el stock actual.

## Fase 5 — Mantenimiento

- [ ] Actualizaciones mayores: pinia 4 (o quitarla: no se usa), TypeScript 7, dotenv 18, oxlint
- [ ] Unificar la caché de ventas/gastos/compras (hoy duplicada en `analytics.ts` y `cache.ts`)
- [ ] Proxy en módulos ESM; tests de los cálculos (utilidad, stock)
- [ ] README real y `<title>` de la app

---

## Decisiones

| Tema | Decisión | Estado |
|---|---|---|
| Histórico de compras dentro de gastos | No se reclasifica; se parte del saldo inicial | Acordado |
| Saldo inicial | Ajuste de inventario en facturaofitec (preferido) o compra con proveedor exclusivo sin IGV | Acordado, falta ejecutar 👤 |
| Prioridad | Utilidad primero; flujo de caja también | Acordado |
| IGV | Resumen con ventas totales. Utilidad: facturas y boletas sin IGV; **notas de venta completas** (no se declaran, no pagan IGV); costos sin IGV; gastos tal como se registran. Regla en `src/utils/igv.ts` | Acordado |
