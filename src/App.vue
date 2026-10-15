<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { logout } from './services/auth'
import { APP_VERSION, APP_BUILT_AT } from './services/version'

const builtAt = new Date(APP_BUILT_AT).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })

const route = useRoute()
const router = useRouter()

function handleLogout() {
  logout()
  router.replace('/login')
}
</script>

<template>
  <div class="app">
    <header v-if="route.name !== 'login'" class="header">
      <div class="header-brand">
        <span class="header-logo">🌊</span>
        <span class="header-name">Oceans Analytics</span>
      </div>
      <nav class="nav">
        <!-- <RouterLink to="/api" class="nav-link">
          <span class="source-badge api">API</span>
          Documentos
        </RouterLink> -->
        <RouterLink to="/" class="nav-link">
          <span class="source-badge proxy">Proxy</span>
          Análisis
        </RouterLink>
        <RouterLink to="/clientes" class="nav-link">
          <span class="source-badge rfm">RFM</span>
          Clientes
        </RouterLink>
        <button class="logout-btn" @click="handleLogout">Cerrar sesión</button>
      </nav>
    </header>
    <RouterView />
    <footer class="app-version">Versión {{ APP_VERSION }} · {{ builtAt }}</footer>
  </div>
</template>

<style>
*,*::before,*::after { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #f1f5f9;
  color: #1e293b;
}
</style>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: #0f172a;
  color: #f8fafc;
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  flex-shrink: 0;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-logo { font-size: 1.3rem; }

.header-name {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #f8fafc;
}

.nav {
  display: flex;
  gap: 0.25rem;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}

.nav-link:hover {
  background: rgba(255,255,255,0.07);
  color: #f8fafc;
}

.nav-link.router-link-active {
  background: rgba(255,255,255,0.1);
  color: #f8fafc;
}

.source-badge {
  font-size: 0.62rem;
  font-weight: 800;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.source-badge.api {
  background: #16a34a;
  color: #fff;
}

.source-badge.proxy {
  background: #7c3aed;
  color: #fff;
}

.source-badge.rfm {
  background: #d97706;
  color: #fff;
}

.logout-btn {
  margin-left: 0.5rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.logout-btn:hover {
  background: rgba(255,255,255,0.07);
  color: #f8fafc;
}
.app-version {
  padding: 0.75rem 1.5rem 1.25rem;
  font-size: 0.7rem;
  color: #94a3b8;
  text-align: right;
}
</style>
