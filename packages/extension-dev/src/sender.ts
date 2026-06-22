export function isExtensionSender(
  sender: unknown,
  extensionId: string | undefined
): boolean {
  if (!extensionId) return false
  const id = (sender as { id?: string } | null)?.id
  return id === extensionId
}
