export function dialogInstanceKey(kind: string, identity?: string | null): string {
  return `${kind}:${identity ?? 'closed'}`
}
