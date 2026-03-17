import fs from 'node:fs/promises'
import path from 'node:path'
import yargs from 'yargs'

import { parse } from 'cddl'

import { transform } from './index.js'
import { pkg } from './constants.js'

export default async function cli (argv = process.argv.slice(2)) {
    const parser = yargs(argv)
        .usage(`${pkg.name}\n${pkg.description}\n\nUsage:\nrunme2ts ./path/to/spec.cddl &> ./path/to/interface.ts`)
        .epilog(`v${pkg.version}\nCopyright ${(new Date()).getFullYear()} ${pkg.author}`)
        .version(pkg.version)
        .option('u', {
            alias: 'unknown-as-any',
            type: 'boolean',
            description: 'Use unknown instead of any',
            default: false
        })
        .help('help')
        .alias('h', 'help')
        .alias('v', 'version')

    const args = await parser.argv

    if (args._.length === 0) {
        parser.showHelp()
        return process.exit(0)
    }

    const absoluteFilePath = path.resolve(process.cwd(), args._[0] as string)
    const hasAccess = await fs.access(absoluteFilePath).then(() => true, () => false)

    if (!hasAccess) {
        console.error(`Couldn't find or access source CDDL file at "${absoluteFilePath}"`)
        return process.exit(1)
    }

    const ast = parse(absoluteFilePath)
    console.log(transform(ast, { useUnknown: args.u as boolean }))
}
