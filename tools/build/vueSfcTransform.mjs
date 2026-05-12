import crypto from 'node:crypto'
import postcss from 'postcss'
import postcssPresetEnv from 'postcss-preset-env'
import {
  compileScript,
  compileStyle,
  compileTemplate,
  parse,
  rewriteDefault
} from '@vue/compiler-sfc'

const makeScopeId = filename => {
  return `data-v-${crypto.createHash('sha1').update(filename).digest('hex').slice(0, 8)}`
}

const injectCss = css => {
  if (!css) return ''

  return `
const __vue_css = ${JSON.stringify(css)}
if (typeof document !== 'undefined' && __vue_css) {
  const __vue_style = document.createElement('style')
  __vue_style.setAttribute('type', 'text/css')
  __vue_style.textContent = __vue_css
  document.head.appendChild(__vue_style)
}
`
}

const preprocessCss = async source => {
  const result = await postcss([
    postcssPresetEnv({ stage: 0 })
  ]).process(source, { from: undefined })

  return result.css
}

export const transformVueSfc = async (source, filename) => {
  const { descriptor, errors } = parse(source, { filename })
  if (errors && errors.length) {
    const error = errors[0]
    throw error instanceof Error ? error : new Error(String(error))
  }

  const scopeId = makeScopeId(filename)
  const hasScopedStyles = descriptor.styles.some(style => style.scoped)
  const script = descriptor.script || descriptor.scriptSetup
    ? compileScript(descriptor, { id: scopeId })
    : null

  const parts = []

  if (script) {
    parts.push(rewriteDefault(script.content, '__sfc__'))
  } else {
    parts.push('const __sfc__ = {}')
  }

  if (descriptor.template) {
    const template = compileTemplate({
      source: descriptor.template.content,
      filename,
      id: scopeId,
      scoped: hasScopedStyles,
      bindingMetadata: script?.bindings ?? {}
    })

    const templateCode = template.code.replace(/^export function render/m, 'function render')
    parts.push(templateCode)
    parts.push('__sfc__.render = render')
  }

  if (descriptor.styles.length) {
    const css = (await Promise.all(descriptor.styles.map(async style => {
      const preprocessed = await preprocessCss(style.content)
      const compiled = compileStyle({
        source: preprocessed,
        filename,
        id: scopeId,
        scoped: !!style.scoped
      })

      if (compiled.errors && compiled.errors.length) {
        const error = compiled.errors[0]
        throw error instanceof Error ? error : new Error(String(error))
      }

      return compiled.code.trim()
    })))
      .filter(Boolean)
      .join('\n')

    parts.push(injectCss(css))
  }

  if (hasScopedStyles) {
    parts.push(`__sfc__.__scopeId = ${JSON.stringify(scopeId)}`)
  }

  parts.push(`__sfc__.__file = ${JSON.stringify(filename)}`)
  parts.push('export default __sfc__')

  return {
    code: `${parts.join('\n')}\n`,
    scopeId
  }
}
