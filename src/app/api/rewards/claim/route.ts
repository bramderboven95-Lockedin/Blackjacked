import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request:Request){
 const {user}=await requireUser();
 let body:{kind?:string;id?:string};
 try{body=await request.json();}catch{return NextResponse.json({error:'Ongeldige input'},{status:400});}
 if(!['daily','weekly','achievement','milestone'].includes(body.kind||'')||typeof body.id!=='string'||body.id.length>80)
   return NextResponse.json({error:'Ongeldige beloning'},{status:400});
 const admin=createAdminClient();const {data,error}=await admin.rpc('claim_reward_v3',{
  p_user:user.id,p_kind:body.kind,p_id:body.id
 });
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({ok:true,...data});
}
