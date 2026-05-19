import { profile } from "@/content/profile";

export default function Hero() {
  return (
    <section
      id="home"
      className="flex min-h-[100svh] snap-start flex-col items-center justify-center px-6 text-center"
    >
      <h1 className="ink text-5xl font-bold tracking-tight sm:text-7xl">
        <span className="hero-word inline-block" style={{ animationDelay: "0ms" }}>
          {profile.greeting}
        </span>{" "}
        <span
          className="hero-word accent ink-shadow inline-block"
          style={{ animationDelay: "180ms" }}
        >
          {profile.firstName}.
        </span>
      </h1>
      <p
        className="hero-word ink-2 ink-shadow mt-6 max-w-xl text-lg sm:text-xl"
        style={{ animationDelay: "360ms" }}
      >
        {profile.subtitle}
      </p>
      <span
        className="hero-word ink-3 mt-12 text-sm uppercase tracking-widest"
        style={{ animationDelay: "560ms" }}
      >
        Scroll ↓
      </span>
    </section>
  );
}
