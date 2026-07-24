import { createApp } from 'vue'
import { startSettingsThemeSync } from '@/utils/settingsTheme'
import ThemeSettingsApp from '@/views/ThemeSettingsApp.vue'
import '@/styles/main.css'

const stopThemeSync = startSettingsThemeSync()
window.addEventListener('pagehide', stopThemeSync, { once: true })

createApp(ThemeSettingsApp).mount('#settings-app')
