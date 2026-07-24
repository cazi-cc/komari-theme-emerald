const DARK_CLASS_NAMES = new Set(['dark', 'dark-mode', 'dark-theme', 'theme-dark'])
const LIGHT_CLASS_NAMES = new Set(['light', 'light-mode', 'light-theme', 'theme-light'])
const THEME_ATTRIBUTES = [
  'data-theme',
  'data-color-scheme',
  'data-mode',
  'data-color-theme',
  'data-accent-color',
  'data-gray-color',
  'data-panel-background',
  'data-radius',
  'data-scaling',
]
const COLOR_CHANNEL_RE = /[\d.]+/g
const OKLCH_LIGHTNESS_RE = /^oklch\(\s*([\d.]+)(%)?/i
const copiedHostProperties = new Set<string>()

function classTheme(element: Element): boolean | null {
  const classes = [...element.classList]
  if (classes.some(className => DARK_CLASS_NAMES.has(className)))
    return true
  if (classes.some(className => LIGHT_CLASS_NAMES.has(className)))
    return false
  return null
}

function attributeTheme(element: Element): boolean | null {
  for (const attribute of THEME_ATTRIBUTES) {
    const value = element.getAttribute(attribute)?.trim().toLowerCase()
    if (value === 'dark')
      return true
    if (value === 'light')
      return false
  }
  return null
}

function darkRgbColor(color: string): boolean | null {
  const oklch = color.match(OKLCH_LIGHTNESS_RE)
  if (oklch) {
    const lightness = Number(oklch[1]) / (oklch[2] ? 100 : 1)
    return lightness < 0.55
  }

  const channels = color.match(COLOR_CHANNEL_RE)?.map(Number)
  if (!channels || channels.length < 3)
    return null

  const [red = 255, green = 255, blue = 255, alpha = 1] = channels
  if (alpha === 0)
    return null

  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance < 0.45
}

function hostFrameElement(hostDocument: Document): Element | null {
  try {
    const frame = window.frameElement
    return frame?.ownerDocument === hostDocument ? frame : null
  }
  catch {
    return null
  }
}

function frameAncestors(hostDocument: Document): Element[] {
  const ancestors: Element[] = []
  let element = hostFrameElement(hostDocument)?.parentElement ?? null
  while (element) {
    ancestors.push(element)
    element = element.parentElement
  }
  return ancestors
}

function hostThemeScope(hostDocument: Document): Element | null {
  const frame = hostFrameElement(hostDocument)
  return frame?.closest('.radix-themes')
    ?? hostDocument.querySelector('.radix-themes[data-is-root-theme="true"]')
    ?? hostDocument.querySelector('.radix-themes')
}

function uniqueElements(elements: Array<Element | null | undefined>): Element[] {
  return [...new Set(elements.filter((element): element is Element => Boolean(element)))]
}

function hostThemeElements(hostDocument: Document): Element[] {
  return uniqueElements([
    hostThemeScope(hostDocument),
    ...frameAncestors(hostDocument),
    hostDocument.documentElement,
    hostDocument.body,
  ])
}

function hostTheme(hostDocument: Document, fallbackDark: boolean): boolean {
  const elements = hostThemeElements(hostDocument)
  const readStyle = (element: Element) => (
    hostDocument.defaultView?.getComputedStyle(element) ?? getComputedStyle(element)
  )

  for (const element of elements) {
    const explicitTheme = classTheme(element) ?? attributeTheme(element)
    if (explicitTheme !== null)
      return explicitTheme
  }

  const colorScheme = readStyle(hostDocument.documentElement).colorScheme.toLowerCase()
  if (colorScheme === 'dark')
    return true
  if (colorScheme === 'light')
    return false

  for (const element of [...elements].reverse()) {
    const darkBackground = darkRgbColor(readStyle(element).backgroundColor)
    if (darkBackground !== null)
      return darkBackground
  }

  return fallbackDark
}

function parentDocument(): Document | null {
  if (window.parent === window)
    return null

  try {
    return window.parent.document
  }
  catch {
    return null
  }
}

function hostColorTheme(hostDocument: Document): string {
  const scope = hostThemeScope(hostDocument)
  return scope?.getAttribute('data-accent-color')
    || hostDocument.documentElement.getAttribute('data-color-theme')
    || hostDocument.body?.getAttribute('data-color-theme')
    || ''
}

function visibleBackground(hostDocument: Document): string {
  const hostWindow = hostDocument.defaultView
  if (!hostWindow)
    return ''

  for (const element of frameAncestors(hostDocument)) {
    const color = hostWindow.getComputedStyle(element).backgroundColor.trim()
    if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)')
      return color
  }
  return ''
}

function mapHostSemanticProperties(hostDocument: Document): void {
  const hostWindow = hostDocument.defaultView
  const scope = hostThemeScope(hostDocument)
  if (!hostWindow || !scope)
    return

  const style = hostWindow.getComputedStyle(scope)
  const value = (...properties: string[]) => {
    for (const property of properties) {
      const result = style.getPropertyValue(property).trim()
      if (result)
        return result
    }
    return ''
  }
  const foreground = value('--gray-12', '--foreground')
  const semanticValues = new Map<string, string>([
    ['--background', visibleBackground(hostDocument) || value('--accent-1', '--color-background')],
    ['--foreground', foreground],
    ['--card', value('--gray-a2', '--gray-2', '--card')],
    ['--card-foreground', foreground],
    ['--popover', value('--gray-2', '--card')],
    ['--popover-foreground', foreground],
    ['--primary', value('--accent-9', '--primary')],
    ['--primary-foreground', value('--accent-contrast', '--primary-foreground')],
    ['--secondary', value('--gray-a3', '--gray-3', '--secondary')],
    ['--secondary-foreground', foreground],
    ['--muted', value('--gray-a3', '--gray-3', '--muted')],
    ['--muted-foreground', value('--gray-11', '--muted-foreground')],
    ['--accent', value('--accent-a3', '--accent-3', '--accent')],
    ['--accent-foreground', value('--accent-12', '--accent-foreground')],
    ['--border', value('--gray-a6', '--gray-6', '--border')],
    ['--input', value('--gray-a7', '--gray-7', '--input')],
    ['--ring', value('--focus-8', '--accent-8', '--ring')],
    ['--radius', value('--radius-3', '--radius')],
  ])

  const rootStyle = document.documentElement.style
  for (const [property, mappedValue] of semanticValues) {
    if (!mappedValue)
      continue
    rootStyle.setProperty(property, mappedValue)
    copiedHostProperties.add(property)
  }
}

function copyHostProperties(hostDocument: Document): void {
  const hostWindow = hostDocument.defaultView
  if (!hostWindow)
    return

  const values = new Map<string, string>()
  const elements = uniqueElements([
    hostDocument.documentElement,
    hostDocument.body,
    ...frameAncestors(hostDocument).reverse(),
    hostThemeScope(hostDocument),
  ])
  for (const element of elements) {
    const style = hostWindow.getComputedStyle(element)
    for (let index = 0; index < style.length; index++) {
      const property = style.item(index)
      if (!property.startsWith('--'))
        continue
      const value = style.getPropertyValue(property).trim()
      if (value)
        values.set(property, value)
    }
  }

  const rootStyle = document.documentElement.style
  for (const property of copiedHostProperties) {
    if (!values.has(property))
      rootStyle.removeProperty(property)
  }
  copiedHostProperties.clear()

  for (const [property, value] of values) {
    rootStyle.setProperty(property, value)
    copiedHostProperties.add(property)
  }
  mapHostSemanticProperties(hostDocument)

  const bodyStyle = hostWindow.getComputedStyle(hostDocument.body || hostDocument.documentElement)
  if (bodyStyle.fontFamily)
    rootStyle.setProperty('--font-sans', bodyStyle.fontFamily)
}

function applyTheme(dark: boolean, hostDocument: Document | null): void {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.classList.toggle('light', !dark)
  root.style.colorScheme = dark ? 'dark' : 'light'

  if (!hostDocument)
    return

  const colorTheme = hostColorTheme(hostDocument)
  if (colorTheme) {
    root.setAttribute('data-color-theme', colorTheme)
    root.setAttribute('data-accent-color', colorTheme)
  }
  else {
    root.removeAttribute('data-color-theme')
    root.removeAttribute('data-accent-color')
  }
  copyHostProperties(hostDocument)
}

export function startSettingsThemeSync(): () => void {
  const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)')
  const hostDocument = parentDocument()
  const Observer = hostDocument?.defaultView?.MutationObserver ?? MutationObserver
  const syncTheme = () => {
    const dark = hostDocument
      ? hostTheme(hostDocument, preferredTheme.matches)
      : preferredTheme.matches
    applyTheme(dark, hostDocument)
  }
  const observer = hostDocument ? new Observer(syncTheme) : null
  const observerOptions: MutationObserverInit = {
    attributes: true,
    attributeFilter: ['class', 'style', ...THEME_ATTRIBUTES],
  }

  syncTheme()
  if (hostDocument) {
    observer?.observe(hostDocument.documentElement, observerOptions)
    if (hostDocument.body) {
      observer?.observe(hostDocument.body, {
        ...observerOptions,
        childList: true,
        subtree: true,
      })
    }
  }

  preferredTheme.addEventListener('change', syncTheme)
  window.addEventListener('storage', syncTheme)

  return () => {
    observer?.disconnect()
    preferredTheme.removeEventListener('change', syncTheme)
    window.removeEventListener('storage', syncTheme)
  }
}
