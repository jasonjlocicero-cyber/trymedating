// src/components/BlockButton.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function BlockButton({ me, targetUserId, onBlockedChange }) {
  const authed = !!me?.id
  const [loading, setLoading] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const isSelf = authed && me.id === targetUserId

  useEffect(() => {
    let cancel = false
    if (!authed || !targetUserId) return setIsBlocked(false)
    ;(async () => {
      const { data, error } = await supabase
        .from('blocks')
        .select('user_id, blocked_user_id')
        .eq('user_id', me.id)
        .eq('blocked_user_id', targetUserId)
        .maybeSingle()
      if (!cancel) setIsBlocked(!!data && !error)
    })()
    return () => { cancel = true }
  }, [authed, me?.id, targetUserId])

  async function block() {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('blocks')
        .insert({ user_id: me.id, blocked_user_id: targetUserId })
      if (error) throw error
      setIsBlocked(true)
      onBlockedChange?.(true)
    } catch (e) {
      alert(e.message || 'Could not block user')
    } finally {
      setLoading(false)
    }
  }

  async function unblock() {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('user_id', me.id)
        .eq('blocked_user_id', targetUserId)
      if (error) throw error
      setIsBlocked(false)
      onBlockedChange?.(false)
    } catch (e) {
      alert(e.message || 'Could not unblock user')
    } finally {
      setLoading(false)
    }
  }

  if (!authed || !targetUserId || isSelf) return null

  return isBlocked ? (
    <button className="btn" onClick={unblock} disabled={loading} title="Unblock this user">
      {loading ? 'Working…' : 'Unblock'}
    </button>
  ) : (
    <button className="btn btn-secondary" onClick={block} disabled={loading} title="Block this user">
      {loading ? 'Working…' : 'Block'}
    </button>
  )
}
