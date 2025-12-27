// src/chat/ChatContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { supabase } from '../lib/supabaseClient'
import ChatDock from '../components/ChatDock'

const ChatCtx = createContext({
  openChat: (_id, _name) => {},
  closeChat: () => {},
  me: null,
  isOpen: false,
  partner: { id: null, name: '' },
  unreadBump: 0,
})

export function ChatProvider({ children, renderDock = true }) {
  // ---- Auth → me ----
  const [me, setMe] = useState(null)

  useEffect(() => {
    let unsub
    ;(async () => {
      const { data: { user } = {} } = await supabase.auth.getUser()
      setMe(user ? { id: user.id, name: user.user_metadata?.full_name || user.email } : null)
    })()

    const sub = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user
      setMe(u ? { id: u.id, name: u.user_metadata?.full_name || u.email } : null)
    })

    unsub = sub?.data?.subscription
    return () => unsub?.unsubscribe?.()
  }, [])

  // ---- Provider-owned dock control (only used when renderDock=true) ----
  const [isOpen, setOpen] = useState(false)
  const [partner, setPartner] = useState({ id: null, name: '' })

  const forwardToLauncher = (partnerId, partnerName = '') => {
    if (typeof window === 'undefined') return

    // Prefer ChatLauncher’s global function if it exists
    if (typeof window.openChat === 'function') {
      window.openChat(partnerId, partnerName || '')
      return
    }

    // Fallback: ChatLauncher listens to "open-chat"
    window.dispatchEvent(
      new CustomEvent('open-chat', { detail: { partnerId, partnerName: partnerName || '' } })
    )
  }

  const openChat = (partnerId, partnerName = '') => {
    if (!partnerId) return

    // Always keep partner in context (useful for debugging/other UI)
    setPartner({ id: partnerId, name: partnerName })

    // If provider is rendering the dock, open it here
    if (renderDock) {
      setOpen(true)
      return
    }

    // Otherwise: bubble-only -> forward to ChatLauncher
    forwardToLauncher(partnerId, partnerName)
  }

  const closeChat = () => setOpen(false)

  // Listen for global "tryme:open-chat" event (no imports needed)
  useEffect(() => {
    const onOpen = (e) => {
      const { partnerId, partnerName = '' } = e.detail || {}
      if (partnerId) openChat(partnerId, partnerName)
    }
    window.addEventListener('tryme:open-chat', onOpen)
    return () => window.removeEventListener('tryme:open-chat', onOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderDock])

  // Optional unread bump (for badges if you wire it up)
  const [unreadBump, setUnreadBump] = useState(0)
  const onUnreadChange = () => setUnreadBump((n) => n + 1)

  const value = useMemo(
    () => ({ openChat, closeChat, me, isOpen, partner, unreadBump }),
    [me, isOpen, partner, unreadBump]
  )

  return (
    <ChatCtx.Provider value={value}>
      {children}

      {/* Provider-owned dock (only used if renderDock=true) */}
      {renderDock && isOpen && me && (
        <ChatDock
          me={me}
          partnerId={partner.id}
          partnerName={partner.name}
          onClose={closeChat}
          onUnreadChange={onUnreadChange}
        />
      )}
    </ChatCtx.Provider>
  )
}

export function useChat() {
  return useContext(ChatCtx)
}

export function ChatButton({
  partnerId,
  partnerName = '',
  children = 'Message',
  onClick,
  ...props
}) {
  const { openChat } = useChat()
  return (
    <button
      {...props}
      onClick={(e) => {
        onClick?.(e)
        openChat(partnerId, partnerName)
      }}
    >
      {children}
    </button>
  )
}


