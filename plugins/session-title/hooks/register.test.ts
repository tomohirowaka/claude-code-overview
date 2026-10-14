import { expect, mock, test } from 'claude-code/testing'

import { isOverviewUpdate, TITLE_TOOL } from './register'

const OVERVIEW = 'mcp__overview__update'

test('both spellings of overview update are recognised', () => {
  expect(isOverviewUpdate('mcp__overview__update')).toBe(true)
  expect(isOverviewUpdate('mcp__plugin_overview_overview__update')).toBe(true)
  expect(isOverviewUpdate('mcp__linear__update')).toBe(false)
  expect(isOverviewUpdate('mcp__overview__updater')).toBe(false)
})

test('the rule joins the system prompt only for a watched main conversation with the tool', async ($, on) => {
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'i', scope: 'shared' }] }) as never)
  const compose = (surfaces: readonly 'desktop'[], tools: readonly string[], traits: readonly never[] = []) =>
    $.prompt.compose({ model: 'm', promptModel: 'm', outputStyle: null, surfaces, tools, traits })
  const watched = await compose(['desktop'], [TITLE_TOOL])
  expect(watched.sections.map(s => s.id)).toEqual(['intro', 'session-title:rule'])
  expect(watched.sections[1]?.text).toContain('<issue or task> <subject> <state>')
  expect((await compose([], [TITLE_TOOL])).sections.map(s => s.id)).toEqual(['intro'])
  expect((await compose(['desktop'], ['Bash'])).sections.map(s => s.id)).toEqual(['intro'])
  expect((await compose(['desktop'], [TITLE_TOOL], ['teammate' as never])).sections.map(s => s.id)).toEqual(['intro'])
  expect((await compose(['desktop'], [TITLE_TOOL], ['bare' as never])).sections.map(s => s.id)).toEqual(['intro'])
})

test('the rename tool is kept in front and its description carries the rule', async ($, on) => {
  on('tool.describe', async () => ({ description: 'Rename a CCD session', isDeferred: true }) as never)
  const title = await $.tool.describe({ tool: TITLE_TOOL, description: 'd' } as never)
  expect(title.isDeferred).toBe(false)
  expect(title.description).toContain('whenever the task')
  const other = await $.tool.describe({ tool: 'mcp__other__x', description: 'd' } as never)
  expect(other.isDeferred).toBe(true)
  expect(other.description).toBe('Rename a CCD session')
})

// A stored tool result as the engine writes it: a successful one carries no is_error key at all.
const row = (tool: string, isError?: boolean, agentId?: string) =>
  ({
    door: 'tool-result',
    origin: { kind: 'tool', tool },
    uuid: 'u1',
    ...(agentId === undefined ? {} : { agentId }),
    message: {
      type: 'user',
      role: 'user',
      isMeta: false,
      content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Updated the pane.', ...(isError === undefined ? {} : { is_error: isError }) }],
    },
  }) as never

type Stored = { message: { content: readonly { type: string; text?: string; tool_use_id?: string }[] } }

// The content blocks of the row as stored after appending it.
const stored = async ($: { session: { append: (r: never) => Promise<unknown> } }, session: ReturnType<typeof mock.session>, r: never) => {
  await $.session.append(r)
  return (session.appended().at(-1) as Stored | undefined)?.message.content ?? []
}

const texts = (blocks: Stored['message']['content']) => blocks.filter(b => b.type === 'text').map(b => b.text ?? '')

test('an overview update result from the main conversation carries the reminder after the result', async ($, on) => {
  const session = mock.session(on)
  const blocks = await stored($, session, row(OVERVIEW))
  expect(blocks.length).toBe(2)
  expect(blocks[0]?.tool_use_id).toBe('t1')
  expect(texts(blocks).join(' ')).toContain(TITLE_TOOL)
  expect(texts(await stored($, session, row(OVERVIEW, false))).length).toBe(1)
  expect(texts(await stored($, session, row('mcp__plugin_overview_overview__update'))).length).toBe(1)
})

test('other results, failed updates and subagent updates carry no reminder', async ($, on) => {
  const session = mock.session(on)
  expect(texts(await stored($, session, row('Bash')))).toEqual([])
  expect(texts(await stored($, session, row(OVERVIEW, true)))).toEqual([])
  expect(texts(await stored($, session, row(OVERVIEW, false, 'a1')))).toEqual([])
})
