import url from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import cli from '../src/cli.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const localCDDL = path.join(__dirname, '..', 'examples', 'webdriver', 'local.cddl')
const remoteCDDL = path.join(__dirname, '..', 'examples', 'webdriver', 'remote.cddl')

vi.mock('../src/constants', () => ({
    pkg: {
        name: 'cddl2ts',
        version: '0.0.0'
    }
}))

describe('webdriver examples', () => {
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

    it('should generate types for local.cddl', async () => {
        await cli([localCDDL])
        expect(process.exit).not.toBeCalledWith(1)
        expect(console.error).not.toBeCalled()
        expect(console.log).toHaveBeenCalled()
        const output = vi.mocked(console.log).mock.calls.flat().join('\n')
        expect(output).toMatchSnapshot()
    })

    it('should generate types for remote.cddl', async () => {
        await cli([remoteCDDL])
        expect(process.exit).not.toBeCalledWith(1)
        expect(console.error).not.toBeCalled()
        expect(console.log).toHaveBeenCalled()
        const output = vi.mocked(console.log).mock.calls.flat().join('\n')
        expect(output).toMatchSnapshot()
    })
})
