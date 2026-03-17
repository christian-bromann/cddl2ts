import url from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import cli from '../src/cli.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const groupChoiceCDDL = path.join(__dirname, '__fixtures__', 'group_choice.cddl')

vi.mock('../src/constants', () => ({
    pkg: {
        name: 'cddl2ts',
        version: '0.0.0'
    }
}))

describe('group choice conversion', () => {
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

    it('should generate a union type for multiple group choices', async () => {
        await cli([groupChoiceCDDL, '--unknown-as-any'])

        expect(process.exit).not.toHaveBeenCalledWith(1)
        expect(console.error).not.toHaveBeenCalled()
        expect(console.log).toHaveBeenCalled()
        const output = vi.mocked(console.log).mock.calls.flat().join('\n')

        // Verify it generates a union of all 3 types
        expect(output).toContain('export type ProxyConfiguration = AutodetectProxyConfiguration | DirectProxyConfiguration | ManualProxyConfiguration')

        // Verify interfaces are generated comfortably
        // Note: As we now use Type Alias intersections for mixins instead of interfaces extends to support union mixins,
        // these assertions are updated to expect type aliases.
        expect(output).toContain('export type AutodetectProxyConfiguration = Extensible & {')
        expect(output).toContain('export type DirectProxyConfiguration = Extensible & {')

        expect(output).toMatchSnapshot()
    })
})
