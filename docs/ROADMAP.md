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
- [x] Proxy: CORS cerrado por defecto si falta `ALLOWED_ORIGIN`
- [x] Proxy: limitar intentos en `/login` (5 fallos por IP cada 15 min)
- [x] Unificar Node 22 LTS (`.nvmrc`, `engines`, CI y Render)
- [x] Actualizar dependencias dentro del rango (`npm update` + `npm audit fix`) en ambos proyectos
- [x] Reemplazar `xlsx@0.18.5` (sin parches en npm) por la versión del CDN de SheetJS

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
- [x] Tarjeta "Costos a revisar": productos sin costo, con costo mayor que la venta o con margen inusual (≥ 90 % / ≤ 5 %)
- [x] Ventas de productos inhabilitados o con código cambiado (p. ej. duplicado 7313 → 00050): costo emparejado por nombre

Hecho cuando: el margen por producto es razonable y no hay ventas sin costo sin avisar.

## Fase 4 — Inventario en el tiempo *(primera versión hecha)*

- [x] Pestaña **Inventario** (se carga al abrirla): valor al cierre, stock negativo, bajo mínimo; por producto
      stock inicial, inv. inicial/ajustes, compras, producción, ventas, mermas, otros, stock final, costo y valor;
      evolución mensual del valor
- [x] Datos: `/reports/kardex/records` (todos los almacenes) con caché por mes + stock actual de `/inventory/records`
- [x] Saldo reconstruido hacia atrás desde el stock actual de facturaofitec. **No** se usa la columna "saldo" del
      kardex: filtrado por fechas arranca de un valor que no coincide con el stock real
- [x] Costo promedio móvil: cada compra a su costo (sin IGV); el resto al costo del catálogo; editar/anular
      una compra no desvía el promedio
- [x] Fecha de corte `INVENTORY_START` (11/10/2026) en `services/inventory.ts`: actualizarla si se rehace el conteo
- [x] Saldo inicial cargado como compras del 10 al 12/10: toda compra hasta `OPENING_BALANCE_UNTIL` (12/10) es saldo
      inicial (fuera de Compras y Flujo de caja; da el costo al inventario). Indicador "Inventario inicial (12/10)"
- [ ] 👤 Categorías en facturaofitec (Servicio se excluye: recargas y maquila, que son agua; Materia prima / Producto terminado / Reventa separan el valor)
- [ ] 👤 Conteo con "16 · Inventario inicial"; operarios con "10 · Salida a producción" / "19 · Ingreso de producción"
- [ ] Sección Producción: insumos consumidos vs productos terminados, alertas de proporción y mermas
- [ ] Utilidad con costo promedio en vez del costo del catálogo (para productos con compras)

## Fase 5 — Mantenimiento *(hecha en lo que aporta hoy)*

- [x] Pinia quitada (no se usaba); oxlint 1.87 y eslint-plugin-vue 10.11; lint en cero
- [x] Caché unificada: un solo cargador por rango (`loadRangeWithCache`) y una sola caché mensual
      (`monthlyCache`) para ventas, gastos y compras
- [x] Tests (Vitest, `npm run test`, también en el CI): reglas de caché, IGV y cálculos de utilidad
- [x] README de ambos proyectos y `<title>` de la app
- [x] Dependencias al día dentro de su versión mayor; `xlsx` 0.20.3 desde el CDN de SheetJS
- [ ] TypeScript 7: esperar a que vue-tsc lo soporte oficialmente (hoy el proyecto usa TS 6)
- [ ] Proxy en módulos/ESM: un solo archivo de ~250 líneas; conviene cuando crezca (p. ej. al
      agregar el endpoint de inventario de la fase 4)
- [ ] 4 vulnerabilidades altas solo de desarrollo (braces vía @vue/eslint-config-typescript), sin arreglo compatible

---

## Decisiones

| Tema | Decisión | Estado |
|---|---|---|
| Histórico de compras dentro de gastos | No se reclasifica; se parte del saldo inicial | Acordado |
| Saldo inicial | Ajuste de inventario en facturaofitec (preferido) o compra con proveedor exclusivo sin IGV | Acordado, falta ejecutar 👤 |
| Prioridad | Utilidad primero; flujo de caja también | Acordado |
| IGV | Resumen con ventas totales. Utilidad: facturas y boletas sin IGV; **notas de venta completas** (no se declaran, no pagan IGV); costos sin IGV; gastos tal como se registran. Regla en `src/utils/igv.ts` | Acordado |
