import { requireUser } from "@/lib/profile";
import GameBoard from "@/components/GameBoard";

export default async function MatchPage({ params }: { params: { id: string } }) {
  const { user } = await requireUser();
  return <GameBoard matchId={params.id} userId={user.id} />;
}
