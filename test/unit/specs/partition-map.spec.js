import { describe, expect, it } from 'vitest'
import { createPartitionMap } from '../../../src/muya/lib/contentState/partitionMap'

describe('partition map', () => {
  it('builds conservative partitions from markdown text', () => {
    const markdown = [
      '# Title',
      '',
      'Paragraph one',
      'Paragraph two',
      '',
      '```js',
      'const x = 1',
      '```',
      '',
      '> Quote'
    ].join('\n')

    const partitions = createPartitionMap(markdown, 7)

    expect(partitions).to.have.length(4)
    expect(partitions.map(partition => partition.typeHint)).to.deep.equal([
      'heading',
      'paragraph',
      'fence',
      'blockquote'
    ])
    expect(partitions[0]).to.include({
      id: 'partition-7-0',
      startLine: 0,
      endLine: 0,
      typeHint: 'heading',
      version: 7,
      parseState: 'pending'
    })
    expect(partitions[2]).to.include({
      startLine: 5,
      endLine: 7,
      typeHint: 'fence',
      version: 7
    })
    expect(partitions[2].measuredHeight).to.equal(undefined)
    expect(partitions[2].renderState).to.equal(undefined)
    expect(partitions[2].estimatedHeight).to.be.greaterThan(0)
  })

  it('keeps consecutive list items in one partition', () => {
    const markdown = [
      '- a',
      '- b',
      '- c',
      '',
      'after'
    ].join('\n')

    const partitions = createPartitionMap(markdown, 3)

    expect(partitions).to.have.length(2)
    expect(partitions[0].typeHint).to.equal('list')
    expect(partitions[0].startLine).to.equal(0)
    expect(partitions[0].endLine).to.equal(2)
    expect(partitions[1].typeHint).to.equal('paragraph')
  })
})
