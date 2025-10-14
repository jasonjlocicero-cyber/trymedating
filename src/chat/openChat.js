// src/chat/openChat.js
export function openChat(partnerId, partnerName = '') {
  window.dispatchEvent(new CustomEvent('tryme:open-chat', {
    detail: { partnerId, partnerName }
  }))
}
