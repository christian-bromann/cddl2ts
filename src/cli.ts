import fs from 'node:fs/promises'
import path from 'node:path'

import { parse } from 'cddl'

import { transform } from './index.js'
import { pkg } from './constants.js'

const HELP = `
${pkg.name}
${pkg.description}

Usage:
runme2ts ./path/to/spec.cddl &> ./path/to/interface.ts

v${pkg.version}
Copyright ${(new Date()).getFullYear()} ${pkg.author}
`

export default async function cli (args = process.argv.slice(2)) {
    if (args.includes('--help') || args.length === 0) {
        console.log(HELP);
        return process.exit(0)
    }
    if (args.includes('--version') || args.includes('-v')) {
        console.log(pkg.version);
        return process.exit(0)
    }

    const absoluteFilePath = path.resolve(process.cwd(), args[0])
    const hasAccess = await fs.access(absoluteFilePath).then(() => true, () => false)
    if (!hasAccess) {
        console.error(`Couldn't find or access source CDDL file at "${absoluteFilePath}"`)
        return process.exit(1)
    }

    const ast = parse(absoluteFilePath)
    console.log(transform(ast))
}
