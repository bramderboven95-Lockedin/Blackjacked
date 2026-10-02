"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
type Entry={id:string;name?:string;title?:string;desc?:string;description?:string;icon?:string;period?:string;goal?:number;progress?:number;reward:number;unlocked?:boolean;claimed:boolean};
type Board={tokens:number;day:string;week:string;dailyBonusClaimed:boolean;missions:Entry[];achievements:Entry[];milestones:Entry[];streak:number};
export default function RewardsPage(){
 const [board,setBoard]=useState<Board|null>(null);const [busy,setBusy]=useState('');const [error,setError]=useState('');
 const load=useCallback(async()=>{const response=await fetch('/api/rewards',{cache:'no-store'});
 const j=await response.json();if(!response.ok)throw new Error(j.error||'Ophalen mislukt');setBoard(j);},[]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 async function claim(kind:string,id:string){if(busy)return;setBusy(`${kind}:${id}`);setError('');
 try{const response=await fetch('/api/rewards/claim',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({kind,id})});const j=await response.json();if(!response.ok)throw new Error(j.error||'Claim mislukt');await load();}
 catch(e){setError(e instanceof Error?e.message:'Claim mislukt');await load().catch(()=>{});}finally{setBusy('');}}
 function panel(item:Entry,kind:string){const ready=kind==='daily'||kind==='weekly'?Number(item.progress)>=Number(item.goal):!!item.unlocked;
 return <div key={`${kind}:${item.id}`} className="bg-bgalt border border-line rounded-lg p-3 flex flex-col gap-2">
  <div className="flex justify-between gap-2"><b className="text-sm">{item.icon||'🎯'} {item.title||item.name}</b><b className="text-goldbright whitespace-nowrap">+{item.reward} 🪙</b></div>
  <p className="text-xs text-dim">{item.description||item.desc}</p>
  {item.goal!=null&&<><div className="bg-[#23342a] h-1.5 rounded-full overflow-hidden"><div className="bg-gold h-full rounded-full" style={{width:`${Math.min(100,100*Number(item.progress||0)/item.goal)}%`}}/></div>
   <span className="text-xs text-dim">{Math.min(Number(item.progress||0),item.goal)}/{item.goal}</span></>}
  {item.claimed?<span className="text-teal text-xs font-bold">✓ OPGEHAALD</span>:
   <button className="btn-primary !py-2 !text-xs" disabled={!ready||!!busy} onClick={()=>claim(kind,item.id)}>{busy===`${kind}:${item.id}`?'BEZIG...':ready?'CLAIM REWARD':'NOG VERGRENDELD'}</button>}
 </div>}
 if(!board)return <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto"><p className="text-dim">{error||'Beloningen laden...'}</p><TabBar/></main>;
 return <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">
  <Link href="/dashboard" className="text-dim text-xs">← Hoofdmenu</Link>
  <div className="flex justify-between items-center"><h1 className="font-display text-2xl text-goldbright">🎯 REWARDS</h1><b className="text-goldbright">🪙 {board.tokens}</b></div>
  {error&&<p role="alert" className="text-red text-xs">{error}</p>}
  <section className="panel flex flex-col gap-3"><h2 className="font-display text-lg text-gold">Daily Missions</h2>
   <p className="text-dim text-xs">Reset om middernacht (België). Verzamel alle drie de beloningen voor automatisch +5 bonus.</p>
   {board.missions.filter(m=>m.period==='daily').map(x=>panel(x,'daily'))}
   <p className="text-xs text-teal">3/3 bonus: {board.dailyBonusClaimed?'✓ +5 tokens ontvangen':'+5 tokens bij de laatste claim'}</p>
  </section>
  <section className="panel flex flex-col gap-3"><h2 className="font-display text-lg text-gold">Weekly Challenges</h2>
   <p className="text-dim text-xs">Reset iedere maandag om 00:00 (België).</p>
   {board.missions.filter(m=>m.period==='weekly').map(x=>panel(x,'weekly'))}
  </section>
  <section className="panel flex flex-col gap-3"><h2 className="font-display text-lg text-gold">Campaign Milestones</h2>
   {board.milestones.map(x=>panel(x,'milestone'))}</section>
  <section className="panel flex flex-col gap-3"><h2 className="font-display text-lg text-gold">Achievements 2.0</h2>
   <p className="text-dim text-xs">Ook eerder vrijgespeelde achievements kunnen eenmaal geclaimd worden.</p>
   {board.achievements.map(x=>panel(x,'achievement'))}</section>
  <section className="panel flex flex-col gap-2"><h2 className="font-display text-lg text-gold">🔥 PvP Streaks & Bounties</h2>
   <p className="text-sm">Huidige PvP-streak: <b>{board.streak}</b></p>
   <p className="text-dim text-xs">2 overwinningen: +2 · 3: +4 · 5: +8 · 10: +15. Versla een tegenstander met minstens 5 opeenvolgende PvP-overwinningen: +10 bounty (eenmaal per tegenstander per week). Deze extra tokens worden automatisch betaald bij de uitslag.</p>
  </section><TabBar/>
 </main>;
}
