import { init } from 'snabbdom/build/init.js'
import { h as sh } from 'snabbdom/build/h.js'
import { toVNode as sToVNode } from 'snabbdom/build/tovnode.js'
import { attributesModule } from 'snabbdom/build/modules/attributes.js'
import { classModule } from 'snabbdom/build/modules/class.js'
import { datasetModule } from 'snabbdom/build/modules/dataset.js'
import { eventListenersModule } from 'snabbdom/build/modules/eventlisteners.js'
import { propsModule } from 'snabbdom/build/modules/props.js'
import { styleModule } from 'snabbdom/build/modules/style.js'
import toHTML from 'snabbdom-to-html'

export const patch = init([
  classModule,
  attributesModule,
  styleModule,
  propsModule,
  datasetModule,
  eventListenersModule
])

export const h = sh
export const toVNode = sToVNode
export { toHTML }

export const htmlToVNode = html => { // helper function for convert html to vnode
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html

  return toVNode(wrapper).children
}
