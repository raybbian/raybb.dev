import { profile } from "@/content/profile";

export default function Hero() {
  return (
    <section
      id="home"
      className="flex min-h-[100svh] snap-start flex-col items-center justify-center px-6 text-center"
    >
      <h1 className="text-5xl font-bold tracking-tight text-white [filter:drop-shadow(0_3px_14px_rgba(0,0,0,0.5))] sm:text-7xl">
        <span className="hero-word inline-block" style={{ animationDelay: "0ms" }}>
          {profile.greeting}
        </span>{" "}
        <span
          className="hero-word inline-block bg-gradient-to-br from-emerald-200 to-teal-300 bg-clip-text text-transparent"
          style={{ animationDelay: "180ms" }}
        >
          {profile.firstName}.
        </span>
      </h1>
      <p
        className="hero-word mt-6 max-w-xl text-lg text-white/75 [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-xl"
        style={{ animationDelay: "360ms" }}
      >
        {profile.subtitle}
      </p>
      <span
        className="hero-word mt-12 text-sm uppercase tracking-widest text-white/40"
        style={{ animationDelay: "560ms" }}
      >
        Scroll ↓
      </span>
    </section>
  );
}
