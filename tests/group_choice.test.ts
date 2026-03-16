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
        expect(output).toContain('export interface AutodetectProxyConfiguration extends Extensible {')
        expect(output).toContain('export interface DirectProxyConfiguration extends Extensible {')
        expect(output).toContain('export interface ManualProxyConfiguration extends Extensible {')

        expect(output).toMatchSnapshot()
    })
})
