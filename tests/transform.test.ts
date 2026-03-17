import { describe, it, expect } from 'vitest'
import { transform } from '../src/index.js'
import type { Variable } from 'cddl'

describe('literal transformation direct', () => {
    it('should transform bigint literals correctly', () => {
        const assignment: Variable = {
            Type: 'variable',
            Name: 'MyBigInt',
            PropertyType: {
                Type: 'literal',
                Value: 9007199254740995n
            } as any,
            Comments: []
        }

        const output = transform([assignment])
        expect(output).toContain('export type MyBigInt = 9007199254740995n;')
    })
})
