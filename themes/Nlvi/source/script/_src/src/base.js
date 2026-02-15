import { fromEvent } from 'rxjs'
import { map } from 'rxjs/operators'
import genSearch from './search'

class Base {
  constructor(config) {
    this.config = config
    this.theme = config.theme
    this.scrollArr = []
    this.boundHandlers = new WeakMap()
  }

  static toArray(nodes) {
    return Array.from(nodes || [])
  }

  static scrollTop() {
    return window.scrollY || document.documentElement.scrollTop || 0
  }

  static viewportHeight() {
    return window.innerHeight || document.documentElement.clientHeight || 0
  }

  static documentHeight() {
    const { body, documentElement } = document
    return Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      documentElement ? documentElement.clientHeight : 0,
      documentElement ? documentElement.scrollHeight : 0,
      documentElement ? documentElement.offsetHeight : 0
    )
  }

  bind(el, eventName, key, handler) {
    if (!el) return

    const handlers = this.boundHandlers.get(el) || {}
    const prev = handlers[key]
    if (prev) {
      el.removeEventListener(eventName, prev)
    }

    el.addEventListener(eventName, handler)
    handlers[key] = handler
    this.boundHandlers.set(el, handlers)
  }

  animate(selector, animation, callback) {
    const element = document.querySelector(selector)
    if (!element) {
      if (callback) callback()
      return
    }

    element.classList.add(animation)
    const onEnd = () => {
      element.classList.remove(animation)
      element.removeEventListener('animationend', onEnd)
      if (callback) callback()
    }

    element.addEventListener('animationend', onEnd)
  }

  init() {
    this.smoothScroll()
    this.setupPictures()
    this.showComments()
    Base.opScroll(this.scrollArr)
  }

  smoothScroll() {
    Base.toArray(document.querySelectorAll('.toc-link')).forEach(link => {
      this.bind(link, 'click', 'toc-click', e => {
        e.preventDefault()
        const href = link.getAttribute('href')
        if (!href) return

        const url = new URL(href, window.location.href)
        if (url.pathname !== window.location.pathname) {
          window.location.href = url.toString()
          return
        }

        const encodedId = url.hash.replace(/^#/, '')
        if (!encodedId) return

        let decodedId = encodedId
        try {
          decodedId = decodeURIComponent(encodedId)
        } catch (_) {
          decodedId = encodedId
        }

        const safeQueryId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(decodedId) : decodedId.replace(/["\\]/g, '\\$&')
        const target = document.getElementById(decodedId) ||
          document.getElementById(encodedId) ||
          document.querySelector(`[id="${safeQueryId}"]`)
        if (!target) {
          window.location.hash = encodedId
          return
        }

        const top = target.getBoundingClientRect().top + Base.scrollTop() - 200
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
        history.replaceState(null, '', `#${encodedId}`)
      })
    })
  }

  setupPictures() {
    Base.toArray(document.querySelectorAll('.post-content img')).forEach(img => {
      const src = img.getAttribute('src') || img.src
      if (!src) return

      const alt = img.getAttribute('alt') || ''
      const className = img.className || ''
      const parent = img.parentElement

      if (parent && parent.tagName === 'P') {
        parent.style.textAlign = 'center'
      }

      if (this.theme.lazy) {
        img.setAttribute('data-src', src)
        img.removeAttribute('src')
        img.classList.add('lazyload')
      }

      if (parent && parent.tagName === 'A') {
        parent.setAttribute('href', src)
        parent.setAttribute('data-title', alt)
        parent.setAttribute('data-lightbox', 'group')
        if (className) {
          className.split(/\s+/).filter(Boolean).forEach(cls => parent.classList.add(cls))
        }
        return
      }

      const anchor = document.createElement('a')
      anchor.setAttribute('href', src)
      anchor.setAttribute('data-title', alt)
      anchor.setAttribute('data-lightbox', 'group')
      if (className) {
        className.split(/\s+/).filter(Boolean).forEach(cls => anchor.classList.add(cls))
      }

      if (parent) {
        parent.insertBefore(anchor, img)
        anchor.appendChild(img)
      }
    })
  }

  showComments() {
    const comments = document.getElementById('post-comments')
    const toggle = document.getElementById('com-switch')
    if (!comments || !toggle) return

    this.bind(toggle, 'click', 'comments-toggle', () => {
      const isHidden = getComputedStyle(comments).display === 'none'

      if (isHidden) {
        comments.style.display = 'block'
        comments.classList.add('syuanpi', 'fadeInDown')
        toggle.style.transform = 'rotate(180deg)'
        return
      }

      toggle.classList.add('syuanpi')
      toggle.style.transform = ''
      comments.classList.remove('fadeInDown')
      this.animate('#post-comments', 'fadeOutUp', () => {
        comments.style.display = 'none'
      })
    })
  }

  back2top() {
    Base.toArray(document.querySelectorAll('.toTop')).forEach(button => {
      this.bind(button, 'click', 'back2top', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
    })
  }

  pushHeader() {
    const header = document.getElementById('mobile-header')
    if (!header) return

    this.scrollArr.push(sct => {
      header.classList.toggle('header-scroll', sct > 5)
    })
  }

  updateRound(sct) {
    const scrollHeight = Base.documentHeight() - Base.viewportHeight()
    const scrollPercent = scrollHeight <= 0 ? 100 : Math.floor((sct / scrollHeight) * 100)
    const indicator = document.getElementById('scrollpercent')
    if (indicator) {
      indicator.textContent = String(scrollPercent)
    }
  }

  showToc() {
    const tocLinks = Base.toArray(document.querySelectorAll('.toc-link'))
    const headerLinks = Base.toArray(document.querySelectorAll('.headerlink'))
    const titleLinks = Base.toArray(document.querySelectorAll('.title-link a'))

    this.scrollArr.push(sct => {
      const headerlinkTop = headerLinks.map(link => link.getBoundingClientRect().top + Base.scrollTop())

      titleLinks.forEach(link => {
        link.classList.toggle('active', sct >= 0 && sct < 230)
      })

      tocLinks.forEach((link, i) => {
        const currentTop = headerlinkTop[i]
        const nextTop = i + 1 === tocLinks.length ? Infinity : headerlinkTop[i + 1]
        const isActive = currentTop < sct + 210 && sct + 210 <= nextTop
        link.classList.toggle('active', isActive)
      })
    })
  }

  titleStatus() {
    const title = document.title
    let timer

    document.addEventListener('visibilitychange', () => {
      const docHeight = Base.documentHeight() - Base.viewportHeight()
      const sct = docHeight <= 0 ? 100 : Math.floor((Base.scrollTop() / docHeight) * 100)

      if (document.hidden) {
        clearTimeout(timer)
        document.title = `Read ${sct}% · ${title}`
      } else {
        document.title = `Welcome Back · ${title}`
        timer = setTimeout(() => {
          document.title = title
        }, 3000)
      }
    })
  }

  showReward() {
    if (!this.theme.reward) return

    const wrapper = document.getElementById('reward-wrapper')
    const btn = document.getElementById('reward-btn')
    if (!wrapper || !btn) return

    this.bind(btn, 'click', 'reward-toggle', () => {
      const isHidden = getComputedStyle(wrapper).display === 'none'

      if (isHidden) {
        wrapper.style.display = 'flex'
        this.animate('#reward-btn', 'clarity')
        return
      }

      this.animate('#reward-btn', 'melt', () => {
        wrapper.style.display = 'none'
      })
    })
  }

  listenExit(target, fn) {
    if (!target) return

    if (target instanceof Element || target === document || target === window) {
      this.bind(target, 'keydown', 'esc-close', e => {
        if (e.key === 'Escape') fn()
      })
      return
    }

    Base.toArray(target).forEach(el => {
      this.bind(el, 'keydown', 'esc-close', e => {
        if (e.key === 'Escape') fn()
      })
    })
  }

  depth(open, close) {
    const body = document.body
    const inner = document.querySelector('.container-inner')
    const isUnder = body.classList.contains('under')

    if (isUnder) {
      body.classList.remove('under')
      if (inner) inner.classList.remove('under')
      close.call(this)
      return
    }

    body.classList.add('under')
    if (inner) inner.classList.add('under')
    open.call(this)
  }

  tagcloud() {
    const tagBtn = document.getElementById('tags')
    const tagcloud = document.getElementById('tagcloud')
    const search = document.getElementById('search')

    if (!tagBtn || !tagcloud) return

    const closeFrame = () => {
      tagcloud.classList.remove('shuttleIn')
      this.animate('#tagcloud', 'zoomOut', () => {
        tagcloud.classList.remove('syuanpi', 'show')
      })
    }

    const switchShow = () => {
      this.depth(
        () => tagcloud.classList.add('syuanpi', 'shuttleIn', 'show'),
        closeFrame
      )
    }

    this.listenExit(tagBtn, switchShow)
    this.listenExit(document.getElementsByClassName('tagcloud-taglist'), switchShow)

    this.bind(tagBtn, 'click', 'tag-switch', () => {
      if (search && search.classList.contains('show')) {
        tagcloud.classList.add('syuanpi', 'shuttleIn', 'show')
        search.classList.remove('shuttleIn')
        this.animate('#search', 'zoomOut', () => {
          search.classList.remove('syuanpi', 'show')
        })
        return
      }

      switchShow()
    })

    this.bind(tagcloud, 'click', 'tagcloud-overlay', e => {
      e.stopPropagation()
      if (e.target.tagName === 'DIV') {
        this.depth(
          () => tagcloud.classList.add('syuanpi', 'shuttleIn', 'show'),
          closeFrame
        )
      }
    })

    const tags = Base.toArray(document.querySelectorAll('.tagcloud-tag button'))
    const postLists = Base.toArray(document.querySelectorAll('.tagcloud-postlist'))
    tags.forEach(tag => {
      this.bind(tag, 'click', `tag-item-${tag.textContent}`, () => {
        postLists.forEach(list => list.classList.remove('active'))
        const target = postLists.find(list => {
          const firstChild = list.firstElementChild
          return firstChild && firstChild.innerHTML.trim() === tag.innerHTML.trim()
        })
        if (target) target.classList.add('active')
      })
    })
  }

  search() {
    if (!this.theme.search) return

    const searchBtn = document.getElementById('search-btn')
    const result = document.getElementById('search-result')
    const search = document.getElementById('search')
    const tagcloud = document.getElementById('tagcloud')

    if (!search || !searchBtn || !result) return

    const closeFrame = () => {
      search.classList.remove('shuttleIn')
      this.animate('#search', 'zoomOut', () => {
        search.classList.remove('syuanpi', 'show')
      })
    }

    const switchShow = () => {
      this.depth(
        () => search.classList.add('syuanpi', 'shuttleIn', 'show'),
        closeFrame
      )
    }

    this.listenExit(search, switchShow)

    this.bind(searchBtn, 'click', 'search-toggle', () => {
      if (tagcloud && tagcloud.classList.contains('show')) {
        search.classList.add('syuanpi', 'shuttleIn', 'show')
        tagcloud.classList.remove('shuttleIn')
        this.animate('#tagcloud', 'zoomOut', () => {
          tagcloud.classList.remove('syuanpi', 'show')
        })
        return
      }

      switchShow()
    })

    this.bind(search, 'click', 'search-overlay', e => {
      e.stopPropagation()
      if (e.target.tagName === 'DIV') {
        this.depth(
          () => search.classList.add('syuanpi', 'shuttleIn', 'show'),
          closeFrame
        )
      }
    })

    genSearch(`${this.config.baseUrl}search.xml`, 'search-input').subscribe(vals => {
      const list = body => `<ul class="search-result-list syuanpi fadeInUpShort">${body}</ul>`
      const item = ({ url, title, content }) => `
          <li class="search-result-item">
            <a href="${url}"><h2>${title}</h2></a>
            <p>${content}</p>
          </li>
        `
      const output = vals.map(item)
      result.innerHTML = list(output.join(''))
    })
  }

  headerMenu() {
    const mobileMenu = document.querySelector('.mobile-header-body')
    const headerLine = document.querySelector('.header-menu-line')
    const mobileTag = document.getElementById('mobile-tags')
    const tagcloud = document.getElementById('tagcloud')
    const mobileLeft = document.getElementById('mobile-left')

    if (mobileTag && mobileMenu && headerLine && tagcloud) {
      this.bind(mobileTag, 'click', 'mobile-tag', () => {
        mobileMenu.classList.remove('show')
        headerLine.classList.remove('show')
        tagcloud.classList.add('syuanpi', 'shuttleIn', 'show')
      })
    }

    if (mobileLeft && mobileMenu && headerLine) {
      this.bind(mobileLeft, 'click', 'mobile-left', () => {
        this.depth(
          () => {
            mobileMenu.classList.add('show')
            headerLine.classList.add('show')
          },
          () => {
            mobileMenu.classList.remove('show')
            headerLine.classList.remove('show')
          }
        )
      })
    }
  }

  bootstarp() {
    this.showToc()
    this.back2top()
    this.titleStatus()
    this.init()
    this.pushHeader()
    this.tagcloud()
    this.search()
    this.showReward()
    this.headerMenu()
  }

  static opScroll(fns) {
    if (!fns.length) return

    fromEvent(window, 'scroll')
      .pipe(map(() => Base.scrollTop()))
      .subscribe(scrollTop => fns.forEach(fn => fn(scrollTop)))
  }
}

export default Base
