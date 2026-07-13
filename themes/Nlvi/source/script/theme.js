const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]

const body = document.body
const containerInner = $('.container-inner')
const searchOverlay = $('#search')
const tagOverlay = $('#tagcloud')

function scrollTop() {
  return window.scrollY || document.documentElement.scrollTop || 0
}

function documentHeight() {
  const { body: pageBody, documentElement } = document
  return Math.max(
    pageBody?.scrollHeight || 0,
    pageBody?.offsetHeight || 0,
    documentElement.clientHeight,
    documentElement.scrollHeight,
    documentElement.offsetHeight,
  )
}

function animateOnce(element, animation, callback) {
  if (!element) {
    callback?.()
    return
  }

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    element.classList.remove(animation)
    callback?.()
  }

  element.classList.add(animation)
  element.addEventListener('animationend', finish, { once: true })
  window.setTimeout(finish, 800)
}

function setDepth(enabled) {
  body.classList.toggle('under', enabled)
  containerInner?.classList.toggle('under', enabled)
}

function closeOverlay(overlay, immediate = false) {
  if (!overlay?.classList.contains('show')) return

  const finish = () => overlay.classList.remove('syuanpi', 'show', 'shuttleIn')
  overlay.classList.remove('shuttleIn')
  if (immediate) finish()
  else animateOnce(overlay, 'zoomOut', finish)
}

function closeAllOverlays() {
  closeOverlay(searchOverlay)
  closeOverlay(tagOverlay)
  setDepth(false)
}

function openOverlay(overlay) {
  if (!overlay) return

  const other = overlay === searchOverlay ? tagOverlay : searchOverlay
  closeOverlay(other, true)
  setDepth(true)
  overlay.classList.add('syuanpi', 'shuttleIn', 'show')

  if (overlay === searchOverlay) $('#search-input')?.focus()
}

function toggleOverlay(overlay) {
  if (overlay?.classList.contains('show')) closeAllOverlays()
  else openOverlay(overlay)
}

function setupOverlays() {
  $('#search-btn')?.addEventListener('click', () => toggleOverlay(searchOverlay))
  $('#tags')?.addEventListener('click', () => toggleOverlay(tagOverlay))

  for (const overlay of [searchOverlay, tagOverlay]) {
    overlay?.addEventListener('click', event => {
      if (event.target === overlay) closeAllOverlays()
    })
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAllOverlays()
  })

  const tagButtons = $$('.tagcloud-tag button')
  const postLists = $$('.tagcloud-postlist')
  tagButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      postLists.forEach(list => list.classList.remove('active'))
      postLists[index]?.classList.add('active')
    })
  })
}

function setupMobileMenu() {
  const toggle = $('#mobile-left')
  const menu = $('.mobile-header-body')
  const line = $('.header-menu-line')
  const mobileTags = $('#mobile-tags')

  const setOpen = open => {
    menu?.classList.toggle('show', open)
    line?.classList.toggle('show', open)
    setDepth(open)
  }

  toggle?.addEventListener('click', () => setOpen(!menu?.classList.contains('show')))
  mobileTags?.addEventListener('click', event => {
    event.preventDefault()
    setOpen(false)
    openOverlay(tagOverlay)
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu?.classList.contains('show')) setOpen(false)
  })
}

let searchEntriesPromise

function loadSearchEntries() {
  searchEntriesPromise ||= fetch('/search.json')
    .then(response => {
      if (!response.ok) throw new Error(`Search index returned ${response.status}`)
      return response.json()
    })
    .then(entries => {
      if (!Array.isArray(entries) || entries.some(entry =>
        !entry
        || typeof entry.title !== 'string'
        || typeof entry.url !== 'string'
        || typeof entry.content !== 'string')) {
        throw new TypeError('Search index has an invalid format')
      }
      return entries
    })
  return searchEntriesPromise
}

function appendHighlightedText(parent, text, keyword) {
  const lowerText = text.toLocaleLowerCase()
  const lowerKeyword = keyword.toLocaleLowerCase()
  let offset = 0
  let match = lowerText.indexOf(lowerKeyword)

  while (match >= 0) {
    parent.append(document.createTextNode(text.slice(offset, match)))
    const strong = document.createElement('strong')
    strong.className = 'search-keyword'
    strong.textContent = text.slice(match, match + keyword.length)
    parent.append(strong)
    offset = match + keyword.length
    match = lowerText.indexOf(lowerKeyword, offset)
  }
  parent.append(document.createTextNode(text.slice(offset)))
}

function renderSearchResults(entries, keyword) {
  const result = $('#search-result')
  if (!result) return
  result.replaceChildren()
  if (!keyword) return

  const lowerKeyword = keyword.toLocaleLowerCase()
  const matches = entries.filter(({ title, content }) =>
    title.toLocaleLowerCase().includes(lowerKeyword)
      || content.toLocaleLowerCase().includes(lowerKeyword),
  )

  const list = document.createElement('ul')
  list.className = 'search-result-list syuanpi fadeInUpShort'
  for (const { title, url, content } of matches) {
    const item = document.createElement('li')
    item.className = 'search-result-item'

    const link = document.createElement('a')
    link.href = url
    const heading = document.createElement('h2')
    appendHighlightedText(heading, title, keyword)
    link.append(heading)

    const contentIndex = content.toLocaleLowerCase().indexOf(lowerKeyword)
    const excerptStart = Math.max(0, contentIndex < 0 ? 0 : contentIndex - 20)
    const excerptEnd = contentIndex < 0 ? 100 : contentIndex + keyword.length + 80
    const excerpt = document.createElement('p')
    appendHighlightedText(excerpt, content.slice(excerptStart, excerptEnd), keyword)

    item.append(link, excerpt)
    list.append(item)
  }
  result.append(list)
}

function setupSearch() {
  const input = $('#search-input')
  if (!input) return

  let timer
  input.addEventListener('input', () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(async () => {
      const keyword = input.value.trim()
      if (!keyword) {
        renderSearchResults([], '')
        return
      }

      try {
        renderSearchResults(await loadSearchEntries(), keyword)
      } catch (error) {
        console.error('Unable to load the search index:', error)
        renderSearchResults([], '')
      }
    }, 500)
  })
}

function setupPictures() {
  $$('.post-content img').forEach(image => {
    const src = image.getAttribute('src')
    if (!src) return

    image.loading = 'lazy'
    image.decoding = 'async'
    const parent = image.parentElement
    if (parent?.tagName === 'P') parent.style.textAlign = 'center'
    const classes = [...image.classList]

    if (parent?.tagName === 'A') {
      parent.href = src
      parent.title ||= image.alt
      parent.classList.add(...classes)
      return
    }

    const link = document.createElement('a')
    link.href = src
    link.title = image.alt
    link.classList.add(...classes)
    image.replaceWith(link)
    link.append(image)
  })
}

function setupComments() {
  const comments = $('#post-comments')
  const toggle = $('#com-switch')
  if (!comments || !toggle) return

  toggle.addEventListener('click', () => {
    const hidden = getComputedStyle(comments).display === 'none'
    if (hidden) {
      comments.style.display = 'block'
      comments.classList.add('syuanpi', 'fadeInDown')
      toggle.style.transform = 'rotate(180deg)'
      return
    }

    toggle.style.transform = ''
    comments.classList.remove('fadeInDown')
    animateOnce(comments, 'fadeOutUp', () => {
      comments.style.display = 'none'
    })
  })
}

function setupToc() {
  $$('.toc-link').forEach(link => {
    link.addEventListener('click', event => {
      const url = new URL(link.href, window.location.href)
      if (url.pathname !== window.location.pathname || !url.hash) return

      let id = url.hash.slice(1)
      try { id = decodeURIComponent(id) } catch { /* Keep the encoded ID. */ }
      const target = document.getElementById(id) || document.getElementById(url.hash.slice(1))
      if (!target) return

      event.preventDefault()
      const top = target.getBoundingClientRect().top + scrollTop() - 200
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      history.replaceState(null, '', url.hash)
    })
  })
}

function updateScrollUi(position) {
  const mobileHeader = $('#mobile-header')
  const header = $('#header')
  const backtop = $('#backtop')

  mobileHeader?.classList.toggle('header-scroll', position > 5)
  header?.classList.toggle('header-scroll', position > 50)

  if (backtop) {
    backtop.classList.toggle('clarity', position > 110)
    backtop.classList.toggle('melt', position <= 110)
  }

  const scrollableHeight = documentHeight() - window.innerHeight
  const percent = scrollableHeight <= 0 ? 100 : Math.floor((position / scrollableHeight) * 100)
  const indicator = $('#scrollpercent')
  if (indicator) indicator.textContent = String(Math.max(0, Math.min(100, percent)))

  const tocLinks = $$('.toc-link')
  const headings = $$('.headerlink')
  tocLinks.forEach((link, index) => {
    const current = headings[index]?.getBoundingClientRect().top + position
    const next = headings[index + 1]?.getBoundingClientRect().top + position ?? Infinity
    link.classList.toggle('active', current < position + 210 && position + 210 <= next)
  })
}

function setupScrollUi() {
  let scheduled = false
  const update = () => {
    scheduled = false
    updateScrollUi(scrollTop())
  }

  window.addEventListener('scroll', () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(update)
  }, { passive: true })

  let lastWheelUpdate = 0
  window.addEventListener('wheel', event => {
    const now = performance.now()
    if (now - lastWheelUpdate < 500) return
    lastWheelUpdate = now
    $('#header')?.classList.toggle('header-hide', event.deltaY > 0)
  }, { passive: true })

  $$('.toTop').forEach(button => {
    button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
  })
  update()
}

function setupTitleStatus() {
  const originalTitle = document.title
  let timer
  document.addEventListener('visibilitychange', () => {
    const scrollableHeight = documentHeight() - window.innerHeight
    const percent = scrollableHeight <= 0 ? 100 : Math.floor((scrollTop() / scrollableHeight) * 100)
    window.clearTimeout(timer)

    if (document.hidden) {
      document.title = `Read ${percent}% · ${originalTitle}`
      return
    }

    document.title = `Welcome Back · ${originalTitle}`
    timer = window.setTimeout(() => { document.title = originalTitle }, 3000)
  })
}

async function setupViewCounts() {
  const containers = $$('[data-view-path]')
  if (!containers.length) return

  const hideViewCount = container => {
    const separator = container.previousElementSibling?.classList.contains('post-updated')
      ? $('.post-updated-views-separator', container.previousElementSibling)
      : null
    container.hidden = true
    if (separator) separator.hidden = true
  }

  const paths = [...new Set(containers.map(container => container.dataset.viewPath).filter(Boolean))]
  if (!paths.length) {
    containers.forEach(hideViewCount)
    return
  }

  const params = new URLSearchParams()
  paths.forEach(path => params.append('path', path))

  try {
    const response = await fetch(`/api/views?${params}`)
    if (!response.ok) throw new Error(`View API returned ${response.status}`)
    const payload = await response.json()
    if (!payload?.counts || typeof payload.counts !== 'object' || Array.isArray(payload.counts)) {
      throw new TypeError('View API did not return a counts object')
    }

    containers.forEach(container => {
      const value = payload.counts[container.dataset.viewPath]
      if (!Number.isSafeInteger(value) || value < 0) {
        hideViewCount(container)
        return
      }
      $('.post-view-count', container).textContent = String(value)
    })
  } catch (error) {
    console.error('Unable to load post view counts:', error)
    containers.forEach(hideViewCount)
  }
}

async function renderMermaidDiagrams() {
  if (!$('.mermaid-light, .mermaid-dark')) return

  try {
    const mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')).default
    mermaid.initialize({ startOnLoad: false })
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')

    const renderActive = async () => {
      const activeClass = colorScheme.matches ? 'mermaid-dark' : 'mermaid-light'
      const selector = `.mermaid.${activeClass}:not([data-processed])`
      if ($(selector)) await mermaid.run({ querySelector: selector })
    }

    await renderActive()
    colorScheme.addEventListener('change', renderActive)
  } catch (error) {
    console.error('Unable to render Mermaid diagrams:', error)
  }
}

setupOverlays()
setupMobileMenu()
setupSearch()
setupPictures()
setupComments()
setupToc()
setupScrollUi()
setupTitleStatus()
setupViewCounts()
renderMermaidDiagrams()
