export type Project = {
  name: string;
  description: string;
  tech: string[];
  // live demo / play / site
  link?: string;
  // source repository
  github?: string;
};

export const projects: Project[] = [
  {
    name: "Lightborne",
    description:
      "A pixel puzzle platformer built with Rust, Bevy, and LDTK. Play as Lyra, a young goddess retrieving the shattered pieces of the Divine Prism by shooting and bouncing light beams to navigate rooms.",
    tech: ["Rust", "Bevy", "WGSL", "wgpu"],
    link: "https://raybbian.github.io/Lightborne",
    github: "https://github.com/raybbian/Lightborne",
  },
  {
    name: "Hyprtasking",
    description:
      "A workspace management plugin for the Hyprland Wayland compositor. Written in C++ with OpenGL, it provides a seamless workspace overview to 200+ users and 180+ stars.",
    tech: ["C++", "OpenGL", "Hyprland"],
    github: "https://github.com/raybbian/hyprtasking",
  },
  {
    name: "iUtils",
    description:
      "A Windows kernel driver + WinUI 3 GUI that presents an Apple iDevice as a USB hub, exposing hidden interfaces — wired P2P ethernet and Valeria screenshare between Windows and iDevices.",
    tech: ["WDF", "WinUI 3", "C++"],
    github: "https://github.com/raybbian/iUtils",
  },
  {
    name: "Graphscii",
    description:
      "A Python library that embeds combinatorial graphs into ASCII-only diagrams using topology-shape-metrics, network flow, and linear programming. Great for diagrams in code comments and plaintext.",
    tech: ["Python", "NetworkX", "React"],
    link: "https://graphscii.raybb.dev/",
    github: "https://github.com/raybbian/graphscii",
  },
  {
    name: "Dungeon Deja Vu",
    description:
      "A precision platformer with a twist, made for Bevy Game Jam #5. Ascend the cyclic tower as Cy the slime to escape and reunite with friends. Placed #8 overall and #3 in game design.",
    tech: ["Rust", "Bevy", "WASM", "LDTK"],
    link: "https://dsfhdshdjtsb.itch.io/dungeon-deja-vu",
    github: "https://github.com/ambareesh1510/dungeon-deja-vu",
  },
  {
    name: "Daedalus",
    description:
      "My own esoteric programming language, built with Rust. Write and solve mazes that form instructions to control a stack machine. Develop puzzles with the React.js IDE.",
    tech: ["Rust", "React", "WebGL"],
    link: "https://daedalus-ide.vercel.app/",
  },
  {
    name: "Landing",
    description:
      "A full-stack todo-list app built with Prisma, Next.js, and Postgres. Features OAuth2 GitHub login and built-in Codeforces integration with a responsive frontend.",
    tech: ["Next.js", "Prisma", "Postgres"],
    link: "https://landing.raybb.dev/",
  },
  {
    name: "Algo Library",
    description:
      "A competitive programming algorithm and debugging library for Codeforces. A single-header C++ debugger that abuses generics and recursion to visualize deeply nested data structures.",
    tech: ["C++", "Templates"],
    github: "https://github.com/raybbian/comp-programming",
  },
];
