import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { setupAlbaranEciPersistence } from './stores/albaranEci'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
setupAlbaranEciPersistence(pinia)
app.mount('#app')
