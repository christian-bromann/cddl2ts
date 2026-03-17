import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        coverage: {
            enabled: true,
            provider: 'v8',
            include: ['src/**/*.ts'],
            thresholds: {
                lines: 73.5,
                functions: 87.1,
                statements: 70.5,
                branches: 61.2,
            }
        }
    }
})
