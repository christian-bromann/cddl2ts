import url from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import cli from '../src/cli.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const cddlFile = path.join(__dirname, '__fixtures__', 'mixin_union.cddl')

vi.mock('../src/constants', () => ({
    pkg: {
        name: 'cddl2ts',
        version: '0.0.0'
    }
}))

describe('mixin union types', () => {
    let exitOrig = process.exit
    let logOrig = console.log
    let errorOrig = console.error

    beforeEach(() => {
        process.exit = vi.fn() as any
        console.log = vi.fn()
        console.error = vi.fn()
    })

    afterEach(() => {
        process.exit = exitOrig
        console.log = logOrig
        console.error = errorOrig
    })

    it('should generate union type aliases for mixin choices', async () => {
        await cli([cddlFile])

        expect(process.exit).not.toHaveBeenCalledWith(1)
        expect(console.error).not.toHaveBeenCalled()

        const output = vi.mocked(console.log).mock.calls.flat().join('\n')

        // Check if Mixins is parsed correctly (intersection)
        expect(output).toContain('export type Mixins = MixinA & MixinB')

        // Check if UnionMixin is parsed correctly (single choice group)
        // Group = (A / B) -> usually parsed as a choice of properties in the group

        // More importantly for the queried code block:
        // ComplexMixins = ((MixinA / MixinB), c: bool)
        // This means it has a mixin that is a choice between MixinA and MixinB

        // We expect something like:
        // export type ComplexMixins = (MixinA | MixinB) & { c: boolean }
        expect(output).toMatchSnapshot()
    })
})
