"use client";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import type { BotDefinition } from "@/lib/game/engine";
export default function ChallengerPage(){
 const router=useRouter();const [bot,setBot]=useState<BotDefinition|null>(null);
 const [rating,setRating]=useState<number|null>(null);
 const [active,setActive]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/matches/random",{cache:"no-store"}).then(r=>r.json()).then(j=>{
 setActive(j.matchId||null);setBot(j.bot||null);setRating(j.rating||null);
 if(j.error)setError(j.error);
 }).catch(()=>setError("Kon je uitdager niet laden."));},[]);
 async function start(){setBusy(true);setError("");try{const response=await fetch("/api/matches/random",{method:"POST"});
 const j=await response.json();if(!response.ok||!j.matchId)throw new Error(j.error||"Kon geen match starten");
 router.push(`/match/${j.matchId}`);
 }catch(e){setError(e instanceof Error?e.message:"Onbekende fout");setBusy(false);}}
 return <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">
  <Link href="/dashboard" className="text-dim text-xs">← Hoofdmenu</Link>
  <h1 className="font-display text-2xl text-goldbright">🎲 RANDOM CHALLENGER</h1>
  <p className="text-dim text-sm">Een nieuwe server-gegenereerde bot met willekeurige ATK, DEF en HP. De uitslag telt mee voor je rating, missies en tokens. Geen gratis reroll: je actieve tegenstander blijft bewaard.</p>
  <div className="panel flex flex-col gap-3">
   {active&&bot?<><h2 className="font-display text-xl text-gold">{bot.name}</h2>
    <div className="grid grid-cols-3 gap-2 text-center">
     <div className="bg-bgalt rounded p-3">ATK <b className="block text-xl">{bot.atk}</b></div>
     <div className="bg-bgalt rounded p-3">DEF <b className="block text-xl">{bot.def}</b></div>
     <div className="bg-bgalt rounded p-3">HP <b className="block text-xl">{bot.hp}</b></div>
    </div><p className="text-dim text-sm">Glicko-rating: {rating}</p></>:
    <p className="text-dim text-sm">De bot wordt pas onthuld wanneer de wedstrijd start. ATK/DEF: 1–45, HP: 65–145.</p>}
   <button className="btn-primary" disabled={busy} onClick={start}>{busy?"BEZIG...":active?"HERVAT RANDOM CHALLENGER":"TREK EEN RANDOM CHALLENGER"}</button>
   {error&&<p role="alert" className="text-red text-xs">{error}</p>}
  </div><TabBar/>
 </main>;
}
