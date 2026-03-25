import ElementPlus from 'element-plus/dist/index.full.mjs'
import locale from 'element-plus/dist/locale/en.mjs'

const installElementPlus = app => {
  app.use(ElementPlus, {
    locale
  })
}

export {
  installElementPlus
}
