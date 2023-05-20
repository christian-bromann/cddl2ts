import Lexer from './lexer.js'
import Parser from './parser.js'

import { transform as transformTS } from './transform/ts.js'
import { ParseTargets } from './constants.js'
import type { ParseOptions } from './types.js'

export default {
    parse: (filePath: string, opts: ParseOptions = { target: ParseTargets.AST }) => {
        const parser = new Parser(filePath)
        const ast = parser.parse()

        if (opts.target === ParseTargets.AST) {
            return ast
        }
        if (opts.target === ParseTargets.TS) {
            return transformTS(ast)
        }

        throw new Error(`Unsupported parse target: "${opts.target || 'undefined'}"`) 
    }
}

export { Lexer, Parser, ParseTargets }