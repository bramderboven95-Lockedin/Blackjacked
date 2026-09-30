import { getRank } from "@/lib/game/engine";

export default function RankBadge({ rating, small }: { rating: number; small?: boolean }) {
  const rank = getRank(rating);
  return (
    <span
      className={`rank-badge ${small ? "!text-[10px] !py-0" : ""}`}
      style={{ borderColor: rank.color, color: rank.color }}
    >
      {rank.name}
    </span>
  );
}
