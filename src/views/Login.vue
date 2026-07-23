<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { login } from '../services/auth'

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

const router = useRouter()
const route = useRoute()

async function handleSubmit() {
  error.value = null
  loading.value = true
  try {
    await login(email.value, password.value)
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  } catch (e: unknown) {
    if (axiosIsUnauthorized(e)) error.value = 'Usuario o contraseña incorrectos'
    else error.value = 'No se pudo conectar. Intenta nuevamente.'
  } finally {
    loading.value = false
  }
}

function axiosIsUnauthorized(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'response' in e &&
    (e as { response?: { status?: number } }).response?.status === 401
}
</script>

<template>
  <div class="login-page">
    <form class="login-card" @submit.prevent="handleSubmit">
      <div class="brand">
        <span class="brand-logo">🌊</span>
        <span class="brand-name">Oceans Analytics</span>
      </div>

      <label class="field">
        <span>Usuario</span>
        <input v-model="email" type="text" autocomplete="username" required autofocus />
      </label>

      <label class="field">
        <span>Contraseña</span>
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <button type="submit" class="submit-btn" :disabled="loading">
        {{ loading ? 'Ingresando…' : 'Ingresar' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
}

.login-card {
  width: min(360px, 90vw);
  background: #fff;
  border-radius: 12px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.brand-logo { font-size: 1.5rem; }
.brand-name { font-size: 1.05rem; font-weight: 700; color: #0f172a; letter-spacing: 0.03em; }

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: #475569;
  font-weight: 600;
}

.field input {
  padding: 0.6rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.9rem;
  color: #0f172a;
}

.field input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.error {
  margin: 0;
  color: #dc2626;
  font-size: 0.82rem;
  text-align: center;
}

.submit-btn {
  margin-top: 0.5rem;
  padding: 0.65rem;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.15s;
}

.submit-btn:hover:not(:disabled) { background: #1d4ed8; }
.submit-btn:disabled { opacity: 0.6; cursor: default; }
</style>
