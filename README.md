# Oceans Analytics — frontend

Dashboard de ventas, compras, gastos, utilidad y clientes de Oceans, construido sobre los datos de
facturaofitec. Se publica en GitHub Pages; los datos se piden a través de
[oceans-proxy](https://github.com/oceans-group/oceans-proxy), que guarda las credenciales y el token
de facturaofitec (nunca van en este bundle).

Plan de trabajo y decisiones: [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack

Vue 3 + TypeScript + Vite · vue-router (modo hash, por GitHub Pages) · Chart.js (vue-chartjs) ·
IndexedDB (`idb`) como caché local · SheetJS para exportar a Excel.

## Desarrollo

Requiere Node 22 (`nvm use`).

```sh
npm install
cp .env.example .env   # VITE_PROXY_URL: URL del proxy (p. ej. http://localhost:3001)
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Type-check + build de producción en `dist/` |
| `npm run test` | Tests de los cálculos (Vitest) |
| `npm run lint` | oxlint + ESLint (con `--fix`) |

El proxy local debe aceptar el origen del dev server (`ALLOWED_ORIGIN` en el `.env` del proxy).

## Estructura

```
src/
  views/AnalyticsDashboard.vue   Dashboard principal (pestañas Resultados / Clientes)
  views/CustomerLifecycle.vue    Análisis RFM de clientes
  composables/useAnalyticsData   Estado compartido: filtros, carga, agregados, utilidad
  components/analytics/          Una tarjeta por sección del dashboard
  services/proxy.ts              Llamadas al proxy y normalización de datos de facturaofitec
  services/analytics.ts          Carga por rango: meses cerrados desde caché, últimos 8 días en vivo
  services/cache.ts              IndexedDB (ventas, gastos, compras, clientes)
  utils/igv.ts                   Regla de IGV para la utilidad (ver abajo)
```

## Reglas de negocio

- **Ventas**: facturas, boletas y notas de venta pagadas; se excluyen anuladas y rechazadas.
- **Utilidad**: ventas netas − costo de lo vendido − gastos diversos.
  - Ventas netas: facturas y boletas **sin IGV**; notas de venta **completas** (no se declaran).
  - Costo: cantidad vendida × costo de compra del catálogo de facturaofitec, sin IGV.
  - Los productos sin costo en el catálogo se listan en "Costos a revisar".
- **Flujo de caja**: ventas − compras de mercadería − gastos diversos (montos tal como se cobran/pagan).
- **Compras**: la de un proveedor "SALDO INICIAL…" es el inventario inicial, no una compra del periodo.

## Caché

Los meses cerrados (anteriores a los últimos 8 días) se guardan en IndexedDB y no se vuelven a pedir.
"Recargar datos" limpia la caché del rango y lo descarga de nuevo — úsalo si se registró o corrigió
un documento con fecha antigua. Al cambiar la estructura guardada se sube `DB_VERSION` en
`services/cache.ts` y se limpia lo necesario en `upgrade`.

## Despliegue

Push a `main` → GitHub Actions compila y publica en GitHub Pages (`.github/workflows/deploy.yml`).
Desplegar antes el proxy si un cambio depende de él.
