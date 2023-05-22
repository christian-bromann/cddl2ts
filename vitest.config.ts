/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        exclude: [],
        coverage: {
            enabled: true,
            lines: 92,
            functions: 100,
            branches: 86,
            statements: 92
        }
    }
})
