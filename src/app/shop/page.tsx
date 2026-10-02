"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TabBar from "@/components/TabBar";
import { CLASS_DEFS } from "@/lib/game/engine";
import { RELICS, RelicLevels, validRelics } from "@/lib/game/relics";

type Profile = {
  id:string; tokens:number; preferred_class:string;
  relic_levels:RelicLevels; equipped_relics:string[];
};
export default function ShopPage(){
  const supabase=createClient();
  const [profile,setProfile]=useState<Profile|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) return;
    const {data,error}=await supabase.from("profiles")
      .select("id,tokens,preferred_class,relic_levels,equipped_relics")
      .eq("id",user.id).single();
    if(error) {setMessage("Shop laden mislukt. Voer eerst 0003_relics.sql uit.");return;}
    setProfile(data as Profile);
  },[supabase]);
  useEffect(()=>{load();},[load]);
  async function perform(url:string,relicId:string){
    if(busy) return;
    setBusy(true);setMessage("");
    try {
      const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({relicId})});
      const json=await res.json();
      if(!res.ok) setMessage(json.error||"Actie mislukt.");
      await load();
    }catch{setMessage("Verbindingsprobleem. Probeer opnieuw.");}
    finally{setBusy(false);}
  }
  async function setClass(classId:string){
    if(!profile||busy)return;
    setBusy(true);setMessage("");
    const {error}=await supabase.from("profiles").update({preferred_class:classId}).eq("id",profile.id);
    if(error)setMessage(error.message);
    await load();setBusy(false);
  }
  if(!profile) return <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto"><p className="text-dim">{message||"Black Market laden..."}</p><TabBar/></main>;
  const equipped=validRelics(profile.relic_levels||{},profile.equipped_relics||[]);
  return <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">
    <div className="flex justify-between items-center">
      <h1 className="font-display text-2xl text-goldbright">BLACK MARKET</h1>
      <span className="text-goldbright font-bold">🪙 {profile.tokens} tokens</span>
    </div>
    <p className="text-dim text-xs">Tokens zijn je permanente shopvaluta. Chips tijdens een match blijven een apart inzetsysteem. Je behoudt al je eerder verdiende tokens.</p>
    <div className="panel flex flex-col gap-3">
      <h2 className="font-display text-lg text-gold">Jouw build</h2>
      <p className="text-dim text-xs">Class + maximaal 3 verschillende Relics. Je kunt Relics gratis wisselen tussen matches; een begonnen match bewaart de gekozen build.</p>
      <div className="flex gap-2">
        {Object.values(CLASS_DEFS).map(c=><button key={c.id} disabled={busy} onClick={()=>setClass(c.id)}
          className={`flex-1 text-left bg-bgalt border rounded-lg p-2 ${profile.preferred_class===c.id?"border-gold":"border-line"}`}>
          <div className="font-display text-sm">{c.label}</div><div className="text-[10px] text-dim">{c.shortHint}</div>
        </button>)}
      </div>
      <p className="text-xs text-dim">{CLASS_DEFS[profile.preferred_class]?.passive}</p>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({length:3},(_,i)=>{
          const id=equipped[i];const r=RELICS.find(x=>x.id===id);
          return <div key={i} className="border border-line rounded-lg p-2 bg-bgalt text-center min-h-[92px]">
            {r?<><div className="text-xl">{r.icon}</div><div className="text-xs font-bold">{r.name}</div><div className="text-[10px] text-goldbright">Lv. {profile.relic_levels[id as keyof RelicLevels]}</div>
              <button className="text-[10px] text-dim underline mt-1" disabled={busy} onClick={()=>perform("/api/shop/equip",id)}>Unequip</button></>:
              <div className="text-dim text-xs pt-6">+ Empty slot</div>}
          </div>;
        })}
      </div>
    </div>
    {message&&<p role="alert" className="text-red text-xs">{message}</p>}
    <div className="panel flex flex-col gap-3">
      <h2 className="font-display text-lg text-gold">Relic Upgrades</h2>
      {RELICS.map(r=>{
        const level=Number(profile.relic_levels?.[r.id]||0);
        const max=level>=r.values.length;
        const active=equipped.includes(r.id);
        const cost=max?0:r.costs[level];
        return <div key={r.id} className="bg-bgalt rounded-lg p-3 border border-line flex flex-col gap-2">
          <div className="flex justify-between gap-2 items-center">
            <div className="flex gap-2 items-center">
              <span className="text-2xl">{r.icon}</span>
              <div><div className="font-bold text-sm">{r.name}</div><div className="text-dim text-xs">{r.hint}</div></div>
            </div>
            <span className="text-goldbright text-xs font-bold whitespace-nowrap">Lv. {level}/{r.values.length}</span>
          </div>
          <div className="flex gap-1">{r.values.map((_,i)=><div key={i} className={`h-1.5 rounded flex-1 ${i<level?"bg-gold":"bg-line"}`}/>)}</div>
          <div className="text-sm">{level>0?<><b>+{r.values[level-1]} {r.stat}</b>{!max&&<span className="text-dim"> → +{r.values[level]} {r.stat}</span>}</>:<span className="text-dim">Nog niet in bezit · eerste bonus: +{r.values[0]} {r.stat}</span>}</div>
          <div className="flex gap-2">
            {!max?<button disabled={busy||profile.tokens<cost} onClick={()=>perform("/api/shop/buy",r.id)}
              className="btn-primary !py-1.5 !px-3 !text-xs flex-1">{level===0?"KOOP":"UPGRADE"} · {cost} 🪙</button>:
              <span className="text-teal text-xs font-bold flex-1">MAX LEVEL ✓</span>}
            {level>0&&<button disabled={busy||(!active&&equipped.length>=3)}
              onClick={()=>perform("/api/shop/equip",r.id)}
              className={`btn-ghost !py-1.5 !px-3 !text-xs ${active?"!border-gold !text-goldbright":""}`}>
              {active?"UNEQUIP":"EQUIP"}
            </button>}
          </div>
          {level>0&&!active&&equipped.length>=3&&<p className="text-dim text-[10px]">Maak eerst een van je drie slots vrij.</p>}
        </div>;
      })}
    </div>
    <TabBar/>
  </main>;
}
