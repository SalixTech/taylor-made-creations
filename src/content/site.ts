/** Owner-editable public content. No credentials or client data belong here. */
export type CommissionStatus = "Opening Soon!" | "Closed" | "Open!";
export const site = {
  name: "Taylor Made Creations",
  originalUrl: "https://taymadecreations.wixstudio.com/fursuits",
  commissionStatus: "Opening Soon!" as CommissionStatus,
  statusNote: "Get ready by choosing your suit type, preparing your reference sheet and reading the commission terms.",
  showPremades: true,
  telegram: "GD_Taylor",
  discord: "gd_taylor",
};
export const priceGroups = [
  { title: "Heads", note: "A character, brought to life.", items: [{ name: "Head", price: 1100, detail: "Head-only commission." }] },
  { title: "Partials", note: "Start with your favorite pieces.", items: [{ name: "Mini partial", price: 1600, detail: "Head, tail and handpaws." }, { name: "Full partial", price: 2000, detail: "Head, tail, handpaws, armsleeves and feetpaws." }] },
  { title: "Fullsuits", note: "The complete character.", items: [{ name: "Plantigrade", price: 3000, detail: "Full-body suit." }, { name: "Digitigrade", price: 3300, detail: "Full-body suit with shaped legs." }] },
];
export const parts = [["Handpaws",250],["Feetpaws",325],["Short tail",80],["Large tail",175],["Floor-dragging tail",275],["Armsleeves",150],["Plantigrade bodysuit only",800],["Digitigrade bodysuit only",1000]] as const;
export const extras = [["NFC chips (each)",5],["Removable eyelids",50],["Squeakers (each)",10],["Extra tongues (each)",40],["Pickable nose",50],["Hidden pockets",75],["Plush claws",20],["Sandals",80],["Handpaw finger escapes",250]] as const;
export const gallery = Array.from({length:6}, (_, i) => ({src:`/images/gallery-${String(i+1).padStart(2,"0")}.webp`,alt:`Fursuit work from Taylor Made Creations’ existing gallery, photo ${i+1}`}));
export type Premade = { id: string; name: string; image: string; description: string; visible: boolean };
// Empty until the owner adds verified listings. No checkout is connected.
export const premades: Premade[] = [];
export const sourceReview = { date: "2026-10-25", prices: `${site.originalUrl}/prices`, care: `${site.originalUrl}/suitcare`, terms: `${site.originalUrl}/tos`, contact: `${site.originalUrl}/contact` };
