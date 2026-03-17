import {
    Assignment,
    PropertyReference,
    Property,
    Array,
    NativeTypeWithOperator,
    Group,
    Variable
} from 'cddl'
import camelcase from 'camelcase'

export function pascalCase(name: string) {
    return camelcase(name, { pascalCase: true })
}

export function isVariable(assignment: Assignment): assignment is Variable {
    return assignment.Type === 'variable'
}

export function isGroup(t: any): t is Group {
    return t && t.Type === 'group'
}

export function isCDDLArray(t: any): t is Array {
    return t && t.Type === 'array'
}

export function isProperty(t: any): t is Property {
    return t && typeof t.Name === 'string' && typeof t.HasCut === 'boolean'
}

export function isUnNamedProperty(t: any): t is Property & { Name: '' } {
    return isProperty(t) && t.Name === ''
}

export function isNamedGroupReference(t: any): t is PropertyReference & { Value: string } {
    return isGroup(t) && isPropertyReference(t) && typeof t.Value === 'string'
}

export function isPropertyReference(t: any): t is PropertyReference {
    return t && 'Value' in t
}

export function isNativeTypeWithOperator(t: any): t is NativeTypeWithOperator {
    return t && typeof t.Type === 'object' && 'Operator' in t
}

export function isRange(t: any): boolean {
    return t && typeof t.Type === 'object' && (t.Type as any).Type === 'range'
}

export function isLiteralWithValue(t: any): t is {
    Type: 'literal'
    Value: unknown
} {
    return t && t.Type === 'literal' && 'Value' in t
}

export function hasTypeProperty(t: any): t is { Type: string } {
    return t && typeof t.Type === 'string'
}
