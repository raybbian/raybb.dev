export type Project = {
  name: string;
  description: string;
  tech: string[];
  link?: string;
  github?: string;
  // Cloudflare Stream video UID for the card cover
  video?: string;
};

export const projects: Project[] = [
  {
    name: "Lightborne",
    description:
      "A pixel puzzle platformer built with Rust, Bevy, and LDTK. Play as Lyra, a young goddess retrieving the shattered pieces of the Divine Prism by shooting and bouncing light beams to navigate rooms. Co-led with my now-partner, Vivian Gu!",
    tech: ["Rust", "Bevy", "WGSL", "wgpu"],
    link: "https://raybbian.github.io/Lightborne",
    github: "https://github.com/raybbian/Lightborne",
    video: "2d7511c5420685ac2eaeb147f3a5c223",
  },
  {
    name: "Hyprtasking",
    description:
      "A workspace management plugin for the Hyprland Wayland compositor. Written in C++ with OpenGL, it provides a seamless workspace overview to 200+ users and 180+ stars.",
    tech: ["C++", "OpenGL", "Hyprland"],
    github: "https://github.com/raybbian/hyprtasking",
    video: "d5a43176e04f7de34b771674e9bb3843",
  },
  {
    name: "iUtils",
    description:
      "A Windows kernel driver + WinUI 3 GUI that presents an Apple iDevice as a USB hub, exposing hidden interfaces — wired P2P ethernet and Valeria screenshare between Windows and iDevices.",
    tech: ["WDF", "WinUI 3", "C++"],
    github: "https://github.com/raybbian/iUtils",
    video: "f31003bfbcaa722046a9936397736324",
  },
  {
    name: "Graphscii",
    description:
      "A Python library that embeds combinatorial graphs into ASCII-only diagrams using topology-shape-metrics, network flow, and linear programming. Great for diagrams in code comments and plaintext.",
    tech: ["Python", "NetworkX", "React"],
    link: "https://graphscii.raybb.dev/",
    github: "https://github.com/raybbian/graphscii",
    video: "c354c4c6fea4c513fccd74b659fb8103",
  },
  {
    name: "Dungeon Deja Vu",
    description:
      "A precision platformer with a twist, made for Bevy Game Jam #5. Ascend the cyclic tower as Cy the slime to escape and reunite with friends. Placed #8 overall and #3 in game design.",
    tech: ["Rust", "Bevy", "WASM", "LDTK"],
    link: "https://dsfhdshdjtsb.itch.io/dungeon-deja-vu",
    github: "https://github.com/ambareesh1510/dungeon-deja-vu",
    video: "b93eb75e72e94756b28e0ad00e4ffc1f",
  },
  {
    name: "Daedalus",
    description:
      "My own esoteric programming language, built with Rust. Write and solve mazes that form instructions to control a stack machine. Develop puzzles with the React.js IDE.",
    tech: ["Rust", "React", "WebGL"],
    link: "https://daedalus-ide.vercel.app/",
    video: "123e094d330103ad870011cbb61d24f5",
  },
  {
    name: "Landing",
    description:
      "A full-stack todo-list app built with Prisma, Next.js, and Postgres. Features OAuth2 GitHub login and built-in Codeforces integration with a responsive frontend.",
    tech: ["Next.js", "Prisma", "Postgres"],
    link: "https://landing.raybb.dev/",
    video: "a9729e3142800b180f16d327fa19ba87",
  },
  {
    name: "Algo Library",
    description:
      "A competitive programming algorithm and debugging library for Codeforces. A single-header C++ debugger that abuses generics and recursion to visualize deeply nested data structures.",
    tech: ["C++", "Templates"],
    github: "https://github.com/raybbian/comp-programming",
  },
];
