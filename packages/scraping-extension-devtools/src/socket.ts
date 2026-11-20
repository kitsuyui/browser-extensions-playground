const OPEN_SOCKET_READY_STATE = 1

export function isCurrentSocket(
  currentSocket: WebSocket | null,
  candidateSocket: WebSocket
): boolean {
  return currentSocket === candidateSocket
}

export function isCurrentOpenSocket(
  currentSocket: WebSocket | null,
  candidateSocket: WebSocket
): boolean {
  return (
    isCurrentSocket(currentSocket, candidateSocket) &&
    candidateSocket.readyState === OPEN_SOCKET_READY_STATE
  )
}
