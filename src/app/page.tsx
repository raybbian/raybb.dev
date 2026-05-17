import FishBackground from "@/components/FishBackground";

export default function Home() {
  return (
    <>
      <FishBackground />
      <main className="flex flex-col">
        <section className="flex min-h-screen snap-start flex-col items-center justify-center px-6 text-center">
          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
            koi.raybb.dev
          </h1>
          <p className="mt-4 max-w-md text-lg text-white/70">
            A procedurally animated fish, rendered in WebGL. Move your cursor —
            then keep scrolling.
          </p>
        </section>

        <section className="flex min-h-screen snap-start flex-col items-center justify-center px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Procedural, not pre-baked
          </h2>
          <p className="mt-4 max-w-md text-lg text-white/70">
            Each koi is a spring-driven spine wrapped in a Catmull-Rom body. No
            sprites, no rigs — just math resolved every frame.
          </p>
        </section>

        <section className="flex min-h-screen snap-start flex-col items-center justify-center px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Water you can see through
          </h2>
          <p className="mt-4 max-w-md text-lg text-white/70">
            The scene is captured into a multisampled buffer, then refracted and
            rippled in a single composite pass over the pond.
          </p>
        </section>

        <section className="flex min-h-screen snap-start flex-col items-center justify-center px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            The pond follows you
          </h2>
          <p className="mt-4 max-w-md text-lg text-white/70">
            The water drifts at a fraction of the page speed — a slow parallax
            beneath the words.
          </p>
        </section>
      </main>
    </>
  );
}
