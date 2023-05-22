CDDL to TypeScript ![Test](https://github.com/christian-bromann/cddl/workflows/Test/badge.svg?branch=master)
==================

> A Node.js package that can generate a TypeScript definition based on a CDDL file

CDDL expresses Concise Binary Object Representation (CBOR) data structures ([RFC 7049](https://tools.ietf.org/html/rfc7049)). Its main goal is to provide an easy and unambiguous way to express structures for protocol messages and data formats that use CBOR or JSON. This package allows you to transform a CDDL file into a TypeScript interface that you can use for other TypeScript project.

Related projects:
- [christian-bromann/cddl](https://github.com/christian-bromann/cddl): parses CDDL into an AST

## Install

To install this package run:

```sh
$ npm install cddl2ts
```

## Using this package

This package exposes a CLI as well as a programmatic interface for transforming CDDL into TypeScript.

### CLI

```sh
npx cddl2ts ./path/to/interface.cddl &> ./path/to/interface.ts
```

### Programmatic Interface

The module exports a `transform` method that takes an CDDL AST object and returns a TypeScript definition as `string`, e.g.:

```js
import { transform } from 'cddl2ts'

/**
 * spec.cddl:
 *
 * session.CapabilityRequest = {
 *   ?acceptInsecureCerts: bool,
 *   ?browserName: text,
 *   ?browserVersion: text,
 *   ?platformName: text,
 * };
 */
const ts = transform('./spec.cddl')
console.log(ts)
/**
 * outputs:
 *
 * interface SessionCapabilityRequest {
 *   acceptInsecureCerts?: boolean,
 *   browserName?: string,
 *   browserVersion?: string,
 *   platformName?: string,
 * }
 */
```

---

If you are interested in this project, please feel free to contribute ideas or code patches. Have a look at our [contributing guidelines](https://github.com/christian-bromann/cddl2ts/blob/master/CONTRIBUTING.md) to get started.
