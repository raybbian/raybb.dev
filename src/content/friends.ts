export type Friend = {
  name: string;
  blurb: string;
  href: string;
  // Path under /public (e.g. "/friends/jane.jpg") or absolute URL.
  photo: string;
  highlight?: boolean;
};

export const friends: Friend[] = [
  {
    name: "Vivian Gu",
    blurb:
      "Super talented artist, designer, and programmer. My partner and biggest supporter, always motivating me to be the best version of myself that I can be.",
    href: "https://viviangu.me/",
    photo:
      "https://cdn.discordapp.com/avatars/333414804121321473/3db2ba7d6e75e8f8308683ac970da67a.webp",
    highlight: true,
  },
  {
    name: "Chris Lee",
    blurb:
      "The best tech artist I know, creates insane VFX and is lowkey good at everything else too.",
    href: "https://chrysly.me/",
    photo:
      "https://cdn.discordapp.com/avatars/656359703944888330/18ecaea322e4c086f5ebf778c8ecc926.webp",
  },
  {
    name: "Vu Nguyen",
    blurb:
      "3D Artist and Animation GOAT, hella inspiring and also makes very yummy drinks.",
    href: "https://lomdevs.carrd.co/",
    photo:
      "https://cdn.discordapp.com/avatars/191397436739026955/e98a43c063895183aa0faf476ec5745e.webp",
  },
  {
    name: "Grace Shao",
    blurb:
      "Cracked developer and fellow team lead, builds tons of insanely cool things.",
    href: "https://sites.google.com/view/grace-shao-cs-portfolio/home",
    photo:
      "https://cdn.discordapp.com/avatars/577816126747181067/e65ac78330fd183f39ec61eb87d29c60.webp",
  },
  {
    name: "David Tran",
    blurb: "Goated game dev + systems programmer, also (past) VGDev team lead.",
    href: "https://noshen.dev/",
    photo:
      "https://cdn.discordapp.com/avatars/173265449033793536/7fc2ef2519ed4b8b09ffb33ea9030a28.webp",
  },
];
