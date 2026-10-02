import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { RELICS } from "@/lib/game/relics";

export async function POST(request: Request) {
  const { user } = await requireUser();
  const { relicId } = await request.json();
  if (!RELICS.some(r=>r.id===relicId)) return NextResponse.json({error:"Onbekende Relic."},{status:400});
  const admin=createAdminClient();
  const {data,error}=await admin.rpc("equip_relic_atomic",{p_user:user.id,p_id:relicId});
  if(error) return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ok:true,equipped:data});
}
