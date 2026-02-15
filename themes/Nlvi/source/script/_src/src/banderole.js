import Base from './base'
import { fromEvent } from 'rxjs'
import { throttleTime, map } from 'rxjs/operators'

export default class Banderole extends Base {
  pushHeader() {
    super.pushHeader()

    const header = document.getElementById('header')
    if (!header) return

    fromEvent(window, 'wheel').pipe(
      throttleTime(500),
      map(({ deltaY }) => deltaY > 0)
    ).subscribe(v => header.classList.toggle('header-hide', v))

    this.scrollArr.push(sct => {
      header.classList.toggle('header-scroll', sct > 50)
    })
  }

  back2top() {
    const backtop = document.getElementById('backtop')
    if (backtop) {
      this.scrollArr.push((sct) => {
        if (sct > 110) {
          backtop.classList.add('clarity')
          backtop.classList.remove('melt')
        } else {
          backtop.classList.add('melt')
          backtop.classList.remove('clarity')
        }
        this.updateRound(sct)
      })
    }

    super.back2top()
  }
}
