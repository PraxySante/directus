const dynamicVariablePrefixes = ['$NOW', '$CURRENT_USER', '$CURRENT_ROLE', '$CURRENT_ITEM'];

export function isDynamicVariable(value: any) {
	return typeof value === 'string' && dynamicVariablePrefixes.some((prefix) => value.startsWith(prefix));
}