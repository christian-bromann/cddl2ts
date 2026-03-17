import url from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import cli from '../src/cli.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const tsCDDL = path.join(__dirname, '..', '__fixtures__', 'test.cddl')

vi.mock('../src/constants', () => ({
    pkg: {
        name: 'foobar',
        version: '1.2.3'
    }
}))

describe('cddl2ts', () => {
    const exitOrig = process.exit.bind(process)
    const logOrig = console.log.bind(console)
    const errorOrig = console.error.bind(console)
    beforeEach(() => {
        process.exit = vi.fn()
        console.log = vi.fn()
        console.error = vi.fn()
    })

    it('should print help if no args were provided', async () => {
        await cli([])

        expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/foobar/)) // Yargs showHelp() defaults to stderr
        expect(process.exit).toHaveBeenCalledWith(0)
    })

    it('should print help --help is set in args', async () => {
        await cli(['foo', 'bar', '--help', 'barfoo'])

        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/foobar/))
        expect(process.exit).toHaveBeenCalledWith(0)
    })

    it('should print version (alias)', async () => {
        await cli(['foo', '-v', 'bar'])

        expect(console.log).toHaveBeenCalledWith('1.2.3')
        expect(process.exit).toHaveBeenCalledWith(0)
    })

    it('should print version (long flag)', async () => {
        await cli(['foo', '--version', 'bar'])

        expect(console.log).toHaveBeenCalledWith('1.2.3')
        expect(process.exit).toHaveBeenCalledWith(0)
    })

    it('should fail if first parameter is not pointing to a file', async () => {
        await cli(['foo'])

        expect(console.error).toHaveBeenCalledTimes(1)
        expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('should generate correct types for test.cddl', async () => {
        await cli([path.join(__dirname, '__fixtures__', 'test.cddl')])

        expect(vi.mocked(console.log).mock.calls).toMatchSnapshot()
        expect(process.exit).toHaveBeenCalledTimes(0)
    })

    afterEach(() => {
        process.exit = exitOrig
        console.log = logOrig
        console.error = errorOrig
    })
})
