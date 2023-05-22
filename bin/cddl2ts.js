#!/usr/bin/env node

import parse from '../build/cli.js'

if (process.env.NODE_ENV == null) {
    process.env.NODE_ENV = 'test'
}

parse()
