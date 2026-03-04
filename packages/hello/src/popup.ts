import { createHelloWorldMessage } from './index'

const element = document.querySelector('#message')

if (element instanceof HTMLParagraphElement) {
  element.textContent = createHelloWorldMessage()
}
