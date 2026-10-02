import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchReducer, MatchState } from "@/lib/game/reducer";
import { BotDefinition } from "@/lib/game/engine";
import { validRelics } from "@/lib/game/relics";
import { randomBotRating } from "@/lib/game/botRating";

const PREFIXES = ["Wild", "Crooked", "Midnight", "Savage", "Iron", "Lucky", "Mad", "Shadow"];
const NAMES = ["Jack", "Ace", "Joker", "Queen", "Dealer", "Shark", "Spectre", "King"];
function makeBot(): BotDefinition {
  // Non-fixed budget, with occasional extremes (45 ATK/1 DEF is possible).
  const atk = randomInt(1,46);
  const def = randomInt(1,46);
  const hp = randomInt(65,146);
  const power = atk+def+Math.round((hp-90)/6);
  const ai = power<25 ? "naive" : power<45 ? "basic" : power<70 ? "smart" : "optimal";
  return {name:`${PREFIXES[randomInt(PREFIXES.length)]} ${NAMES[randomInt(NAMES.length)]}`,
    hp,atk,def,chips: randomInt(1,6),ai};
}
async function active(userId:string){
 const admin=createAdminClient();
 const {data,error}=await admin.from("matches").select("id,state,bot_rating")
 .eq("player_a",userId).eq("mode","random").eq("finalized",false)
 .order("created_at",{ascending:false}).limit(20);
 if(error) throw error;
 return (data||[]).find((m:{state:MatchState})=>!(m.state as MatchState).matchOver)||null;
}
export async function GET(){
 const {user}=await requireUser();
 try {const m=await active(user.id);return NextResponse.json({matchId:m?.id||null,bot:m?(m.state as MatchState).botDetails:null,rating:m?.bot_rating||null});}
 catch{return NextResponse.json({error:"Kan Random Challenger niet laden"},{status:500});}
}
export async function POST(){
 const {user}=await requireUser();const admin=createAdminClient();
 try{const m=await active(user.id);if(m)return NextResponse.json({matchId:m.id,resumed:true});}
 catch{return NextResponse.json({error:"Kan actieve match niet controleren"},{status:500});}
 const {data:p,error}=await admin.from("profiles")
 .select("username,preferred_class,relic_levels,equipped_relics").eq("id",user.id).single();
 if(error||!p)return NextResponse.json({error:"Profiel niet gevonden"},{status:500});
 const bot=makeBot(),rating=randomBotRating(bot);
 const state=matchReducer(null,{type:"INIT",nameA:p.username,classA:p.preferred_class||"dealer",perksA:[],
 relicLevelsA:p.relic_levels||{},equippedRelicsA:validRelics(p.relic_levels||{},p.equipped_relics||[]),
 isCampaign:true,botIndex:0,botOverride:bot,matchMode:"random"});
 const {data:created,error:createError}=await admin.rpc('create_bot_match_v3',{
  p_user:user.id,p_mode:'random',p_bot_index:null,p_bot_rating:rating,p_state:state
 });
 if(createError||!created)return NextResponse.json({error:createError?.message||'Kon de uitdager niet starten.'},{status:500});
 return NextResponse.json(created);
}
