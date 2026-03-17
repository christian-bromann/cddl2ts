import camelcase from 'camelcase'
import { parse, print, types } from 'recast'
import typescriptParser from 'recast/parsers/typescript.js'

import type { Assignment, PropertyType, PropertyReference, Property, Array, Operator } from 'cddl'

import {
    isCDDLArray,
    isGroup,
    isNamedGroupReference,
    isLiteralWithValue,
    isNativeTypeWithOperator,
    isUnNamedProperty,
    isPropertyReference,
    isRange,
    isVariable,
    pascalCase
} from './utils.js'

import { pkg } from './constants.js'

const b = types.builders
const NATIVE_TYPES: Record<string, any> = {
    any: b.tsAnyKeyword(),
    number: b.tsNumberKeyword(),
    int: b.tsNumberKeyword(),
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
    ) satisfies types.namedTypes.File

    for (const assignment of assignments) {
        const statement = parseAssignment(assignment)
        if (!statement) {
            continue
        }
        ast.program.body.push(statement)
    }
    return print(ast).code
}

function parseAssignment (assignment: Assignment) {
    if (isVariable(assignment)) {
        const propType = Array.isArray(assignment.PropertyType)
            ? assignment.PropertyType
            : [assignment.PropertyType]

        const id = b.identifier(pascalCase(assignment.Name))

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

    if (isGroup(assignment)) {
        const id = b.identifier(pascalCase(assignment.Name))

        /**
         * Check if we have choices in the group (arrays of Properties)
         */
        const properties = assignment.Properties
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
                    const nextProp = properties[i + 1]

                    if (nextProp && !Array.isArray(nextProp)) {
                        choiceOptions.push(nextProp)
                        i++ // Skip next property
                    }

                    const options = choiceOptions.map(p => {
                        // If p is a group reference (Name ''), it's a TypeReference
                        // e.g. SessionAutodetectProxyConfiguration // SessionDirectProxyConfiguration
                        // The parser sometimes wraps it in an array, sometimes not (if inside a choice)
                        const typeVal = Array.isArray(p.Type) ? p.Type[0] : p.Type

                        if (isUnNamedProperty(p)) {
                            // Handle un-named properties (bare types) in choices.
                            // Native types / literals
                            if (isNamedGroupReference(typeVal)) {
                                return b.tsTypeReference(
                                   b.identifier(pascalCase(typeVal.Value || typeVal.Type))
                               )
                            }
                            return parseUnionType(typeVal);
                       }
                        // Otherwise it is an object literal with this property
                        return b.tsTypeLiteral(parseObjectType([p]))
                    })
                    intersections.push(b.tsUnionType(options))
                } else {
                    staticProps.push(prop)
                }
            }

            if (staticProps.length > 0) {
                // Check if we have mixins in static props
                const mixins = staticProps.filter(isUnNamedProperty)
                const ownProps = staticProps.filter(p => !isUnNamedProperty(p))

                if (ownProps.length > 0) {
                    intersections.unshift(b.tsTypeLiteral(parseObjectType(ownProps)))
                }

                for (const mixin of mixins) {
                    if (Array.isArray(mixin.Type) && mixin.Type.length > 1) {
                         const options = mixin.Type.map(parseUnionType)
                         intersections.push(b.tsUnionType(options))
                    } else {
                        const typeVal = Array.isArray(mixin.Type) ? mixin.Type[0] : mixin.Type
                        if (isNamedGroupReference(typeVal)) {
                            intersections.push(b.tsTypeReference(
                                b.identifier(pascalCase(typeVal.Value))
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

        const props = properties as Property[]

        /**
         * transform CDDL groups like `Extensible = (*text => any)`
         */
        if (props.length === 1) {
            const prop = props[0]
            const propType = Array.isArray(prop.Type) ? prop.Type : [prop.Type]
            if (propType.length === 1 && Object.keys(NATIVE_TYPES).includes(prop.Name)) {
                const value = parseUnionType(assignment)
                const expr = b.tsTypeAliasDeclaration(id, value)
                expr.comments = assignment.Comments.map((c) => b.commentLine(` ${c.Content}`, true))
                return b.exportDeclaration(false, expr)
            }
        }

        // Check if extended interfaces are likely unions or conflicting types
        // In CDDL, including a group (Name '') that is defined elsewhere as a choice (union)
        // is valid, but TypeScript interfaces cannot extend unions.
        // We can't easily know if the referenced group is a union without a symbol table or 2-pass.
        // However, if we simply use type intersection for ALL group inclusions, it is always safe.
        // (Interface extending Interface is same as Type = Interface & Interface)
        // Let's refactor to use Type Alias with Intersection if there are any mixins.

        const mixins = props.filter(isUnNamedProperty)

        if (mixins.length > 0) {
            // It has mixins (extensions). Use type alias with intersection to be safe against unions.
            // Type = (Mixin1 & Mixin2 & { OwnProps })

            const intersections: any[] = []

            for (const mixin of mixins) {
                // If mixin is a group choice (e.g. `(A // B)`), the parser returns a Group object
                // with Properties containing the choices. We need to extract them.
                if (Array.isArray(mixin.Type) && mixin.Type.length > 1) {
                     // Check if it's a choice of types
                     const unionOptions: any[] = []
                     for (const t of mixin.Type) {
                         let refName: string | undefined
                         if (typeof t === 'string') refName = t
                         else if (isNamedGroupReference(t)) refName = t.Value
                         else refName = (t as any).Value || (t as any).Type

                         if (refName) unionOptions.push(b.tsTypeReference(b.identifier(pascalCase(refName))))
                     }
                     if (unionOptions.length > 0) {
                        intersections.push(b.tsParenthesizedType(b.tsUnionType(unionOptions)))
                        continue
                     }
                }

                if (isGroup(mixin.Type) && Array.isArray(mixin.Type.Properties)) {
                    const group = mixin.Type
                    const choices: any[] = []

                    for (const prop of group.Properties) {
                        // Choices are wrapped in arrays in the properties
                        const options = Array.isArray(prop) ? prop : [prop]
                        if (options.length > 1) { // It's a choice within the mixin group
                            const unionOptions: any[] = []
                            for (const option of options) {
                                let refName: string | undefined
                                const type = option.Type
                                if (typeof type === 'string') refName = type
                                else if (isNamedGroupReference(type)) refName = type.Value
                                else if (Array.isArray(type) && type[0]) {
                                     const first = type[0]
                                     if (isNamedGroupReference(first)) refName = first.Value
                                     else if (isUnNamedProperty(first)) {
                                         if (isNamedGroupReference(first.Type)) refName = first.Type.Value
                                         else if (isGroup(first.Type) && first.Type.Properties && first.Type.Properties.length === 1) {
                                            // Handle case where group reference is wrapped deeply
                                            const subProp = first.Type.Properties[0] as Property
                                            if (isNamedGroupReference(subProp.Type)) refName = subProp.Type.Value
                                         }
                                     }
                                     if (!refName) refName = (first as any).Value || (first as any).Type
                                }

                                if (refName) unionOptions.push(b.tsTypeReference(b.identifier(pascalCase(refName))))
                            }
                            if (unionOptions.length > 0) {
                                choices.push(b.tsParenthesizedType(b.tsUnionType(unionOptions)))
                                continue
                            }
                        }

                        for (const option of options) {
                            let refName: string | undefined
                            const type = option.Type

                            if (typeof type === 'string') {
                                refName = type
                            } else if (Array.isArray(type)) {
                                if (type.length > 1) {
                                  // console.log('DEBUG: Found array length > 1', JSON.stringify(type, null, 2))
                                    const unionChoices: any[] = []
                                    for (const t of type) {
                                        let name: string | undefined
                                        if (typeof t === 'string') name = t
                                        else if (isNamedGroupReference(t)) name = t.Value
                                        else if (isUnNamedProperty(t)) {
                                            if (isNamedGroupReference(t.Type)) name = t.Type.Value
                                            else if (isGroup(t.Type) && t.Type.Properties && t.Type.Properties.length === 1) {
                                                const subProp = t.Type.Properties[0] as Property
                                                if (isNamedGroupReference(subProp.Type)) name = subProp.Type.Value
                                            }
                                        }
                                        if (!name) name = (t as any).Value || (t as any).Type

                                        if (name) unionChoices.push(b.tsTypeReference(b.identifier(pascalCase(name))))
                                    }

                                    if (unionChoices.length > 0) {
                                        choices.push(b.tsParenthesizedType(b.tsUnionType(unionChoices)))
                                        continue
                                    }
                                } else if (type.length === 1 && Array.isArray(type[0])) {
                                  // Handle nested union e.g. [ [ A, B ] ] which seems common in some parsers for choices
                                  const nested = type[0]
                                  if (nested.length > 1) {
                                       const unionChoices: any[] = []
                                       for (const t of nested) {
                                          let name: string | undefined
                                          if (typeof t === 'string') name = t
                                          else if (isNamedGroupReference(t)) name = t.Value
                                          else if (isUnNamedProperty(t)) {
                                              if (isNamedGroupReference(t.Type)) name = t.Type.Value
                                              else if (isGroup(t.Type) && t.Type.Properties && t.Type.Properties.length === 1) {
                                                  const subProp = t.Type.Properties[0] as Property
                                                  if (isNamedGroupReference(subProp.Type)) name = subProp.Type.Value
                                              }
                                              else {
                                                   // Fallback for wrapped primitive?
                                                   name = (t.Type as any).Value || (t.Type as any).Type
                                              }
                                          }
                                          if (!name) name = (t as any).Value || (t as any).Type

                                          if (name) unionChoices.push(b.tsTypeReference(b.identifier(pascalCase(name))))
                                      }
                                      if (unionChoices.length > 0) {
                                          choices.push(b.tsParenthesizedType(b.tsUnionType(unionChoices)))
                                          continue
                                      }
                                  }
                                }

                                const first = type[0]
                                if (first) {
                                    if (isNamedGroupReference(first)) {
                                        refName = first.Value
                                    } else if (!isGroup(first)) {
                                          if (isUnNamedProperty(first)) {
                                              if (isNamedGroupReference(first.Type)) {
                                                  refName = first.Type.Value
                                              } else {
                                                  refName = (first.Type as any).Value || (first.Type as any).Type
                                              }
                                          } else {
                                              refName = (first as any).Value || (first as any).Type
                                          }
                                    } else {
                                          refName = (first as any).Value || (first as any).Type
                                    }
                                }
                            } else if (type && typeof type === 'object') {
                                if (isGroup(type) && Array.isArray(type.Properties)) {
                                    choices.push(b.tsTypeLiteral(parseObjectType(type.Properties as Property[])))
                                    continue
                                }
                                refName = isNamedGroupReference(type)
                                    ? type.Value || type.Type
                                    : (type as any).Value || (type as any).Type
                            }

                            // If we found a refName, push it. Note that if this was a choice we handled above, we skip this
                            if (refName) {
                                choices.push(
                                    b.tsTypeReference(b.identifier(pascalCase(refName)))
                                )
                            }
                        }
                    }

                    if (choices.length > 0) {
                        // Unions inside intersections must be parenthesized to avoid ambiguity
                        // e.g. (A | B) & C vs A | (B & C)
                        const union = b.tsUnionType(choices)
                        intersections.push(b.tsParenthesizedType(union))
                        continue
                    }
                }

                const propType = mixin.Type as PropertyType[]

                if (typeof propType === 'string' && NATIVE_TYPES[propType]) {
                    intersections.push(NATIVE_TYPES[propType])
                    continue
                }

                const groupRef = propType[0] as PropertyReference

                // Handle nested inline groups if any (though usually flat here if name is empty?)
                const value = (groupRef?.Value || (groupRef as any)?.Type) as string
                if (value) {
                     intersections.push(
                         b.tsTypeReference(b.identifier(pascalCase(value)))
                     )
                }
            }

            const ownProps = props.filter(p => !isUnNamedProperty(p))
            if (ownProps.length > 0) {
                 intersections.push(b.tsTypeLiteral(parseObjectType(ownProps)))
            }

            let value: any
            if (intersections.length === 1) {
                value = intersections[0]
            } else {
                value = b.tsIntersectionType(intersections)
            }

            const expr = b.tsTypeAliasDeclaration(id, value)
            expr.comments = assignment.Comments.map((c) => b.commentLine(` ${c.Content}`, true))
            return b.exportDeclaration(false, expr)
        }

        // Fallback to interface if no mixins (pure object)
        const objectType = parseObjectType(props)

        const expr = b.tsInterfaceDeclaration(id, b.tsInterfaceBody(objectType))
        expr.comments = assignment.Comments.map((c) => b.commentLine(` ${c.Content}`, true))
        return b.exportDeclaration(false, expr)
    }

    if (isCDDLArray(assignment)) {
        const id = b.identifier(pascalCase(assignment.Name))

        const assignmentValues = assignment.Values[0]

        if (Array.isArray(assignmentValues)) {
            // It's a choice/union in the array definition
            // e.g. Foo = [ (A | B) ]
            // assignment.Values[0] is Property[] (the choices)
            // We need to parse each choice.
            const obj = assignmentValues.map((prop) => {
                 const t = Array.isArray(prop.Type) ? prop.Type[0] : prop.Type
                 return parseUnionType(t)
            })
            const value = b.tsArrayType(b.tsParenthesizedType(b.tsUnionType(obj)))
            const expr = b.tsTypeAliasDeclaration(id, value)
            expr.comments = assignment.Comments.map((c) => b.commentLine(` ${c.Content}`, true))
            return b.exportDeclaration(false, expr)
        }

        // Standard array
        const firstType = assignmentValues.Type
        const obj = Array.isArray(firstType)
            ? firstType.map(parseUnionType)
            : isCDDLArray(firstType)
                ? firstType.Values.map((val: any) => parseUnionType(Array.isArray(val.Type) ? val.Type[0] : val.Type))
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
        if (isUnNamedProperty(prop)) {
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
    } else if ((t as any).Type && typeof (t as any).Type === 'string' && NATIVE_TYPES[(t as any).Type]) {
        return NATIVE_TYPES[(t as any).Type]
    } else if (isNativeTypeWithOperator(t) && NATIVE_TYPES[(t.Type as any).Type]) {
        return NATIVE_TYPES[(t.Type as any).Type]
    } else if (isPropertyReference(t) && t.Value === 'null') {
        return b.tsNullKeyword()
    } else if (isGroup(t)) {
        /**
         * check if we have special groups
         */
        if (isGroup(t) && !isNamedGroupReference(t) && t.Properties) {
            const prop = t.Properties

            /**
             * Check if we have choices in the group (arrays of Properties)
             */
            if (prop.some(p => Array.isArray(p))) {
                const options: TSTypeKind[] = []
                for (const choice of prop) {
                    const subProps = Array.isArray(choice) ? choice : [choice]

                    if (subProps.length === 1 && isUnNamedProperty(subProps[0])) {
                        const first = subProps[0]
                        const subType = Array.isArray(first.Type) ? first.Type[0] : first.Type
                        options.push(parseUnionType(subType as PropertyType))
                        continue
                    }

                    if (subProps.every(isUnNamedProperty)) {
                        const tupleItems = subProps.map((p) => {
                            const subType = Array.isArray(p.Type) ? p.Type[0] : p.Type
                            return parseUnionType(subType as PropertyType)
                        })
                        options.push(b.tsTupleType(tupleItems))
                        continue
                    }

                    options.push(b.tsTypeLiteral(parseObjectType(subProps)))
                }
                return b.tsUnionType(options)
            }

            if ((prop as Property[]).every(isUnNamedProperty)) {
                 const items = (prop as Property[]).map(p => {
                       const t = Array.isArray(p.Type) ? p.Type[0] : p.Type
                       return parseUnionType(t as PropertyType)
                 })

                 if (items.length === 1) return items[0];
                 return b.tsTupleType(items);
            }

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
            return b.tsTypeLiteral(parseObjectType(t.Properties as Property[]))
        } else if (isNamedGroupReference(t)) {
            return b.tsTypeReference(
                b.identifier(pascalCase(t.Value))
            )
        }
    throw new Error(`Unknown group type: ${JSON.stringify(t)}`)
    } else if (isLiteralWithValue(t)) {
        if (typeof t.Value === 'string') return b.tsLiteralType(b.stringLiteral(t.Value))
        if (typeof t.Value === 'number') return b.tsLiteralType(b.numericLiteral(t.Value))
        if (typeof t.Value === 'boolean') return b.tsLiteralType(b.booleanLiteral(t.Value))
        if (typeof t.Value === 'bigint') return b.tsLiteralType(b.bigIntLiteral(t.Value.toString()))
        if (t.Value === null) return b.tsNullKeyword()
        throw new Error(`Unsupported literal type: ${JSON.stringify(t)}`)
    } else if (isCDDLArray(t)) {
        const types = ((t as Array).Values[0] as Property).Type as PropertyType[]
        const typedTypes = (Array.isArray(types) ? types : [types]).map((val) => {
            if (typeof val === 'string' && NATIVE_TYPES[val]) {
                return NATIVE_TYPES[val]
            }
            return b.tsTypeReference(
                b.identifier(pascalCase((val as any).Value as string))
            )
        })

        if (typedTypes.length > 1) {
            return b.tsArrayType(b.tsParenthesizedType(b.tsUnionType(typedTypes)))
        }

        if (!typedTypes[0]) {
             console.log('typedTypes[0] is missing!', types, typedTypes);
        }
        return b.tsArrayType(typedTypes[0])
    } else if (isRange(t)) {
        return b.tsNumberKeyword()
    } else if (isNativeTypeWithOperator(t) && isNamedGroupReference(t.Type)) {
        /**
         * e.g. ?pointerType: input.PointerType .default "mouse"
         */
        const referenceValue = pascalCase(t.Type.Value)
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
