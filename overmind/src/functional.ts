/**
 * Creates a comparator from order value extractor function.
 */
export function comparing<V, K>(fn: (val: V) => K): (val1: V, val2: V) => number {
    return (v1, v2) => {
        if (fn(v1) < fn(v2)) {
            return -1;
        } else if (fn(v1) > fn(v2)) {
            return 1;
        }
        return 0;
    };
}

export function enumNameOf(protoVal: number, protoEnumObj: any, defaultValue = null): string? {
    let name: string = null;
    new Map(Object.entries(protoEnumObj)).forEach((enumValue: number, enumName: string) => {
        if (enumValue === protoVal) {
            name = enumName;
        }
    });
    return name;
}
