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
          <p class="brand-sub">Gestión de Órdenes de Carga</p>
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
              <label for="d-pass">Contraseña</label>
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

          <p class="form-footer">LOGISPRO — ACCESO RESTRINGIDO</p>
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
        <h2 class="form-title">Iniciar sesión</h2>

        <form @submit.prevent="handleLogin">
          <div class="field">
            <label for="m-email">Email</label>
            <input id="m-email" type="email" v-model="email" required autocomplete="email" spellcheck="false" placeholder="tu@empresa.com" />
          </div>
          <div class="field">
            <label for="m-pass">Contraseña</label>
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
  font-family: var(--font-sans);
}
.login-exit { opacity: 0; transform: scale(1.02); }

.login-topbar {
  height: 4px;
  background: var(--gradient-brand-strip);
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
  background: var(--gradient-brand-deep);
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
  border-radius: var(--radius-xl);
  color: var(--fg-on-brand);
  font-size: 1.15rem;
  font-weight: var(--fw-extrabold);
  letter-spacing: 0.05em;
  margin-bottom: 1.5rem;
}

.brand-title {
  color: var(--fg-on-brand);
  font-size: 2rem;
  font-weight: var(--fw-extrabold);
  line-height: var(--lh-tight);
  letter-spacing: var(--tracking-tighter);
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
  font-weight: var(--fw-medium);
  letter-spacing: 0.04em;
}

.login-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  background: var(--bg-surface);
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
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--brand-900), var(--indigo-800));
  color: var(--fg-on-brand);
  font-weight: var(--fw-extrabold);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mobile-title {
  font-size: 1.05rem;
  font-weight: var(--fw-extrabold);
  color: var(--brand-900);
  letter-spacing: var(--tracking-tight);
  line-height: var(--lh-snug);
}

.mobile-sub {
  font-size: 0.7rem;
  color: var(--fg-5);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.mobile-card {
  background: var(--bg-surface);
  border-radius: var(--radius-2xl);
  padding: 1.5rem;
  box-shadow: var(--shadow-card-lift);
  flex: 0;
}

.mobile-footer {
  text-align: center;
  font-size: 0.6rem;
  color: var(--slate-300);
  letter-spacing: 0.1em;
  font-weight: var(--fw-semibold);
  padding: 1.5rem 0;
  margin-top: auto;
}

.form-title {
  font-size: 1.15rem;
  font-weight: var(--fw-extrabold);
  color: var(--fg-2);
  letter-spacing: var(--tracking-tight);
}

.form-sub {
  color: var(--fg-5);
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
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-eyebrow);
  color: var(--fg-5);
  margin-bottom: 0.35rem;
}

.field input {
  width: 100%;
  padding: 0.65rem 0;
  border: none;
  border-bottom: 1.5px solid var(--border-1);
  background: transparent;
  font-size: 0.92rem;
  color: var(--fg-2);
  outline: none;
  transition: border-color 0.2s;
  font-family: inherit;
}

.field input:focus {
  border-bottom-color: var(--border-focus);
}

.field input::placeholder {
  color: var(--slate-300);
}

.form-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  background: var(--red-50);
  border-left: 3px solid var(--red-500);
  color: var(--accent-danger);
  font-size: 0.78rem;
  font-weight: var(--fw-medium);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.form-btn {
  width: 100%;
  padding: 0.75rem;
  background: var(--brand-900);
  color: var(--fg-on-brand);
  font-weight: var(--fw-bold);
  font-size: 0.85rem;
  letter-spacing: 0.01em;
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
  font-family: inherit;
}

.form-btn:hover { background: var(--brand-600); }
.form-btn:active { transform: scale(0.98); }
.form-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.spinner {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--fg-on-brand);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.form-footer {
  font-size: 0.62rem;
  color: var(--slate-300);
  text-align: center;
  margin-top: 2.5rem;
  letter-spacing: 0.1em;
  font-weight: var(--fw-semibold);
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
