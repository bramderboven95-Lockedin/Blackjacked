import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchReducer, MatchState } from "@/lib/game/reducer";
import { BOTS } from "@/lib/game/engine";
import { validRelics } from "@/lib/game/relics";

async function findActive(userId:string) {
  const admin=createAdminClient();
  const {data,error}=await admin.from("matches")
    .select("id,state,bot_index").eq("player_a",userId)
    .eq("is_campaign",true).eq("finalized",false)
    .order("created_at",{ascending:false}).limit(30);
  if(error) throw error;
  return (data||[]).find(m=>!(m.state as MatchState).matchOver) || null;
}
export async function GET(){
  const {user}=await requireUser();
  try {
    const active=await findActive(user.id);
    return NextResponse.json({activeMatchId:active?.id??null,botIndex:active?.bot_index??null});
  } catch {return NextResponse.json({error:"Kon Campaign niet ophalen."},{status:500});}
}
export async function POST() {
  const {user}=await requireUser();
  const admin=createAdminClient();
  try {
    const active=await findActive(user.id);
    if(active) return NextResponse.json({matchId:active.id,resumed:true});
  } catch {return NextResponse.json({error:"Kon actieve Campaign niet controleren."},{status:500});}
  const {data:profile,error}=await admin.from("profiles")
    .select("username,campaign_pos,preferred_class,relic_levels,equipped_relics")
    .eq("id",user.id).single();
  if(error||!profile) return NextResponse.json({error:"Profiel niet gevonden of SQL-migratie ontbreekt."},{status:500});
  const botIndex=Math.min(Math.max(0,profile.campaign_pos||0),BOTS.length-1);
  const initState=matchReducer(null,{
    type:"INIT",nameA:profile.username,classA:profile.preferred_class||"dealer",
    perksA:[],relicLevelsA:profile.relic_levels||{},
    equippedRelicsA:validRelics(profile.relic_levels||{},profile.equipped_relics||[]),
    isCampaign:true,botIndex
  });
  const {data:match,error:insertError}=await admin.from("matches").insert({
    player_a:user.id,player_b:null,is_campaign:true,bot_index:botIndex,state:initState
  }).select("id").single();
  if(insertError||!match) return NextResponse.json({error:insertError?.message||"Kon match niet starten."},{status:500});
  return NextResponse.json({matchId:match.id,resumed:false});
}
