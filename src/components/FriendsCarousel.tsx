import { friends } from "@/content/friends";
import Carousel from "./Carousel";
import FriendCard from "./FriendCard";

export default function FriendsCarousel() {
  return (
    <Carousel prevLabel="Previous friends" nextLabel="Next friends" loop>
      {friends.map((f) => (
        <div
          key={f.name}
          className="w-[min(22rem,82vw)] shrink-0 snap-start select-none"
        >
          <FriendCard
            name={f.name}
            blurb={f.blurb}
            href={f.href}
            photo={f.photo}
            highlight={f.highlight}
          />
        </div>
      ))}
    </Carousel>
  );
}
