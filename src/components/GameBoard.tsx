
    
  
          className={`hp-fill ${p.hp / p.maxHp > 0.5 ? "bg-[#4C8C5B]" : p.hp / p.maxHp > 0.2 ? "bg-[#C79A3D]" : "bg-[#B33B3B]"}`}
          style={{ width: `${Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100))}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ textShadow: "0 1px 2px rgba(0,0,0,.6)" }}>
          {p.hp}/{p.maxHp} HP
        </span>
      </div>

      {subhands ? (
        <div className="flex flex-col gap-2.5">
          {subhands.map((sh, shIdx) => {
            const val = computeHandValue(sh.cards);
            const active = !sh.done;
            const chosen = state.pending[index][shIdx] != null;
            const showControls = isMe && state.phase === "action" && active && !chosen;
            const canDoubleThis = showControls && sh.cards.length === 2;
            const canSplitThis = showControls && subhands.length === 1 && canSplitCards(sh.cards);
            const concealed = sh.doubled && cardsHidden;
            return (
              <div key={shIdx} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap min-h-[58px]">
                  {subhands.length === 2 && <span className="text-[10px] text-dim uppercase">Hand {shIdx + 1}</span>}
                  {sh.doubled && <span className="text-[11px] text-goldbright font-bold">{"\u00d7"}2</span>}
                  {sh.cards.map((c, idx) => {
                    const hidden = sh.doubled && idx === sh.cards.length - 1 && cardsHidden;
                    return (
                      <div key={idx} className="card-face">
                        {hidden ? (
                          <div
                            className="w-full h-full rounded-md"
                            style={{
                              background: "repeating-linear-gradient(45deg,#3E8E7E,#3E8E7E 4px,#2f6e60 4px,#2f6e60 8px)",
                            }}
                          />
                        ) : (
                          <>
                            <span className={`font-display text-base ${c.color === "red" ? "text-red" : "text-ink"}`}>{c.rank}</span>
                            <span className={`text-base ${c.color === "red" ? "text-red" : "text-ink"}`}>{c.suit}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="ml-auto">
                    {concealed ? (
                      <span className="font-display text-2xl text-dim">?</span>
                    ) : sh.busted ? (
                      <span className="text-xs font-bold px-2 py-1 rounded-md bg-[#B33B3B33] text-[#E58A82]">BUST ({val.total})</span>
                    ) : isNaturalBlackjack(sh.cards) ? (
                      <span className="text-xs font-bold px-2 py-1 rounded-md bg-gold/20 text-goldbright">BLACKJACK!</span>
                    ) : (
                      <span className="font-display text-2xl">{val.total}</span>
                    )}
                  </div>
                </div>
                {showControls && (
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn-hit" disabled={busy} onClick={() => onAct({ type: "CHOOSE", subIndex: shIdx, choice: "hit" })}>
                      HIT
                    </button>
                    <button className="btn-stand" disabled={busy} onClick={() => onAct({ type: "CHOOSE", subIndex: shIdx, choice: "stand" })}>
                      STAND
                    </button>
                    {canDoubleThis && (
                      <button className="btn-double" disabled={busy} onClick={() => onAct({ type: "CHOOSE", subIndex: shIdx, choice: "double" })}>
                        DOUBLE
                      </button>
                    )}
                    {canSplitThis && (
                      <button className="btn-split" disabled={busy} onClick={() => onAct({ type: "CHOOSE", subIndex: shIdx, choice: "split" })}>
                        SPLIT
                      </button>
                    )}
                  </div>
                )}
                {isMe && state.phase === "action" && active && chosen && (
                  <div className="text-xs text-dim italic">{"\u2713"} Gekozen, wachten&hellip;</div>
                )}
              </div>
            );
          })}
          {isMe && state.phase === "action" && playerDone && <div className="text-xs text-dim italic">Klaar</div>}
        </div>
      ) : (
        <div className="min-h-[58px] flex items-center justify-center text-dim text-sm">Wacht op inzet&hellip;</div>
      )}

      {needsBet && (
        <div className="flex flex-col items-center gap-2 mt-2">
          {p.chips > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-center">
              {Array.from({ length: p.chips }).map((_, idx) => (
                <button
                  key={idx}
                  title={`Zet in: deze chip ben je hoe dan ook kwijt, maar je doet ${p.wagerMultiplier}x schade als je deze hand wint.`}
                  className="w-9 h-9 rounded-full bg-gradient-to-b from-goldbright to-gold text-[#241804] text-lg"
                  disabled={busy}
                  onClick={() => onAct({ type: "BET", amount: 1 })}
                >
                  {"\u{1FA99}"}
                </button>
              ))}
            </div>
          )}
          <button className="text-dim text-xs underline" disabled={busy} onClick={() => onAct({ type: "BET", amount: 0 })}>
            Geen inzet
          </button>
        </div>
      )}
      {isMe && state.phase === "betting" && !needsBet && <div className="text-xs text-dim italic mt-1">{"\u2713"} Ingezet</div>}
    </div>
  );
}

