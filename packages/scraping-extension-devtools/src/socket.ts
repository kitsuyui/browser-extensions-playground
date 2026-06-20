export function isCurrentOpenSocket(
  currentSocket: WebSocket | null,
  candidateSocket: WebSocket
): boolean {
  return (
    currentSocket === candidateSocket &&
    candidateSocket.readyState === WebSocket.OPEN
  )
}
