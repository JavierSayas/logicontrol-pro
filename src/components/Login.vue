<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref(null)
const loggingIn = ref(false)

const handleLogin = async () => {
  try {
    loading.value = true
    errorMsg.value = null

    const result = await auth.signIn(email.value, password.value)

    if (!result.success) {
      throw new Error(result.error || 'Credenciales incorrectas')
    }

    loggingIn.value = true
  } catch (error) {
    errorMsg.value = 'Credenciales incorrectas o usuario no registrado.'
    console.error(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page" :class="{ 'login-exit': loggingIn }">
    <div class="login-topbar"></div>

    <div class="login-desktop">
      <div class="login-brand">
        <div class="brand-inner login-fade-in">
          <div class="brand-badge">LP</div>
          <h1 class="brand-title">LogisPro</h1>
          <div class="brand-line"></div>
          <p class="brand-sub">Gestion de Ordenes de Carga</p>
        </div>
      </div>
      <div class="login-right">
        <div class="login-form login-fade-in" style="animation-delay: 0.1s">
          <h2 class="form-title">Acceso al sistema</h2>
          <p class="form-sub">Introduce tus credenciales</p>

          <form @submit.prevent="handleLogin">
            <div class="field">
              <label for="d-email">Email</label>
              <input id="d-email" type="email" v-model="email" required autocomplete="email" spellcheck="false" placeholder="tu@empresa.com" />
            </div>
            <div class="field">
              <label for="d-pass">Contrasena</label>
              <input id="d-pass" type="password" v-model="password" required autocomplete="current-password" placeholder="••••••••" />
            </div>

            <div v-if="errorMsg" class="form-error">
              <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>
              {{ errorMsg }}
            </div>

            <button type="submit" :disabled="loading" class="form-btn">
              <span v-if="loading" class="spinner"></span>
              <span v-else>Entrar</span>
            </button>
          </form>

          <p class="form-footer">LOGISPRO &mdash; ACCESO RESTRINGIDO</p>
        </div>
      </div>
    </div>

    <div class="login-mobile">
      <div class="mobile-header">
        <div class="mobile-badge">LP</div>
        <div>
          <h1 class="mobile-title">LogisPro</h1>
          <p class="mobile-sub">Operaciones</p>
        </div>
      </div>

      <div class="mobile-card login-fade-in">
        <h2 class="form-title">Iniciar sesion</h2>

        <form @submit.prevent="handleLogin">
          <div class="field">
            <label for="m-email">Email</label>
            <input id="m-email" type="email" v-model="email" required autocomplete="email" spellcheck="false" placeholder="tu@empresa.com" />
          </div>
          <div class="field">
            <label for="m-pass">Contrasena</label>
            <input id="m-pass" type="password" v-model="password" required autocomplete="current-password" placeholder="••••••••" />
          </div>

          <div v-if="errorMsg" class="form-error">
            <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>
            {{ errorMsg }}
          </div>

          <button type="submit" :disabled="loading" class="form-btn">
            <span v-if="loading" class="spinner"></span>
            <span v-else>Entrar</span>
          </button>
        </form>
      </div>

      <p class="mobile-footer">ACCESO RESTRINGIDO</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  background: #f4f5f7;
  display: flex;
  flex-direction: column;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.login-exit { opacity: 0; transform: scale(1.02); }

.login-topbar {
  height: 4px;
  background: linear-gradient(90deg, #1e3a8a, #2563eb, #4f46e5);
  flex-shrink: 0;
}

.login-desktop {
  display: none;
  flex: 1;
}
@media (min-width: 768px) {
  .login-desktop { display: flex; }
  .login-mobile { display: none !important; }
}

.login-brand {
  width: 42%;
  max-width: 440px;
  min-height: 100%;
  background: linear-gradient(160deg, #0f172a 0%, #1e3a8a 40%, #3730a3 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
}

.brand-inner { text-align: center; }

.brand-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border: 2px solid rgba(255,255,255,0.2);
  border-radius: 12px;
  color: white;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  margin-bottom: 1.5rem;
}

.brand-title {
  color: white;
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.03em;
}

.brand-line {
  width: 28px;
  height: 2px;
  background: rgba(255,255,255,0.25);
  margin: 1.25rem auto;
}

.brand-sub {
  color: rgba(255,255,255,0.45);
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.login-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  background: white;
}

.login-form {
  width: 100%;
  max-width: 340px;
}

.login-mobile {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 1.25rem;
}

.mobile-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 0 1.25rem;
}

.mobile-badge {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1e3a8a, #3730a3);
  color: white;
  font-weight: 800;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mobile-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: #1e3a8a;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.mobile-sub {
  font-size: 0.7rem;
  color: #94a3b8;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.mobile-card {
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04);
  flex: 0;
}

.mobile-footer {
  text-align: center;
  font-size: 0.6rem;
  color: #cbd5e1;
  letter-spacing: 0.1em;
  font-weight: 600;
  padding: 1.5rem 0;
  margin-top: auto;
}

.form-title {
  font-size: 1.15rem;
  font-weight: 800;
  color: #1e293b;
  letter-spacing: -0.02em;
}

.form-sub {
  color: #94a3b8;
  font-size: 0.82rem;
  margin-top: 0.2rem;
  margin-bottom: 1.75rem;
}

.mobile-card .form-title {
  margin-bottom: 1.25rem;
}

form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.field label {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  margin-bottom: 0.35rem;
}

.field input {
  width: 100%;
  padding: 0.65rem 0;
  border: none;
  border-bottom: 1.5px solid #e2e8f0;
  background: transparent;
  font-size: 0.92rem;
  color: #1e293b;
  outline: none;
  transition: border-color 0.2s;
}

.field input:focus {
  border-bottom-color: #2563eb;
}

.field input::placeholder {
  color: #cbd5e1;
}

.form-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  background: #fef2f2;
  border-left: 3px solid #ef4444;
  color: #dc2626;
  font-size: 0.78rem;
  font-weight: 500;
  border-radius: 0 6px 6px 0;
}

.form-btn {
  width: 100%;
  padding: 0.75rem;
  background: #1e3a8a;
  color: white;
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.01em;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.form-btn:hover { background: #2563eb; }
.form-btn:active { transform: scale(0.98); }
.form-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.spinner {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid white;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.form-footer {
  font-size: 0.62rem;
  color: #cbd5e1;
  text-align: center;
  margin-top: 2.5rem;
  letter-spacing: 0.1em;
  font-weight: 600;
}

.login-fade-in {
  animation: fadeUp 0.45s ease both;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
