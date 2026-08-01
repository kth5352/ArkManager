import { describe, it, expect } from 'vitest'
import { buildRenamePlan, DEFAULT_RENAME_PATTERN } from './buildRenamePlan'

describe('buildRenamePlan', () => {
  it('substitutes {name} and keeps the original extension when the pattern omits {ext}', () => {
    const plan = buildRenamePlan([{ name: 'old.zip', kind: 'file' }], '새이름')
    expect(plan).toEqual([{ oldName: 'old.zip', newName: '새이름.zip' }])
  })

  it('substitutes {ext} explicitly instead of auto-appending', () => {
    const plan = buildRenamePlan([{ name: 'old.zip', kind: 'file' }], '새이름{ext}')
    expect(plan).toEqual([{ oldName: 'old.zip', newName: '새이름.zip' }])
  })

  it('substitutes {index} as a 1-based position across the batch', () => {
    const plan = buildRenamePlan(
      [
        { name: 'a.zip', kind: 'file' },
        { name: 'b.zip', kind: 'file' },
        { name: 'c.zip', kind: 'file' },
      ],
      'Game {index}'
    )
    expect(plan.map((p) => p.newName)).toEqual(['Game 1.zip', 'Game 2.zip', 'Game 3.zip'])
  })

  it('zero-pads {index:N}', () => {
    const plan = buildRenamePlan(
      [
        { name: 'a.zip', kind: 'file' },
        { name: 'b.zip', kind: 'file' },
      ],
      'Game {index:3}'
    )
    expect(plan.map((p) => p.newName)).toEqual(['Game 001.zip', 'Game 002.zip'])
  })

  it('does not append an extension for a folder target', () => {
    const plan = buildRenamePlan([{ name: 'MyGame', kind: 'folder' }], 'Renamed {index}')
    expect(plan).toEqual([{ oldName: 'MyGame', newName: 'Renamed 1' }])
  })

  it('leaves a name with no extension untouched by extension auto-append', () => {
    const plan = buildRenamePlan([{ name: 'README', kind: 'file' }], 'NOTES')
    expect(plan).toEqual([{ oldName: 'README', newName: 'NOTES' }])
  })

  it('substitutes {name} with the original base name', () => {
    const plan = buildRenamePlan([{ name: 'old title.zip', kind: 'file' }], '[백업] {name}{ext}')
    expect(plan).toEqual([{ oldName: 'old title.zip', newName: '[백업] old title.zip' }])
  })

  it('builds the default pattern from crawled metadata', () => {
    const plan = buildRenamePlan(
      [
        {
          name: 'old.zip',
          kind: 'file',
          code: 'RJ123456',
          circle: 'ABC studio',
          title: '게임제목',
          genres: ['애니메이션', '소녀'],
        },
      ],
      DEFAULT_RENAME_PATTERN
    )
    expect(plan).toEqual([
      { oldName: 'old.zip', newName: 'RJ123456 [ABC studio] 게임제목 {애니메이션, 소녀}.zip' },
    ])
  })

  it('omits an empty {genres} substitution entirely instead of leaving empty braces', () => {
    const plan = buildRenamePlan(
      [{ name: 'old.zip', kind: 'file', code: 'RJ123456', circle: 'ABC studio', title: '제목' }],
      DEFAULT_RENAME_PATTERN
    )
    expect(plan).toEqual([{ oldName: 'old.zip', newName: 'RJ123456 [ABC studio] 제목.zip' }])
  })

  it('falls back to {name} for {title} when no metadata was crawled', () => {
    const plan = buildRenamePlan([{ name: 'RJ123456.zip', kind: 'file' }], '{title}')
    expect(plan).toEqual([{ oldName: 'RJ123456.zip', newName: 'RJ123456.zip' }])
  })

  it('does not append an extension for a folder even with the default metadata pattern', () => {
    const plan = buildRenamePlan(
      [
        {
          name: 'MyGame',
          kind: 'folder',
          code: 'RJ123456',
          circle: 'ABC studio',
          title: '게임제목',
          genres: ['애니메이션'],
        },
      ],
      DEFAULT_RENAME_PATTERN
    )
    expect(plan).toEqual([
      { oldName: 'MyGame', newName: 'RJ123456 [ABC studio] 게임제목 {애니메이션}' },
    ])
  })
})
