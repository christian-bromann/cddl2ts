import url from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import cli from '../src/cli.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const testCDDL = path.join(__dirname, '__fixtures__', 'test.cddl')

vi.mock('../src/constants', () => ({
    pkg: {
        name: 'cddl2ts',
        version: '0.0.0'
    }
}))

describe('indentation option', () => {
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

    it('should use 4 spaces indentation', async () => {
        await cli([testCDDL, '--indentation', '4'])
        const output = vi.mocked(console.log).mock.calls.flat().join('\n')
        expect(output).toContain('    id?: JsUint | null;')
    })

    it('should use 2 spaces indentation by default', async () => {
        await cli([testCDDL])
        const output = vi.mocked(console.log).mock.calls.flat().join('\n')
        expect(output).toContain('  id?: JsUint | null;')
    })
})
