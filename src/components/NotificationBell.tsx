"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  type: string;
  payload: Record<string, any>;
  read: boolean;
  created_at: string;
};

export default function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems(data || []);
  }, [supabase, userId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, load]);

  const unread = items.filter((i) => !i.read).length;

  async function markAllRead() {
    const unreadIds = items.filter((i) => !i.read).map((i) => i.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    load();
  }

  function describe(n: Notification) {
    switch (n.type) {
      case "friend_request":
        return `${n.payload.fromUsername} wil bevriend worden`;
      case "friend_accepted":
        return `${n.payload.byUsername} accepteerde je vriendschapsverzoek`;
      case "challenge":
        return `${n.payload.fromUsername} daagt je uit`;
      case "challenge_accepted":
        return `${n.payload.byUsername} accepteerde je uitdaging`;
      case "challenge_declined":
        return `${n.payload.byUsername} wees je uitdaging af`;
      case "match_result":
        return n.payload.won ? `Je won van ${n.payload.opponent}!` : `Je verloor van ${n.payload.opponent}`;
      case "achievement":
        return `Nieuwe badge: ${n.payload.name}`;
      default:
        return "Nieuwe melding";
    }
  }

  function handleClick(n: Notification) {
    setOpen(false);
    if (n.type === "friend_request" || n.type === "friend_accepted") router.push("/friends");
    else if (n.type === "challenge") router.push("/friends");
    else if (n.type === "challenge_accepted" && n.payload.matchId) router.push(`/match/${n.payload.matchId}`);
    else if (n.type === "match_result") router.push("/profile");
  }

  return (
    <div className="relative">
      <button
        className="relative w-10 h-10 rounded-full bg-bgalt border border-line flex items-center justify-center"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markAllRead();
        }}
        aria-label="Meldingen"
      >
        {"\u{1F514}"}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto panel !p-2 z-50 shadow-xl">
          {items.length === 0 ? (
            <p className="text-dim text-sm text-center py-4">Geen meldingen</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left text-xs px-3 py-2 rounded-lg mb-1 ${
                  n.read ? "text-dim" : "text-text bg-bgalt"
                }`}
              >
                {describe(n)}
                <div className="text-[10px] text-dim mt-0.5">{new Date(n.created_at).toLocaleString("nl-BE")}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
