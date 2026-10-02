import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACHIEVEMENTS } from "@/lib/game/engine";

type MissionDef={id:string;period:"daily"|"weekly";title:string;description:string;metric:string;goal:number;reward:number};
type Event={event_day:string;event_week:string;mode:string;won:boolean;blackjacks:number;doubles:number;splits:number;busts:number};
function progress(events:Event[],metric:string):number {
 return events.reduce((n,e)=>n+(metric==='played'?1:
 metric==='wins'?Number(e.won):metric==='blackjacks'?e.blackjacks:
 metric==='doubles'?e.doubles:metric==='splits'?e.splits:metric==='busts'?e.busts:
 metric==='pvp_wins'?Number(e.won&&e.mode==='pvp'):
 metric==='random_played'?Number(e.mode==='random'):
 metric==='campaign_wins'?Number(e.won&&e.mode==='campaign'):0),0);
}
const MILESTONES=[{id:'first',name:'First Blood',desc:'Versla Campaign-bot 1',index:0,reward:10},
 {id:'halfway',name:'Halfway There',desc:'Versla Campaign-bot 5',index:4,reward:20},
 {id:'house',name:'Beat The House',desc:'Versla Campaign-bot 10',index:9,reward:50}];
const ACHIEVEMENT_REWARDS:Record<string,number>={
 first_blood:5,natural:5,hat_trick:8,on_fire:15,veteran:20,card_counter:12,
 daredevil:15,splitter:15,bust_club:10,comeback_king:10,unbreakable:15,
 high_roller:15,legend:30,climber:20,house_wins:50,collector:15,loaded:15};
export async function GET(){
 const {user}=await requireUser();const admin=createAdminClient();
 try {
  const {error:ensureError}=await admin.rpc('ensure_missions_v3',{p_user:user.id});
  if(ensureError)throw ensureError;
  const {data:periods,error:dateError}=await admin.rpc('reward_periods_v3');
  if(dateError||!periods)throw dateError||new Error('Missing periods');
  const day=String(periods.day),week=String(periods.week);
  const [{data:assignments,error:aerr},{data:definitions,error:derr},{data:events,error:eerr},
   {data:profile,error:perr}]=await Promise.all([
   admin.from('mission_assignments').select('period,period_start,mission_id').eq('user_id',user.id).in('period_start',[day,week]),
   admin.from('mission_defs').select('*'),
   admin.from('match_events').select('event_day,event_week,mode,won,blackjacks,doubles,splits,busts').eq('user_id',user.id).gte('event_day',week).lte('event_day',day),
   admin.from('profiles').select('tokens,achievements,campaign_defeated,streak').eq('id',user.id).single()
  ]);
  const error=aerr||derr||eerr||perr;
  if(error||!profile)throw error||new Error('Missing profile');
  const currentAssignments=(assignments||[]).filter((a:{period:string;period_start:string;mission_id:string})=>a.period_start===(a.period==='daily'?day:week));
  const keys=[...currentAssignments.map((a:{period:string;period_start:string;mission_id:string})=>`mission:${a.period}:${a.period_start}:${a.mission_id}`),
    ...ACHIEVEMENTS.map(a=>`achievement:${a.id}`),...MILESTONES.map(m=>`milestone:${m.id}`),`daily_bonus:${day}`];
  const {data:claims,error:cerr}=await admin.from('reward_claims').select('claim_key').eq('user_id',user.id).in('claim_key',keys);
  if(cerr)throw cerr;
  const claimed=new Set((claims||[]).map((x:{claim_key:string})=>x.claim_key));
  const defs=new Map<string,MissionDef>((definitions||[]).map((d:MissionDef):[string,MissionDef]=>[d.id,d]));
  const missions=currentAssignments.map((a:{period:string;period_start:string;mission_id:string})=>{
   const d=defs.get(a.mission_id) as MissionDef|undefined;if(!d)return null;
   const value=progress((events||[]).filter((e:Event)=>a.period==='daily'?e.event_day===day:e.event_week===week) as Event[],d.metric);
   const key=`mission:${d.period}:${a.period_start}:${d.id}`;
   return {...d,progress:value,claimed:claimed.has(key)};
  }).filter(Boolean).sort((a:any,b:any)=>a.id.localeCompare(b.id));
  return NextResponse.json({tokens:profile.tokens,day,week,missions,
   dailyBonusClaimed:claimed.has(`daily_bonus:${day}`),
   achievements:ACHIEVEMENTS.map(a=>({id:a.id,name:a.name,desc:a.desc,icon:a.icon,
    reward:ACHIEVEMENT_REWARDS[a.id]||0,unlocked:(profile.achievements||[]).includes(a.id),
    claimed:claimed.has(`achievement:${a.id}`)})),
   milestones:MILESTONES.map(m=>({...m,unlocked:(profile.campaign_defeated||[]).includes(m.index),claimed:claimed.has(`milestone:${m.id}`)})),
   streak:profile.streak||0});
 } catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Kon beloningen niet laden. Controleer migratie 0004.'},{status:500});}
}
