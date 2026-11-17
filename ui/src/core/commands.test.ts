import { expect, test } from 'vitest'
import { onCommand, runCommand } from './commands'

test('the newest handler runs; removing it hands the command back', () => {
  const ran: string[] = []
  const offA = onCommand('find', () => ran.push('a'))
  const offB = onCommand('find', () => ran.push('b'))
  runCommand('find')
  offB()
  runCommand('find')
  offA()
  runCommand('find')
  expect(ran).toEqual(['b', 'a'])
})

test('a higher priority wins, also over handlers registered later', () => {
  const ran: string[] = []
  const offPage = onCommand('find', () => ran.push('page'))
  const offSettings = onCommand('find', () => ran.push('settings'), 1)
  // the page's hook registers again while the settings screen is open
  offPage()
  const offPage2 = onCommand('find', () => ran.push('page'))
  runCommand('find')
  offSettings()
  runCommand('find')
  offPage2()
  expect(ran).toEqual(['settings', 'page'])
})
