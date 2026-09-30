"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export default function ChatPanel({
  matchId,
  userId,
  opponentName,
}: {
  matchId: string;
  userId: string;
  opponentName: string;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("match_messages")
      .select("id, sender_id, body, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages(data || []);
  }, [supabase, matchId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`chat:${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_messages", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((m) => [...m, msg]);
          if (msg.sender_id !== userId) setUnread((u) => u + 1);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, matchId, userId, load]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [open, messages]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    await supabase.from("match_messages").insert({ match_id: matchId, sender_id: userId, body: body.slice(0, 300) });
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open && (
        <div className="panel !p-0 w-72 mb-2 flex flex-col overflow-hidden shadow-xl">
          <div className="px-3 py-2 border-b border-line font-display text-sm text-gold flex items-center justify-between">
            <span>Chat met {opponentName}</span>
            <button className="text-dim" onClick={() => setOpen(false)}>
              &times;
            </button>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 max-h-64">
            {messages.length === 0 && <p className="text-dim text-xs text-center py-4">Nog geen berichten.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`text-xs max-w-[85%] ${m.sender_id === userId ? "self-end text-right" : "self-start"}`}>
                <div
                  className={`inline-block rounded-lg px-2.5 py-1.5 ${
                    m.sender_id === userId ? "bg-gold/20 text-text" : "bg-bgalt text-text"
                  }`}
                >
                  {m.body}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 p-2 border-t border-line">
            <input
              className="input flex-1 !py-1.5 !text-sm"
              placeholder="Typ een bericht\u2026"
              value={text}
              maxLength={300}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="btn-ghost !py-1.5 !px-3 !text-xs" onClick={send}>
              Stuur
            </button>
          </div>
        </div>
      )}
      <button
        className="relative w-12 h-12 rounded-full bg-gradient-to-b from-goldbright to-gold text-[#241804] shadow-lg text-xl"
        onClick={() => setOpen((o) => !o)}
      >
        {"\u{1F4AC}"}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
