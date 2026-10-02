import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MatchState } from "./reducer";
import { ACHIEVEMENTS, checkAchievements, glicko2Update } from "./engine";
import {
  CAMPAIGN_BOT_RATINGS,
  protectedBotRating,
} from "./botRating";

type Profile = Record<string, any>;
type MatchRow = {id:string; player_a:string;player_b:string|null;mode:string;bot_index:number|null;bot_rating:number|null;state:MatchState;finalized:boolean};
const STREAK_REWARDS:Record<number,number>={2:2,3:4,5:8,10:15};
function stats(base:any, ms:MatchState["matchStats"][number],won:boolean){return {
 blackjacks:(base?.blackjacks||0)+ms.blackjacks,
 busts:(base?.busts||0)+ms.busts,
 doubles:(base?.doubles||0)+ms.doubles,
 splits:(base?.splits||0)+ms.splits,
 kos:(base?.kos||0)+(won?1:0),
 comebackWins:(base?.comebackWins||0)+(won&&ms.usedComeback?1:0),
 ironWillSaves:(base?.ironWillSaves||0)+ms.ironWillSaves
};}
function achievementInput(p:Profile){return {
 wins:p.wins||0,bestStreak:p.best_streak||0,matches_played:p.matches_played||0,
 rating:p.rating||1500,campaign_pos:p.campaign_pos||0,campaign_wins:p.campaign_wins||0,
 perks:[...new Set([...(p.perks||[]),...Object.keys(p.relic_levels||{}).filter(k=>Number(p.relic_levels[k])>0)])],
 tokens_earned_total:p.tokens_earned_total||0,achievements:p.achievements||[],stats:p.stats
};}
function createUpdate(p:Profile,mode:string,index:0|1,m:MatchRow):{update:Profile; event:Profile; display:Profile; newAchievements:string[]}{
 const state=m.state;
 const won=state.winnerIndex===index, lost=state.winnerIndex===1-index;
 const updated:Profile={...p};
 updated.matches_played=(p.matches_played||0)+1;
 updated.stats=stats(p.stats,state.matchStats[index],won);
 let award=0;
 let rating={rating:Number(p.rating),rd:Number(p.rd),vol:Number(p.vol)};
 if(mode==='pvp'){
   const prev=Number(p.streak||0);
   updated.streak=won?prev+1:lost?0:prev;
   updated.best_streak=Math.max(Number(p.best_streak||0),updated.streak);
   if(won){updated.wins=(p.wins||0)+1;award+=4+state.players[index].bjWins+ (STREAK_REWARDS[updated.streak]||0);}
   else {if(lost)updated.losses=(p.losses||0)+1;award+=2+state.players[index].bjWins;}
 } else if(mode==='campaign'){
   if(won){
     award=(m.bot_index??0)+1;
     updated.campaign_wins=(p.campaign_wins||0)+1;
     updated.campaign_pos=Math.min(9,(m.bot_index??0)+1);
     updated.campaign_defeated=[...new Set([...(p.campaign_defeated||[]),m.bot_index??0])].sort((a,b)=>a-b);
   } else if(lost) updated.campaign_pos=Math.max(0,(m.bot_index??0)-1);
 } else if(mode==='random'){
   award=won?3+Math.max(0,Math.min(6,Math.round(((m.bot_rating||1500)-p.rating+250)/150))):1;
   award+=state.players[index].bjWins;
 }
 if(mode!=='pvp'){
   const score=state.winnerIndex===-1?0.5:won?1:0;
   const oppRating=Number(m.bot_rating??CAMPAIGN_BOT_RATINGS[m.bot_index??0]??1500);
   
const previousRating = {
  rating: Number(p.rating),
  rd: Number(p.rd),
  vol: Number(p.vol),
};

const calculatedRating = glicko2Update(
  previousRating.rating,
  previousRating.rd,
  previousRating.vol,
  oppRating,
  mode === "campaign" ? 85 : 110,
  score
);

rating = protectedBotRating(
  previousRating,
  calculatedRating,
  oppRating
);

 } else {
   // Opponent is assigned by finalizeMatch after both profiles are read.
 }
 if(mode!=='pvp'){
  if(mode==='campaign'&&won){
   // Diminishing rewards for farming the same campaign bot.
   // `campaign_defeated` captures first clear but repeated clears still award less rating.
   const hadBeat=(p.campaign_defeated||[]).includes(m.bot_index??0);
   if(hadBeat) rating.rating=Math.round(Number(p.rating)+(rating.rating-Number(p.rating))*0.35);
  }
  updated.rating=rating.rating;updated.rd=rating.rd;updated.vol=rating.vol;
 }
 updated.tokens_earned_total=Number(p.tokens_earned_total||0)+award;
 const ach=checkAchievements(achievementInput(updated));
 updated.achievements=[...new Set([...(p.achievements||[]),...ach])];
 const event={user_id:p.id,won,blackjacks:state.matchStats[index].blackjacks,
  doubles:state.matchStats[index].doubles,splits:state.matchStats[index].splits,busts:state.matchStats[index].busts,
  class_id:state.players[index].classId,low_hp_win:won&&state.players[index].hp>0&&state.players[index].hp<=state.players[index].maxHp*0.2};
 const display={tokens:award, rating:0,streakBonus:mode==='pvp'&&won?STREAK_REWARDS[updated.streak]||0:0,bounty:0,achievements:ach};
 updated.token_award=award;
 updated.version=p.reward_version||0;
 return {update:updated,event,display,newAchievements:ach};
}

/** Safe to retry. SQL locks the match row and updates rewards, ratings and event log atomically. */
export async function finalizeMatch(matchId:string){
 const admin=createAdminClient();
 for(let attempt=0;attempt<4;attempt++){
  const {data:match,error:matchError}=await admin.from('matches')
    .select('id,player_a,player_b,mode,bot_index,bot_rating,state,finalized')
    .eq('id',matchId).single();
  if(matchError||!match) throw new Error(matchError?.message||'Match missing');
  const m=match as MatchRow;
  if(m.finalized)return;
  if(!m.state.matchOver)return;
  const ids=m.mode==='pvp'?[m.player_a,m.player_b!]:[m.player_a];
  const {data:profiles,error:profilesError}=await admin.from('profiles').select('*').in('id',ids);
  if(profilesError||!profiles||profiles.length!==ids.length)throw new Error(profilesError?.message||'Profiles missing');
  const a=profiles.find((p:Profile)=>p.id===m.player_a)!;
  const b=m.player_b?profiles.find((p:Profile)=>p.id===m.player_b):null;
  const first=createUpdate(a,m.mode,0,m);
  const second=b?createUpdate(b,m.mode,1,m):null;
  if(b&&second){
   const scoreA=m.state.winnerIndex===-1?0.5:m.state.winnerIndex===0?1:0;
   const ar=glicko2Update(a.rating,a.rd,a.vol,b.rating,b.rd,scoreA);
   const br=glicko2Update(b.rating,b.rd,b.vol,a.rating,a.rd,1-scoreA);
   Object.assign(first.update,ar);Object.assign(second.update,br);
   first.display.rating=ar.rating-a.rating;second.display.rating=br.rating-b.rating;
   // Achievements based on updated PVP ratings, e.g. High Roller.
   for(const c of [first,second]){
     const newAch=checkAchievements(achievementInput(c.update));
     c.newAchievements=[...new Set([...c.newAchievements,...newAch])];
     c.update.achievements=[...new Set([...c.update.achievements,...newAch])];
     c.display.achievements=c.newAchievements;
   }
  } else first.display.rating=first.update.rating-a.rating;
  // SQL validates opponent's *current* streak and grants bounty once per pair/week.
  if(b&&m.state.winnerIndex===0&&b.streak>=5)first.update.bounty_target=b.id;
  if(b&&second&&m.state.winnerIndex===1&&a.streak>=5)second.update.bounty_target=a.id;
  const contributions=[first,...(second?[second]:[])];
  const updates=contributions.map(c=>({
   id:c.update.id,version:c.update.version,token_award:c.update.token_award,bounty_target:c.update.bounty_target||null,
   rating:c.update.rating,rd:c.update.rd,vol:c.update.vol,
   wins:c.update.wins,losses:c.update.losses,streak:c.update.streak,best_streak:c.update.best_streak,
   matches_played:c.update.matches_played,campaign_pos:c.update.campaign_pos,campaign_wins:c.update.campaign_wins,
   campaign_defeated:c.update.campaign_defeated||[],stats:c.update.stats,achievements:c.update.achievements
  }));
  const rewards={a:first.display,...(second?{b:second.display}:{})};
  const {data:result,error}=await admin.rpc('complete_match_v3',{
   p_id:matchId,p_updates:updates,p_events:contributions.map(c=>c.event),p_rewards:rewards
  });
  if(!error){
    if(!result?.already){
      const notices=contributions.flatMap((c,index)=>[
        {user_id:c.update.id,type:'match_result',payload:{won:c.event.won,
         opponent:index===0?m.state.players[1].name:m.state.players[0].name}},
        ...c.newAchievements.map(id=>({user_id:c.update.id,type:'achievement',payload:{name:ACHIEVEMENTS.find(x=>x.id===id)?.name||id}}))
      ]);
      // Informational only; financial operations already committed atomically.
      await admin.from('notifications').insert(notices);
    }
    return;
  }
  if(error.message.includes('STALE_PROFILE'))continue;
  if(error.message.includes('deadlock detected')||error.message.includes('could not serialize'))continue;
  throw new Error(`finalizeMatch: ${error.message}`);
 }
 throw new Error('finalizeMatch: profiles changed too often, please retry');
}
