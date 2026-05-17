export const profile = {
  firstName: "Raymond",
  fullName: "Raymond Bian",
  greeting: "Hi, I'm",
  subtitle:
    "CS & Math @ Georgia Tech. I build games, systems software, and procedurally animated things — like the koi swimming behind this page.",
  bio: "Computer Science and Math major at the Georgia Institute of Technology. Incoming SWE intern at Jane Street; previously interned at GEICO and researched ground software for the NASA-partnered GPDM cubesat. Into competitive programming, game development, and making cool stuff.",
  socials: {
    github: "https://github.com/raybbian",
    linkedin: "https://linkedin.com/in/raybbian",
    email: "raybbian@gmail.com",
    codeforces: "https://codeforces.com/profile/raybb",
  },
};

export const sections = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "projects", label: "Projects" },
  { id: "experience", label: "Experience" },
] as const;
