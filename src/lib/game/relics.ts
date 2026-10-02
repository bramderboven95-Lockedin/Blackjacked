export type RelicKey = "sharp_eye" | "thick_skin" | "steady_hand" | "bj_instinct" | "soft_landing" | "comeback_kid" | "beginners_luck" | "iron_will";
export type RelicLevels = Partial<Record<RelicKey, number>>;
export const RELICS: {id:RelicKey; name:string; icon:string; hint:string; values:number[]; costs:number[]; stat:string}[] = [
  {id:"sharp_eye",name:"Sharpened Ace",icon:"⚔️",hint:"Extra aanvalskracht",stat:"ATK",values:[1,3,5,8,10,15],costs:[5,12,25,45,75,120]},
  {id:"thick_skin",name:"Iron Heart",icon:"🛡️",hint:"Extra verdediging",stat:"DEF",values:[1,2,3,5,7,10],costs:[5,12,25,45,75,120]},
  {id:"steady_hand",name:"Last Breath",icon:"❤️",hint:"Meer maximum HP",stat:"HP",values:[3,5,8,12,18,25],costs:[5,12,25,45,75,120]},
  {id:"bj_instinct",name:"Lucky Bastard",icon:"🃏",hint:"Extra natuurlijke Blackjack-schade",stat:"BJ DMG",values:[1,2,3,4,5,7],costs:[15,20,30,50,80,125]},
  {id:"soft_landing",name:"Bust Insurance",icon:"☂️",hint:"Minder schade bij bust",stat:"BUST GUARD",values:[1,2,3,4,5,7],costs:[5,12,25,45,75,120]},
  {id:"comeback_kid",name:"Phoenix Blood",icon:"🔥",hint:"Comebackbonus begint vanaf deze HP",stat:"HP GRENS",values:[45,50,55,60,65,70],costs:[15,20,30,50,80,125]},
  {id:"beginners_luck",name:"Golden Chip",icon:"🪙",hint:"Extra startchips per ronde",stat:"CHIPS",values:[1,1,2,2,3,3],costs:[10,15,30,45,75,120]},
  {id:"iron_will",name:"Iron Will",icon:"💀",hint:"Overleef een dodelijke klap per ronde met 1 HP",stat:"SAVE",values:[1],costs:[65]},
];
export const RELIC_IDS = RELICS.map(r=>r.id);
export function validRelics(levels:RelicLevels, equipped:string[]):string[] {
  return [...new Set(equipped)].filter(id=>RELICS.some(r=>r.id===id) && Number(levels[id as RelicKey] || 0)>0).slice(0,3);
}
export function relicValue(id:string,level:number):number {
  const r=RELICS.find(r=>r.id===id);
  return r?.values[Math.max(0,Math.min(r.values.length-1,level-1))] || 0;
}
