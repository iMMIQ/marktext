import {
  arrow as arrowMiddleware,
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift
} from '@floating-ui/dom'
import { noop } from '../../utils'
import { EVENT_KEYS } from '../../config'
import './index.css'

const defaultOptions = () => ({
  placement: 'bottom-start',
  modifiers: {
    offset: {
      offset: '0, 12'
    }
  },
  showArrow: true
})

const normalizePlacement = placement => placement.replace(/-center$/, '')

const getOffset = modifiers => {
  const value = modifiers?.offset?.offset
  const [crossAxis = 0, mainAxis = 0] = typeof value === 'string'
    ? value.split(',').map(part => Number(part.trim()))
    : [0, 0]
  return { crossAxis, mainAxis }
}

class BaseFloat {
  constructor (muya, name, options = {}) {
    this.name = name
    this.muya = muya
    this.options = Object.assign({}, defaultOptions(), options)
    this.status = false
    this.floatBox = null
    this.container = null
    this.popper = null
    this.lastScrollTop = null
    this.resizeObserver = null
    this.cb = noop
    this.init()
  }

  init () {
    const { showArrow } = this.options
    const floatBox = document.createElement('div')
    const container = document.createElement('div')
    // Use to remember whick float container is shown.
    container.classList.add(this.name)
    container.classList.add('ag-float-container')
    floatBox.classList.add('ag-float-wrapper')

    if (showArrow) {
      const arrow = document.createElement('div')
      arrow.setAttribute('data-popper-arrow', '')
      arrow.classList.add('ag-popper-arrow')
      floatBox.appendChild(arrow)
    }

    floatBox.appendChild(container)
    document.body.appendChild(floatBox)
    this.resizeObserver = new ResizeObserver(entries => {
      const { target } = entries[entries.length - 1]
      const { offsetWidth, offsetHeight } = target
      Object.assign(floatBox.style, { width: `${offsetWidth}px`, height: `${offsetHeight}px` })
      this.popper && this.popper.update()
    })
    this.resizeObserver.observe(container)
    this.floatBox = floatBox
    this.container = container
  }

  listen () {
    const { eventCenter, container } = this.muya
    const { floatBox } = this
    const keydownHandler = event => {
      if (event.key === EVENT_KEYS.Escape) {
        this.hide()
      }
    }
    const scrollHandler = event => {
      if (typeof this.lastScrollTop !== 'number') {
        this.lastScrollTop = event.target.scrollTop
        return
      }
      // only when scoll distance great than 50px, then hide the float box.
      if (this.status && Math.abs(event.target.scrollTop - this.lastScrollTop) > 50) {
        this.hide()
      }
    }

    eventCenter.attachDOMEvent(document, 'click', this.hide.bind(this))
    eventCenter.attachDOMEvent(floatBox, 'click', event => {
      event.stopPropagation()
      event.preventDefault()
    })
    eventCenter.attachDOMEvent(container, 'keydown', keydownHandler)
    eventCenter.attachDOMEvent(container, 'scroll', scrollHandler)
  }

  hide () {
    const { eventCenter } = this.muya
    if (!this.status) return
    this.status = false
    if (this.popper && this.popper.destroy) {
      this.popper.destroy()
    }
    this.floatBox.removeAttribute('data-popper-placement')
    this.cb = noop
    eventCenter.dispatch('muya-float', this, false)
    this.lastScrollTop = null
  }

  show (reference, cb = noop) {
    const { floatBox } = this
    const { eventCenter } = this.muya
    const { placement, modifiers, showArrow } = this.options
    if (this.popper && this.popper.destroy) {
      this.popper.destroy()
    }
    this.floatBox.removeAttribute('data-popper-placement')
    this.cb = cb
    const arrowElement = showArrow ? floatBox.querySelector('.ag-popper-arrow') : null
    const middleware = [
      offset(getOffset(modifiers)),
      flip(),
      shift({ padding: 8 }),
      arrowElement && arrowMiddleware({ element: arrowElement })
    ].filter(Boolean)
    const update = () => computePosition(reference, floatBox, {
      placement: normalizePlacement(placement),
      middleware
    }).then(({ x, y, placement: resolvedPlacement, middlewareData }) => {
      Object.assign(floatBox.style, {
        left: `${x}px`,
        right: 'auto',
        top: `${y}px`
      })
      floatBox.setAttribute('data-popper-placement', resolvedPlacement)

      if (arrowElement && middlewareData.arrow) {
        const { x: arrowX, y: arrowY } = middlewareData.arrow
        Object.assign(arrowElement.style, {
          left: arrowX == null ? '' : `${arrowX}px`,
          top: arrowY == null ? '' : `${arrowY}px`
        })
      }
    })
    const destroy = autoUpdate(reference, floatBox, update)
    this.popper = { destroy, update }
    this.status = true
    eventCenter.dispatch('muya-float', this, true)
  }

  destroy () {
    if (this.popper && this.popper.destroy) {
      this.popper.destroy()
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
    this.floatBox.remove()
  }
}

export default BaseFloat
