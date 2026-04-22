<script setup lang="ts"></script>

<template>
  <div class="app">
    <header class="header">
      <div class="header-brand">
        <span class="header-logo">🌊</span>
        <span class="header-name">Oceans</span>
      </div>
      <nav class="nav">
        <RouterLink to="/" class="nav-link">
          <span class="source-badge api">API</span>
          Documentos
        </RouterLink>
        <RouterLink to="/productos" class="nav-link">
          <span class="source-badge proxy">Proxy</span>
          Productos
        </RouterLink>
      </nav>
    </header>
    <RouterView />
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
</style>
