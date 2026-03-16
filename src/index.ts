import camelcase from 'camelcase'
import { parse, print, types } from 'recast'
import typescriptParser from 'recast/parsers/typescript.js'

import type { Assignment, PropertyType, PropertyReference, Property, Array, NativeTypeWithOperator, Type, Group, Operator } from 'cddl'

import { pkg } from './constants.js'

const b = types.builders
const NATIVE_TYPES: Record<string, any> = {
    any: b.tsAnyKeyword(),
    number: b.tsNumberKeyword(),
    float: b.tsNumberKeyword(),
    uint: b.tsNumberKeyword(),
    bool: b.tsBooleanKeyword(),
    str: b.tsStringKeyword(),
    text: b.tsStringKeyword(),
    tstr: b.tsStringKeyword(),
    range: b.tsNumberKeyword(),
    nil: b.tsNullKeyword(),
    null: b.tsNullKeyword()
}
type ObjectEntry = types.namedTypes.TSCallSignatureDeclaration | types.namedTypes.TSConstructSignatureDeclaration | types.namedTypes.TSIndexSignature | types.namedTypes.TSMethodSignature | types.namedTypes.TSPropertySignature
type ObjectBody = ObjectEntry[]
type TSTypeKind = types.namedTypes.TSAsExpression['typeAnnotation']

export interface TransformOptions {
    useUnknown?: boolean
}

export function transform (assignments: Assignment[], options?: TransformOptions) {
    if (options?.useUnknown) {
        NATIVE_TYPES.any = b.tsUnknownKeyword()
    } else {
        NATIVE_TYPES.any = b.tsAnyKeyword()
    }

    let ast = parse(
        `// compiled with https://www.npmjs.com/package/cddl2ts v${pkg.version}`,
        {
            parser: typescriptParser,
            sourceFileName: 'cddl2Ts.ts',
            sourceRoot: process.cwd()
        }
    ) as types.namedTypes.File

    for (const assignment of assignments) {
        const statement = parseAssignment(ast, assignment)
        if (!statement) {
            continue
        }
        ast.program.body.push(statement)
    }
    return print(ast).code
}

function parseAssignment (ast: types.namedTypes.File, assignment: Assignment) {
    if (assignment.Type === 'variable') {
        const propType = Array.isArray(assignment.PropertyType)
            ? assignment.PropertyType
            : [assignment.PropertyType]

        const id = b.identifier(camelcase(assignment.Name, { pascalCase: true }))

        let typeParameters: any
        // @ts-expect-error e.g. "js-int = -9007199254740991..9007199254740991"
        if (propType.length === 1 && propType[0].Type === 'range') {
            typeParameters = b.tsNumberKeyword()
        } else {
            typeParameters = b.tsUnionType(propType.map(parseUnionType))
        }

        const expr = b.tsTypeAliasDeclaration(id, typeParameters)
        expr.comments = assignment.Comments.map((c) => b.commentLine(` ${c.Content}`, true))
        return b.exportDeclaration(false, expr)
    }

    if (assignment.Type === 'group') {
        const id = b.identifier(camelcase(assignment.Name, { pascalCase: true }))

        /**
         * Check if we have choices in the group (arrays of Properties)
         */
        const properties = assignment.Properties as (Property | Property[])[]
        const hasChoices = properties.some(p => Array.isArray(p))

        if (hasChoices) {
            // Flatten static properties and collect choices
            const staticProps: Property[] = []
            const intersections: any[] = []

            for (let i = 0; i < properties.length; i++) {
                const prop = properties[i]
                if (Array.isArray(prop)) {
                    // It's a choice (Union)
                    // prop is Property[] where each Property is an option
                    // CDDL parser appends the last choice element as a subsequent property
                    // so we need to grab it and merge it into the union
                    const choiceOptions = [...prop]
                    if (properties[i + 1] && !Array.isArray(properties[i + 1])) {
                        choiceOptions.push(properties[i + 1] as Property)
                        i++ // Skip next property
                    }

                    const options = choiceOptions.map(p => {
                        // If p is a group reference (Name ''), it's a TypeReference
                        // e.g. SessionAutodetectProxyConfiguration // SessionDirectProxyConfiguration
                        // The parser sometimes wraps it in an array, sometimes not (if inside a choice)
                        const typeVal = Array.isArray(p.Type) ? p.Type[0] : p.Type

                        if (p.Name === '' && (typeVal as any).Type === 'group') {
                             return b.tsTypeReference(
                                b.identifier(camelcase((typeVal as any).Value as string, { pascalCase: true }))
                            )
                        }
                        // Otherwise it is an object literal with this property
                        return b.tsTypeLiteral(parseObjectType([p]))
                    })
                    intersections.push(b.tsUnionType(options))
                } else {
                    staticProps.push(prop as Property)
                }
            }

            if (staticProps.length > 0) {
                // Check if we have mixins in static props
                const mixins = staticProps.filter(p => p.Name === '')
                const ownProps = staticProps.filter(p => p.Name !== '')

                if (ownProps.length > 0) {
                    intersections.unshift(b.tsTypeLiteral(parseObjectType(ownProps)))
                }

                for (const mixin of mixins) {
                    if (Array.isArray(mixin.Type) && mixin.Type.length > 1) {
                         const options = mixin.Type.map(t => {
                             if ((t as any).Type === 'group') {
                                 return b.tsTypeReference(
                                     b.identifier(camelcase((t as any).Value as string, { pascalCase: true }))
                                 )
                             }
                             throw new Error(`Unexpected type in mixin union: ${JSON.stringify(t)}`)
                         })
                         intersections.push(b.tsUnionType(options))
                    } else {
                        const typeVal = Array.isArray(mixin.Type) ? mixin.Type[0] : mixin.Type
                        if ((typeVal as any).Type === 'group') {
                            intersections.push(b.tsTypeReference(
                                b.identifier(camelcase((typeVal as any).Value as string, { pascalCase: true }))
                            ))
                        }
                    }
                }
            }

            // If only one intersection element, return it directly
            // If multiple, return Intersection
            let value: any
            if (intersections.length === 0) {
                value = b.tsAnyKeyword() // Should not happen for valid CDDL?
            } else if (intersections.length === 1) {
                value = intersections[0]
            } else {
                value = b.tsIntersectionType(intersections)
            }

            const expr = b.tsTypeAliasDeclaration(id, value)
            expr.comments = assignment.Comments.map((c) => b.commentLine(` ${c.Content}`, true))
            return b.exportDeclaration(false, expr)
        }

        /**
         * transform CDDL groups like `Extensible = (*text => any)`
         */
        if (assignment.Properties.length === 1 && ((assignment.Properties as Property[])[0].Type as PropertyType[]).length === 1 && Object.keys(NATIVE_TYPES).includes(((assignment.Properties as Property[])[0].Name))) {
            const value = parseUnionType(assignment)
            const expr = b.tsTypeAliasDeclaration(id, value)
            expr.comments = assignment.Comments.map((c) => b.commentLine(` ${c.Content}`, true))
            return b.exportDeclaration(false, expr)
        }

        const extendInterfaces = (assignment.Properties as Property[])
            .filter((prop: Property) => prop.Name === '')
            .map((prop: Property) => {
                const propType = prop.Type as PropertyType[]
                const groupRef = propType[0] as PropertyReference

                // Handle nested groups (e.g. choices inside a group)
                if (Array.isArray((prop.Type as any).Properties)) {
                     // This is an inline group definition or choice structure that recast cannot extend directly
                     // We might need to add these as properties instead of extends?
                     // returning any here to prevent crash for now, but really we should merge these properties
                     return null
                }

                const value = (groupRef?.Value || (groupRef as any)?.Type) as string
                if (!value) {
                     return null
                }
                return b.tsExpressionWithTypeArguments(
                    b.identifier(camelcase(value, { pascalCase: true }))
                )
            })
            .filter(Boolean) as types.namedTypes.TSExpressionWithTypeArguments[]
        const props = assignment.Properties as Property[]
        const objectType = parseObjectType(props)

        const expr = b.tsInterfaceDeclaration(id, b.tsInterfaceBody(objectType))
        expr.extends = extendInterfaces
        expr.comments = assignment.Comments.map((c) => b.commentLine(` ${c.Content}`, true))
        return b.exportDeclaration(false, expr)
    }

    if (assignment.Type === 'array') {
        const id = b.identifier(camelcase(assignment.Name, { pascalCase: true }))
        const firstType = ((assignment.Values[0] as Property).Type as PropertyType[])
        const obj = Array.isArray(firstType)
            ? firstType.map(parseUnionType)
            : (firstType as any).Values
                ? (firstType as any).Values.map((val: any) => parseUnionType(val.Type[0]))
                : [parseUnionType(firstType)]

        const value = b.tsArrayType(
            obj.length === 1
                ? obj[0]
                : b.tsParenthesizedType(b.tsUnionType(obj))
        )
        const expr = b.tsTypeAliasDeclaration(id, value)
        expr.comments = assignment.Comments.map((c) => b.commentLine(` ${c.Content}`, true))
        return b.exportDeclaration(false, expr)
    }

    throw new Error(`Unknown assignment type "${(assignment as any).Type}"`)
}

function parseObjectType (props: Property[]): ObjectBody {
    const propItems: ObjectBody = []
    for (const prop of props) {
        /**
         * Empty groups like
         * {
         *   HasCut: false,
         *   Occurrence: { n: 1, m: 1 },
         *   Name: '',
         *   Type: [ { Type: 'group', Value: 'Extensible', Unwrapped: false } ],
         *   Comment: ''
         * }
         * are ignored and later added as interface extensions
         */
        if (prop.Name === '') {
            continue
        }

        const id = b.identifier(camelcase(prop.Name))
        const cddlType: PropertyType[] = Array.isArray(prop.Type) ? prop.Type : [prop.Type]
        const comments: string[] = prop.Comments.map((c) => ` ${c.Content}`)

        if (prop.Operator && prop.Operator.Type === 'default') {
            const defaultValue = parseDefaultValue(prop.Operator)
            defaultValue && comments.length && comments.push('') // add empty line if we have previous comments
            defaultValue && comments.push(` @default ${defaultValue}`)
        }

        const type = cddlType.map((t) => {
            const unionType = parseUnionType(t)
            if (unionType) {
                const defaultValue = parseDefaultValue((t as PropertyReference).Operator)
                defaultValue && comments.length && comments.push('') // add empty line if we have previous comments
                defaultValue && comments.push(` @default ${defaultValue}`)
                return unionType
            }


            throw new Error(`Couldn't parse property ${JSON.stringify(t)}`)
        })

        const typeAnnotation = b.tsTypeAnnotation(b.tsUnionType(type))
        const isOptional = prop.Occurrence.n === 0
        const propSignature = b.tsPropertySignature(id, typeAnnotation, isOptional)
        propSignature.comments = comments.length ? [b.commentBlock(`*\n *${comments.join('\n *')}\n `)] : []
        propItems.push(propSignature)
    }

    return propItems
}

function parseUnionType (t: PropertyType | Assignment): TSTypeKind {
    if (typeof t === 'string') {
        if (!NATIVE_TYPES[t]) {
            throw new Error(`Unknown native type: "${t}`)
        }
        return NATIVE_TYPES[t]
    } else if (NATIVE_TYPES[(t as NativeTypeWithOperator).Type as Type]) {
        return NATIVE_TYPES[(t as NativeTypeWithOperator).Type as Type]
    } else if ((t as PropertyReference).Value === 'null') {
        return b.tsNullKeyword()
    } else if (t.Type === 'group') {
        const value = (t as PropertyReference).Value as string
        /**
         * check if we have special groups
         */
        if (!value && (t as Group).Properties) {
            const prop = (t as Group).Properties
            /**
             * {*text => text} which will be transformed to `Record<string, string>`
             */
            if (prop.length === 1 && Object.keys(NATIVE_TYPES).includes((prop[0] as Property).Name)) {
                return b.tsTypeReference(
                    b.identifier('Record'),
                    b.tsTypeParameterInstantiation([
                        NATIVE_TYPES[(prop[0] as Property).Name],
                        parseUnionType(((prop[0] as Property).Type as PropertyType[])[0])
                    ])
                )
            }

            /**
             * e.g. ?attributes: {*foo => text},
             */
            return b.tsTypeLiteral(parseObjectType((t as Group).Properties as Property[]))
        }

        return b.tsTypeReference(
            b.identifier(camelcase(value.toString(), { pascalCase: true }))
        )
    } else if (t.Type === 'literal' && typeof t.Value === 'string') {
        return b.tsLiteralType(b.stringLiteral(t.Value))
    } else if (t.Type === 'literal' && typeof t.Value === 'number') {
        return b.tsLiteralType(b.numericLiteral(t.Value))
    } else if (t.Type === 'literal' && typeof t.Value === 'boolean') {
        return b.tsLiteralType(b.booleanLiteral(t.Value))
    } else if (t.Type === 'array') {
        const types = ((t as Array).Values[0] as Property).Type as PropertyType[]
        const typedTypes = (Array.isArray(types) ? types : [types]).map((val) => {
            if (typeof val === 'string' && NATIVE_TYPES[val]) {
                return NATIVE_TYPES[val]
            }
            return b.tsTypeReference(
                b.identifier(camelcase((val as any).Value as string, { pascalCase: true }))
            )
        })

        if (typedTypes.length > 1) {
            return b.tsArrayType(b.tsParenthesizedType(b.tsUnionType(typedTypes)))
        }

        if (!typedTypes[0]) {
             console.log('typedTypes[0] is missing!', types, typedTypes);
        }
        return b.tsArrayType(typedTypes[0])
    } else if (typeof t.Type === 'object' && ((t as NativeTypeWithOperator).Type as PropertyReference).Type === 'range') {
        return b.tsNumberKeyword()
    } else if (typeof t.Type === 'object' && ((t as NativeTypeWithOperator).Type as PropertyReference).Type === 'group') {
        /**
         * e.g. ?pointerType: input.PointerType .default "mouse"
         */
        const referenceValue = camelcase(((t as NativeTypeWithOperator).Type as PropertyReference).Value as string, { pascalCase: true })
        return b.tsTypeReference(b.identifier(referenceValue))
    }

    throw new Error(`Unknown union type: ${JSON.stringify(t)}`)
}

function parseDefaultValue (operator?: Operator) {
    if (!operator || operator.Type !== 'default') {
        return
    }

    const operatorValue = operator.Value as PropertyReference
    if (operator.Value === 'null') {
        return operator.Value
    }

    if (operatorValue.Type !== 'literal') {
        throw new Error(`Can't parse operator default value of ${JSON.stringify(operator)}`)
    }
    return typeof operatorValue.Value === 'string'
        ? `'${operatorValue.Value}'`
        : operatorValue.Value as unknown as string
}
