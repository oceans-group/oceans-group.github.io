import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import { watchForUpdates } from './services/version'

const app = createApp(App)

app.use(router)

app.mount('#app')

// Una pestaña abierta antes de publicar una versión nueva se actualiza sola
watchForUpdates()
