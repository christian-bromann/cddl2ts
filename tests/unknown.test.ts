import url from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import cli from '../src/cli.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const localCDDL = path.join(__dirname, '__fixtures__', 'unknown.cddl')

vi.mock('../src/constants', () => ({
    pkg: {
        name: 'cddl2ts',
        version: '0.0.0'
    }
}))

describe('unknown option', () => {
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

    it('should use unknown instead of any', async () => {
        await cli([localCDDL, '--unknown-as-any'])

        const output = vi.mocked(console.log).mock.calls.flat().join('\n')
        expect(output).toContain('export type Foo = unknown;')
        expect(output).toContain('export type Bar = unknown[];')
        expect(output).toContain('export type Baz = Record<string, unknown>;')
    })

    it('should default to any', async () => {
        await cli([localCDDL])

        const output = vi.mocked(console.log).mock.calls.flat().join('\n')
        expect(output).toContain('export type Foo = any;')
        expect(output).toContain('export type Bar = any[];')
        expect(output).toContain('export type Baz = Record<string, any>;')
    })
})
